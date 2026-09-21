import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCreators } from "@/lib/mtproto/clones";
import { listRuns } from "@/lib/mtproto/runs";
import { listAllEventsForRun } from "@/lib/mtproto/events";
import { listEpisodesForRun } from "@/lib/mtproto/episodes";
import { computeFunnel } from "@/lib/mtproto/funnel";
import { computeSafetySnapshots } from "@/lib/mtproto/safety";
import { currentGlobalStop } from "./actions";
import GlobalStopControl from "@/components/mtproto/GlobalStopControl";
import FunnelCard from "@/components/mtproto/FunnelCard";
import SafetyPanel from "@/components/mtproto/SafetyPanel";
import RunStatusBadge from "@/components/mtproto/RunStatusBadge";

export const dynamic = "force-dynamic";

// MTProto Campaign — Overview. Own top-level area (N7: "It is its OWN system,
// not part of Flows/win-back"), self-contained data layer under lib/mtproto/.
// Fleet-wide funnel across every run, safety per creator, the run list, and
// the Global Stop control (kill-switch layer 4 of 4 — section G).
export default async function MtprotoCampaignPage() {
  const [creators, runs, globalStopped] = await Promise.all([listCreators(), listRuns(20), currentGlobalStop()]);

  // Fleet funnel = union of every run's episodes, bounded per run (each read
  // is already bounded by run_id — see lib/mtproto/episodes.ts). Runs list is
  // itself capped at 20, so this stays a small, predictable fan-out.
  const episodeSets = await Promise.all(runs.map((r) => listEpisodesForRun(r.id)));
  const allEpisodes = episodeSets.flatMap((s) => s.episodes);
  const anyTruncated = episodeSets.some((s) => s.truncated);
  const funnel = await computeFunnel(allEpisodes);
  const safety = await computeSafetySnapshots(creators);

  return (
    <div className="dashboard-page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold">MTProto Campaign</h1>
          <p className="text-sm text-muted-foreground">
            Re-engage silent fans over each creator&apos;s own Telegram session. Ronan presses Run — nothing here sends by itself.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GlobalStopControl stopped={globalStopped} />
          <Link href="/mtproto-campaign/connections">
            <Button variant="outline">Connections</Button>
          </Link>
          <Link href="/mtproto-campaign/new">
            <Button>New run</Button>
          </Link>
        </div>
      </div>

      {globalStopped && (
        <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          GLOBAL STOP is active. No creator&apos;s userbot will send anything until it is lifted.
        </div>
      )}

      <FunnelCard title="Fleet funnel" subtitle={`Across the last ${runs.length} run(s)${anyTruncated ? " — partial, some runs truncated their episode read" : ""}`} funnel={funnel} />

      <div className="mt-6">
        <SafetyPanel snapshots={safety} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No runs yet. <Link href="/mtproto-campaign/new" className="underline">Build one</Link> — it previews before it ever writes anything.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((run) => (
                <Link
                  key={run.id}
                  href={`/mtproto-campaign/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <RunStatusBadge status={run.status} />
                      {run.dryRun ? <Badge variant="outline">dry run</Badge> : <Badge variant="destructive">LIVE</Badge>}
                      <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {run.cloneIds.length} creator(s) · cap {run.dailyCap}/day · hold-out {run.holdoutPct}%
                      {run.note ? ` · ${run.note}` : ""}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
