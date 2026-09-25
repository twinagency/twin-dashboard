import { listEpisodesForRun } from "@/lib/mtproto/episodes";
import { computeFunnel } from "@/lib/mtproto/funnel";
import { buildSendRows } from "@/lib/mtproto/sends";
import { loadPurchasesForEpisodes } from "@/lib/mtproto/attribution";
import { listConnections } from "@/lib/mtproto/connections";
import { getCreators, getRecentRuns } from "@/components/mtproto/data";
import BundleResultsPanel from "@/components/mtproto/BundleResultsPanel";
import { loadBundleResults } from "@/lib/mtproto/bundle-results";
import ActivityFeed, { type ActivityRunRow } from "@/components/mtproto/ActivityFeed";
import { SEGMENT_LABEL } from "@/components/mtproto/view";
import type { SendRow } from "@/lib/mtproto/types";

export const dynamic = "force-dynamic";

const RECENT_SENDS_LIMIT = 300;

// MTProto Campaign, Activity tab. One client component (ActivityFeed) owns
// both the run list and the message log underneath, so clicking a run
// selects and filters in place instead of navigating away. This server
// component only reads and shapes the data. Fleet KPIs, funnel and lift
// detail live on each run's own page (linked from here as "Full details").
export default async function MtprotoCampaignPage() {
  const [creators, allRuns, connections] = await Promise.all([getCreators(), getRecentRuns(), listConnections()]);
  const runs = allRuns.filter((run) => !run.dryRun);
  const nameFor = (id: string) => creators.find((c) => c.id === id)?.name ?? id;
  const connFor = (id: string) => connections.find((c) => c.cloneId === id) ?? null;

  const perRun = await Promise.all(
    runs.map(async (run) => {
      const { episodes } = await listEpisodesForRun(run.id, 10_000);
      const purchases = await loadPurchasesForEpisodes(episodes);
      const liveEpisodes = episodes.filter((e) => !e.dryRun);
      const [funnel, sendRows] = await Promise.all([
        computeFunnel(liveEpisodes, undefined),
        buildSendRows(liveEpisodes, creators, purchases),
      ]);
      const sent = liveEpisodes.filter((e) => e.state === "sent" || e.state === "acked" || e.state === "replied").length;
      const replied = liveEpisodes.filter((e) => e.state === "replied").length;
      const heldBack = liveEpisodes.filter((e) => e.state === "holdout").length;
      const queued = liveEpisodes.filter((e) => e.state === "eligible" || e.state === "claimed" || e.state === "prepared").length;
      const failed = liveEpisodes.filter((e) => e.state === "failed" || e.state === "uncertain").length;
      return { run, funnel, sendRows, sent, replied, heldBack, queued, failed };
    }),
  );

  const now = Date.now();
  const rows: ActivityRunRow[] = perRun.map(({ run, funnel, sent, replied, heldBack, queued, failed }) => {
    // Any creator on this run currently paused with a resume time in the
    // future (e.g. an auto flood-wait). pausedUntil reads null everywhere
    // until the worker's own DB column for it exists (see connections.ts).
    const waiting = run.cloneIds
      .map(connFor)
      .find((c) => c?.paused && c.pausedUntil && new Date(c.pausedUntil).getTime() > now);
    return {
      id: run.id,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      dryRun: run.dryRun,
      status: run.status,
      stopRequested: run.stopRequested,
      cloneNames: run.cloneIds.map(nameFor).join(", "),
      avatarCloneId: run.cloneIds[0] ?? run.id,
      note: run.note,
      segmentLabel: run.filters.segment ? (SEGMENT_LABEL[run.filters.segment] ?? run.filters.segment) : "All silent fans",
      sent,
      replied,
      converted: funnel.bought,
      heldBack,
      queued,
      failed,
      waitingUntil: waiting?.pausedUntil ?? null,
    };
  });

  const recentSends: (SendRow & { runId: string })[] = perRun
    .flatMap(({ run, sendRows }) => sendRows.map((r) => ({ ...r, runId: run.id })))
    .filter((r) => !r.dryRun)
    .sort((a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime())
    .slice(0, RECENT_SENDS_LIMIT);

  // Bundle-on-reply results (read only, never throws). Additive: the panel sits
  // above the existing feed and shows "Not set up yet" until the tables exist.
  const bundleResults = await loadBundleResults(creators);

  return (
    <div className="space-y-6">
      <BundleResultsPanel results={bundleResults} />
      <ActivityFeed runs={rows} sends={recentSends} />
    </div>
  );
}
