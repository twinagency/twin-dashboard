import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { describeEvent } from "@/lib/mtproto/event-format";
import type { AutoHaltInfo, ReengageEvent } from "@/lib/mtproto/types";

export type PausedNow = { cloneId: string; name: string; reason: string | null; info: AutoHaltInfo | null };

// Run-detail card: account_halt events for this run (spike auto-halts with
// their stats and threshold, plus flood halts) and which of the run's creators
// are paused right now. A failed read is shown, never rendered as "no halts".
export default function HaltPanel({
  events,
  pausedNow,
  error,
  creatorNames,
}: {
  events: ReengageEvent[];
  pausedNow: PausedNow[];
  error: string | null;
  creatorNames: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account halts</CardTitle>
        <CardDescription>Spike auto-halts and account errors. Resuming an auto-halt needs a typed confirmation on the Connections page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">Could not read halts ({error}); this is unknown, not "none".</div>
        )}
        {pausedNow.map((p) => (
          <div key={p.cloneId} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <span className="mr-2 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold text-white">{p.info ? "AUTO-HALTED" : "PAUSED"}</span>
            <span className="font-medium">{p.name}</span>
            <span className="ml-2 text-muted-foreground">{p.info ? p.info.label : (p.reason ?? "no reason recorded")}</span>
            {p.info?.tripped && <div className="mt-1 text-xs">{p.info.tripped}</div>}
            {p.info?.threshold && <div className="text-xs text-muted-foreground">{p.info.threshold}</div>}
            <Link href="/mtproto-campaign/connections" className="mt-1 inline-block text-xs underline">
              Connections
            </Link>
          </div>
        ))}
        {events.length === 0 && pausedNow.length === 0 && !error ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No halts on this run.</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {events.map((e) => {
              const d = describeEvent(e);
              return (
                <li key={e.id} className="rounded border border-destructive/30 px-2 py-1">
                  <span className="mr-2 text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                  <span className="font-medium">{e.cloneId ? (creatorNames[e.cloneId] ?? e.cloneId) : "fleet"}</span>
                  <div>{d?.text ?? JSON.stringify(e.detail)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
