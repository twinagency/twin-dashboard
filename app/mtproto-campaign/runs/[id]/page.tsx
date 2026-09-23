import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRun } from "@/lib/mtproto/runs";
import { checkReviewGate, computeDryRunSummary, computeSendPlan, latestReview } from "@/lib/mtproto/review";
import DryRunReview, { type ReviewState } from "@/components/mtproto/DryRunReview";
import { listEpisodesForRun } from "@/lib/mtproto/episodes";
import { computeFunnel, computeOptOuts } from "@/lib/mtproto/funnel";
import { listEvents } from "@/lib/mtproto/events";
import { connectionFor, listConnections } from "@/lib/mtproto/connections";
import { autoHaltsFor } from "@/lib/mtproto/halt-server";
import HaltPanel, { type PausedNow } from "@/components/mtproto/HaltPanel";
import { computeLift, loadPurchasesForEpisodes } from "@/lib/mtproto/attribution";
import { buildSendRows } from "@/lib/mtproto/sends";
import { listCreators } from "@/lib/mtproto/clones";
import RunStatusBadge from "@/components/mtproto/RunStatusBadge";
import RunControls from "@/components/mtproto/RunControls";
import FunnelCard from "@/components/mtproto/FunnelCard";
import LiftCard from "@/components/mtproto/LiftCard";
import LiveFeed from "@/components/mtproto/LiveFeed";
import SendsTable from "@/components/mtproto/SendsTable";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();

  const [{ episodes, truncated }, creators] = await Promise.all([listEpisodesForRun(id), listCreators()]);
  // ONE star_transactions read feeds the funnel, the lift table and the sends table.
  // Live only: exclude dry-run episodes
  const liveEpisodes = episodes.filter((e) => !e.dryRun);
  const purchases = await loadPurchasesForEpisodes(liveEpisodes);
  const lift = await computeLift(liveEpisodes, purchases);
  const [funnel, sends, optOuts] = await Promise.all([computeFunnel(liveEpisodes, lift), buildSendRows(liveEpisodes, creators, purchases), computeOptOuts(liveEpisodes, creators)]);

  // Account halts: the run's own account_halt events, plus any of its creators
  // that are paused/auto-halted right now. A failed read is shown, not hidden.
  let haltEvents: Awaited<ReturnType<typeof listEvents>> = [];
  let haltError: string | null = null;
  let pausedNow: PausedNow[] = [];
  try {
    haltEvents = await listEvents({ runId: id, eventType: "account_halt", limit: 50 });
    const conns = await listConnections();
    const autoInfo = await autoHaltsFor(conns.filter((c) => run.cloneIds.includes(c.cloneId)));
    pausedNow = run.cloneIds
      .map((cid) => connectionFor(cid, conns))
      .filter((c) => c.paused)
      .map((c) => ({ cloneId: c.cloneId, name: creators.find((x) => x.id === c.cloneId)?.name ?? c.cloneId, reason: c.pausedReason, info: autoInfo.get(c.cloneId) ?? null }));
  } catch (e) {
    haltError = e instanceof Error ? e.message : String(e);
  }

  // Dry-run review card: only for a finished, unstopped dry run.
  let reviewCard: React.ReactNode = null;
  let reviewed = false;
  let plan: Awaited<ReturnType<typeof computeSendPlan>> | null = null;
  if (run.dryRun && run.status === "done" && !run.stopRequested) {
    try {
      const summary = await computeDryRunSummary(id);
      plan = await computeSendPlan(run, summary);
      const gate = await checkReviewGate(run);
      let state: ReviewState;
      if (gate.ok) {
        reviewed = true;
        state = { reviewed: true, by: gate.review.reviewedBy, at: gate.review.reviewedAt };
      } else {
        const prior = await latestReview(id).catch(() => null);
        state = { reviewed: false, reason: prior ? gate.reason : "no review recorded yet" };
      }
      reviewCard = (
        <div className="mb-6">
          <DryRunReview runId={id} summary={summary} plan={plan} creatorNames={Object.fromEntries(creators.map((c) => [c.id, c.name]))} state={state} />
        </div>
      );
    } catch (e) {
      reviewCard = (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Could not load the dry-run review, so going live stays locked: {e instanceof Error ? e.message : String(e)}
        </div>
      );
    }
  }

  const failedRows = sends.filter((s) => s.errorCode);
  const failuresByCode = new Map<string, number>();
  for (const r of failedRows) failuresByCode.set(r.errorCode!, (failuresByCode.get(r.errorCode!) ?? 0) + 1);
  const repliedRows = sends.filter((s) => s.repliedAt);

  return (
    <div className="dashboard-page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Run</h1>
            <RunStatusBadge status={run.status} />
            {run.dryRun ? <Badge variant="outline">dry run</Badge> : <Badge variant="destructive">LIVE</Badge>}
            {run.stopRequested && <Badge variant="destructive">stop requested</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Created {new Date(run.createdAt).toLocaleString()} by {run.createdBy} · {run.cloneIds.length} creator(s) · daily cap{" "}
            {run.dailyCap} · hold-out {run.holdoutPct}%{run.runCap ? ` · run cap ${run.runCap}` : ""}
          </p>
        </div>
        <RunControls run={run} reviewed={reviewed} plan={plan} />
      </div>

      {truncated && (
        <div className="mb-5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          This run has more episodes than one read can safely hold — figures below are a lower bound. Narrow the date range or filters.
        </div>
      )}

      {reviewCard}

      <FunnelCard title="Funnel" funnel={truncated ? { ...funnel, partial: true } : funnel} optOuts={optOuts} />

      <div className="mt-6">
        <HaltPanel events={haltEvents} pausedNow={pausedNow} error={haltError} creatorNames={Object.fromEntries(creators.map((c) => [c.id, c.name]))} />
      </div>

      <div className="mt-6">
        <LiftCard reports={lift} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <LiveFeed runId={id} />
        <Card>
          <CardHeader>
            <CardTitle>Failures</CardTitle>
          </CardHeader>
          <CardContent>
            {failuresByCode.size === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No failures.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...failuresByCode.entries()].map(([code, count]) => (
                  <li key={code} className="flex justify-between rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1">
                    <span className="font-mono text-xs">{code}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <SendsTable runId={id} rows={sends} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Replies ({repliedRows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {repliedRows.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No replies yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {repliedRows.map((r) => (
                  <li key={r.episodeId} className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1">
                    <span>
                      {r.cloneName} · fan {r.telegramId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      replied {r.repliedAt ? new Date(r.repliedAt).toLocaleString() : ""}
                      {r.boughtStars ? ` · bought ${r.boughtStars}⭐` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
