import Link from "next/link";
import GlobalStopControl from "./GlobalStopControl";
import { getGlobalStop, getRecentRuns, getSafety } from "./data";
import { Meter, StatusPill } from "./kit";
import { num, runIsSendingLive } from "./view";

// The strip at the top of every MTProto Campaign screen: is anything sending
// for real, is the global stop on, how much of today's cap is used, who is
// paused, and the big red Stop. It only READS; the stop itself is the same
// GlobalStopControl and server action as before.
export default async function SafetyStrip() {
  const [stop, safety, runs] = await Promise.all([getGlobalStop(), getSafety(), getRecentRuns().catch(() => null)]);

  const stopped = stop.error ? null : stop.stopped;
  const liveRuns = (runs ?? []).filter(runIsSendingLive);
  const snaps = safety.snapshots;
  const sendable = snaps.filter((s) => s.connectionStatus === "connected" && !s.paused);
  const sentToday = snaps.reduce((a, s) => a + s.sentToday, 0);
  const capToday = sendable.reduce((a, s) => a + s.dailyCap, 0);
  const autoHalted = snaps.filter((s) => s.paused && s.autoHalt).length;
  const pausedByHand = snaps.filter((s) => s.paused && !s.autoHalt).length;

  const frame = stopped ? "border-crit/50 bg-crit/5" : stopped === null ? "border-warn/50 bg-warn/5" : "border-line bg-panel";

  return (
    <section aria-label="Safety" className={`mb-5 rounded-2xl border p-3 shadow-[var(--shadow-card)] sm:p-4 md:sticky md:top-2 md:z-20 ${frame}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          <Cell label="Mode">
            {runs === null ? (
              <StatusPill tone="warn">Unknown</StatusPill>
            ) : liveRuns.length > 0 ? (
              <StatusPill solid dot>LIVE</StatusPill>
            ) : (
              <StatusPill tone="info" dot>Dry run only</StatusPill>
            )}
            <Sub>
              {runs === null
                ? "Could not read the runs"
                : liveRuns.length > 0
                  ? `${liveRuns.length} live run${liveRuns.length === 1 ? "" : "s"} can send`
                  : "No real messages are going out"}
            </Sub>
          </Cell>

          <Cell label="Global stop">
            {stopped === null ? (
              <StatusPill tone="warn" dot>Unreadable</StatusPill>
            ) : stopped ? (
              <StatusPill tone="crit" dot>ON, all halted</StatusPill>
            ) : (
              <StatusPill tone="good" dot>Off</StatusPill>
            )}
            <Sub>{stopped === null ? "Treat sending as possibly active" : stopped ? "Nobody sends until lifted" : "Sending is allowed"}</Sub>
          </Cell>

          <Cell label="Sent today / cap">
            {safety.error ? (
              <StatusPill tone="warn">Unreadable</StatusPill>
            ) : (
              <>
                <div className="font-heading text-lg font-semibold tabular-nums text-ink">
                  {num(sentToday)} <span className="text-sm font-medium text-muted">/ {num(capToday)}</span>
                </div>
                <Meter value={sentToday} max={capToday} className="mt-1" />
              </>
            )}
          </Cell>

          <Cell label="Creators halted">
            {safety.error ? (
              <StatusPill tone="warn">Unreadable</StatusPill>
            ) : autoHalted + pausedByHand === 0 ? (
              <StatusPill tone="good" dot>None</StatusPill>
            ) : (
              <>
                <div className={`font-heading text-lg font-semibold tabular-nums ${autoHalted > 0 ? "text-crit" : "text-warn"}`}>{autoHalted + pausedByHand}</div>
                <Sub>
                  {autoHalted > 0 ? `${autoHalted} auto-halted` : ""}
                  {autoHalted > 0 && pausedByHand > 0 ? ", " : ""}
                  {pausedByHand > 0 ? `${pausedByHand} paused by hand` : ""}{" "}
                  <Link href="/mtproto-campaign/connections" className="font-semibold text-accent-2 underline-offset-2 hover:underline">See who</Link>
                </Sub>
              </>
            )}
          </Cell>
        </div>

        <GlobalStopControl stopped={stopped} />
      </div>

      {stop.error && (
        <div role="alert" className="mt-3 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
          Cannot read the global stop flag ({stop.error}). Treat sending as possibly ACTIVE; press GLOBAL STOP if in doubt.
        </div>
      )}
      {stopped && (
        <div role="alert" className="mt-3 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
          GLOBAL STOP is active. No creator&apos;s userbot will send anything until it is lifted.
        </div>
      )}
      {safety.error && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
          Today&apos;s safety numbers could not be read ({safety.error}). This is unknown, not zero.
        </div>
      )}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mt-0.5 text-[11px] leading-snug text-muted">{children}</div>;
}
