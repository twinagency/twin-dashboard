import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listEpisodesForRun } from "@/lib/mtproto/episodes";
import { computeFunnel, computeOptOuts } from "@/lib/mtproto/funnel";
import { computeLift, loadPurchasesForEpisodes } from "@/lib/mtproto/attribution";
import { getCreators, getRecentRuns, getSafety } from "@/components/mtproto/data";
import FunnelCard from "@/components/mtproto/FunnelCard";
import KpiStrip from "@/components/mtproto/KpiStrip";
import LiftCard from "@/components/mtproto/LiftCard";
import SafetyPanel from "@/components/mtproto/SafetyPanel";
import RunStatusBadge, { RunModeBadge } from "@/components/mtproto/RunStatusBadge";
import { EmptyBlock, Notice, Panel, When } from "@/components/mtproto/kit";
import { timeAgo } from "@/components/mtproto/view";

export const dynamic = "force-dynamic";

// MTProto Campaign, Overview. Own top-level area (N7: "It is its OWN system,
// not part of Flows/win-back"), self-contained data layer under lib/mtproto/.
// The safety strip and the Global Stop live in the layout so they are on every
// screen; this page is the numbers: KPIs, funnel, lift, creator health, runs.
export default async function MtprotoCampaignPage() {
  const [creators, runs] = await Promise.all([getCreators(), getRecentRuns()]);

  // Fleet funnel = union of every run's episodes, bounded per run (each read
  // is already bounded by run_id) and per page (10k episodes per run) so the
  // overview stays a small, predictable fan-out. ONE purchase read feeds both
  // the funnel and the lift card. The truncation warning covers capped reads.
  const episodeSets = await Promise.all(runs.map((r) => listEpisodesForRun(r.id, 10_000)));
  const allEpisodes = episodeSets.flatMap((s) => s.episodes);
  const purchases = await loadPurchasesForEpisodes(allEpisodes);
  const lift = await computeLift(allEpisodes, purchases);
  const [funnel, optOuts, safety] = await Promise.all([computeFunnel(allEpisodes, lift), computeOptOuts(allEpisodes, creators), getSafety()]);
  const anyTruncated = episodeSets.some((s) => s.truncated);
  const fleetFunnel = anyTruncated ? { ...funnel, partial: true } : funnel;

  return (
    <div className="space-y-5">
      <KpiStrip funnel={fleetFunnel} optOuts={optOuts} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <FunnelCard
          title="Fleet funnel"
          subtitle={`Last ${runs.length} run${runs.length === 1 ? "" : "s"}${anyTruncated ? ", some cut short" : ""}`}
          funnel={fleetFunnel}
          optOuts={optOuts}
        />
        <LiftCard reports={lift} />
      </div>

      {safety.error ? (
        <Notice tone="warn" title="Creator health could not be read">
          {safety.error}. This is unknown, not fine.
        </Notice>
      ) : (
        <SafetyPanel snapshots={safety.snapshots} />
      )}

      <Panel
        title="Runs"
        tip="Every campaign run, newest first. A dry run is a rehearsal and sends nothing. LIVE runs send real messages."
        actions={
          <Link href="/mtproto-campaign/new">
            <Button size="sm">New run</Button>
          </Link>
        }
      >
        {runs.length === 0 ? (
          <EmptyBlock
            icon="▶"
            title="No runs yet"
            hint="Start with a dry run: nothing is sent. You will see who it would reach and the exact messages before anything can go live."
            action={
              <Link href="/mtproto-campaign/new">
                <Button>Start a dry run</Button>
              </Link>
            }
          />
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={`/mtproto-campaign/runs/${run.id}`} className="flex flex-col gap-1.5 rounded-lg px-2 py-3 transition hover:bg-muted/5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <RunModeBadge dryRun={run.dryRun} />
                    <RunStatusBadge status={run.status} />
                    {run.stopRequested && <span className="rounded-full bg-crit/15 px-2.5 py-0.5 text-xs font-semibold text-crit">Stop pressed</span>}
                    <When iso={run.createdAt} relative={timeAgo(run.createdAt)} className="text-sm text-muted" />
                  </div>
                  <div className="text-xs text-muted">
                    {run.cloneIds.length} creator{run.cloneIds.length === 1 ? "" : "s"} · up to {run.dailyCap} a day each · {run.holdoutPct}% held back
                    {run.note ? ` · ${run.note}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
