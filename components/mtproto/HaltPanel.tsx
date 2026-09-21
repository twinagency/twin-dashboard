import Link from "next/link";
import { describeEvent } from "@/lib/mtproto/event-format";
import type { AutoHaltInfo, ReengageEvent } from "@/lib/mtproto/types";
import { EmptyBlock, Notice, Panel, When } from "./kit";
import { timeAgo } from "./view";

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
    <Panel
      title="Account halts"
      tip="Moments where a creator's account was stopped, either by the automatic safety checks (too many opt-outs, complaints or errors) or by Telegram. Resuming an auto-halt needs a typed confirmation on the Connections page."
    >
      <div className="space-y-3">
        {error && <Notice tone="warn">Could not read halts ({error}); this is unknown, not &quot;none&quot;.</Notice>}
        {pausedNow.map((p) => (
          <div key={p.cloneId} className="rounded-xl border border-crit/40 bg-crit/10 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-crit px-1.5 py-0.5 text-[11px] font-bold text-white">{p.info ? "AUTO-HALTED" : "PAUSED"}</span>
              <span className="font-semibold text-ink">{p.name}</span>
              <span className="text-muted">{p.info ? p.info.label : (p.reason ?? "no reason recorded")}</span>
            </div>
            {p.info?.tripped && <div className="mt-1 text-xs text-ink">{p.info.tripped}</div>}
            {p.info?.threshold && <div className="text-xs text-muted">{p.info.threshold}</div>}
            <Link href="/mtproto-campaign/connections" className="mt-1.5 inline-block text-xs font-semibold text-accent-2 underline-offset-2 hover:underline">
              Open Connections
            </Link>
          </div>
        ))}
        {events.length === 0 && pausedNow.length === 0 && !error ? (
          <EmptyBlock icon="✓" title="No halts on this run" hint="No account was stopped while this run was going." />
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const d = describeEvent(e);
              return (
                <li key={e.id} className="rounded-xl border border-crit/30 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 text-muted">
                    <span className="font-semibold text-ink">{e.cloneId ? (creatorNames[e.cloneId] ?? e.cloneId) : "Whole fleet"}</span>
                    <When iso={e.ts} relative={timeAgo(e.ts)} />
                  </div>
                  <div className="mt-0.5 text-ink">{d?.text ?? JSON.stringify(e.detail)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
