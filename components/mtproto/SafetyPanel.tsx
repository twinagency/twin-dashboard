import Link from "next/link";
import { Panel, EmptyBlock, CreatorAvatar, Meter, StatusPill } from "./kit";
import { connectionStatusInfo, humanError, num, type Tone } from "./view";
import type { SafetySnapshot } from "@/lib/mtproto/types";

// N2.7: sends today vs daily cap, FloodWait/PeerFlood count, last error,
// account health, days clean per creator. Health is a simple traffic light
// (same rule as before): red if any FloodWait/PeerFlood today or an auto-halt,
// amber if a restriction landed within 7 days, green otherwise.
function health(s: SafetySnapshot): { label: string; tone: Tone } {
  if (s.paused && s.autoHalt) return { label: "Problem", tone: "crit" };
  if (s.floodWaitCount > 0) return { label: "Problem", tone: "crit" };
  if (s.daysCleanSinceRestriction != null && s.daysCleanSinceRestriction < 7) return { label: "Watch", tone: "warn" };
  return { label: "Healthy", tone: "good" };
}

export default function SafetyPanel({ snapshots }: { snapshots: SafetySnapshot[] }) {
  return (
    <Panel
      title="Creator health"
      tip="One card per creator: how much of today's cap is used, whether Telegram has told the account to slow down (FloodWait or PeerFlood), how many days it has been clean, and its connection. Problem means Telegram limited it today or a safety check halted it. Watch means it was restricted within the last 7 days."
      actions={
        <Link href="/mtproto-campaign/connections" className="text-xs font-semibold text-accent-2 underline-offset-2 hover:underline">
          Manage connections
        </Link>
      }
    >
      {snapshots.length === 0 ? (
        <EmptyBlock icon="◌" title="No creators yet" hint="Creators show up here once they exist in the dashboard." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshots.map((s) => {
            const h = health(s);
            const conn = connectionStatusInfo({ status: s.connectionStatus, pausedReason: s.pausedReason });
            return (
              <div key={s.cloneId} className={`rounded-2xl border p-3.5 ${h.tone === "crit" ? "border-crit/40 bg-crit/5" : "border-line"}`}>
                <div className="flex items-center gap-3">
                  <CreatorAvatar id={s.cloneId} name={s.cloneName} className="size-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{s.cloneName}</div>
                    <div className="mt-0.5">
                      <StatusPill tone={conn.tone} dot title={conn.hint}>
                        {conn.label}
                      </StatusPill>
                    </div>
                  </div>
                  <StatusPill tone={h.tone}>{h.label}</StatusPill>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
                    <span>Sent today</span>
                    <span className="tabular-nums">
                      <span className="text-sm font-semibold text-ink">{num(s.sentToday)}</span> / {num(s.dailyCap)}
                    </span>
                  </div>
                  <Meter value={s.sentToday} max={s.dailyCap} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/5 px-2.5 py-1.5">
                    <dt className="text-muted">Slow-down warnings today</dt>
                    <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${s.floodWaitCount > 0 ? "text-crit" : "text-ink"}`}>{s.floodWaitCount}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/5 px-2.5 py-1.5">
                    <dt className="text-muted">Clean days in a row</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{s.daysCleanSinceRestriction ?? "none seen"}</dd>
                  </div>
                </dl>

                {s.paused && s.autoHalt ? (
                  <div className="mt-3 space-y-0.5 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2">
                    <span className="inline-block rounded bg-crit px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">AUTO-HALTED</span>
                    <div className="text-xs font-semibold text-crit">{s.autoHalt.label}</div>
                    {s.autoHalt.tripped && <div className="text-xs text-ink">{s.autoHalt.tripped}</div>}
                    {s.autoHalt.threshold && <div className="text-xs text-muted">{s.autoHalt.threshold}</div>}
                    {!s.autoHalt.eventFound && <div className="text-xs text-warn">halt numbers unavailable</div>}
                  </div>
                ) : s.paused ? (
                  <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink">
                    <span className="font-semibold text-warn">Paused by hand</span>
                    {s.pausedReason ? `: ${s.pausedReason}` : ""}
                  </div>
                ) : null}

                {s.lastError && (
                  <div className="mt-3 text-xs text-muted" title={s.lastError}>
                    Last problem: <span className="text-ink">{humanError(s.lastError)}</span> <span className="font-mono text-[11px]">({s.lastError})</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
