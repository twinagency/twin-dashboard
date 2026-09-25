import type { BundleCloneResult, BundleFleetResult, BundleRecentSend } from "@/lib/mtproto/bundle-results";
import { PURCHASE_WINDOW_DAYS } from "@/lib/mtproto/bundle-results";
import { EmptyBlock, Kpi, Notice, Panel, StatusPill } from "./kit";
import { num, pct, timeAgo, type Tone } from "./view";

// Results of the "bundle on reply" push, fleet wide and per creator. Read only:
// no controls here, the switch lives in the database (bundle_push_config) and
// nothing on this panel can send. Purchases are matched by fan, price and time
// (see lib/mtproto/bundle-results.ts), which the hover hints say plainly.

const STATE: Record<BundleRecentSend["state"], { label: string; tone: Tone }> = {
  pending: { label: "Queued", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "good" },
  failed: { label: "Failed", tone: "crit" },
  uncertain: { label: "Maybe sent", tone: "warn" },
  skipped: { label: "Held back", tone: "neutral" },
};

const BUNDLE_TIP =
  `A bundle counts as bought when the same fan paid for a bundle at exactly the price we sent, after the send, within ${PURCHASE_WINDOW_DAYS} days. Telegram does not say which bundle a payment unlocked, so a fan who buys a different bundle at the same price could be counted. Duplicate ledger rows are collapsed first.`;

function ConfigPill({ c }: { c: BundleCloneResult["config"] }) {
  if (!c) return <StatusPill tone="neutral">Not set up</StatusPill>;
  if (c.enabled) return <StatusPill tone="good" dot title="Switched on for this creator.">On</StatusPill>;
  if (c.placeholder) return <StatusPill tone="neutral" title="Placeholder row: no bundle or caption chosen yet.">Off, needs setup</StatusPill>;
  return <StatusPill tone="warn" title="Configured but switched off.">Off</StatusPill>;
}

function RecentList({ rows }: { rows: BundleRecentSend[] }) {
  if (rows.length === 0) return <div className="text-xs text-muted">No sends yet.</div>;
  return (
    <ul className="divide-y divide-line text-xs">
      {rows.map((r, i) => {
        const st = STATE[r.state];
        return (
          <li key={`${r.telegramId}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-mono text-ink">{r.telegramId}</span>
            <StatusPill tone={st.tone} dot>{st.label}</StatusPill>
            <span className="text-muted">{r.trigger === "backfill" ? "backfill" : "reply"}</span>
            {r.starPrice ? <span className="tabular-nums text-muted">{num(r.starPrice)} ⭐</span> : null}
            <span className="text-muted">{timeAgo(r.sentAt ?? r.createdAt)}</span>
            {r.error && <span className="text-crit">{r.error}</span>}
            <span className={`ml-auto ${r.boughtStars ? "font-semibold text-good" : "text-muted"}`}>{r.boughtStars ? `Bought ${num(r.boughtStars)} ⭐` : r.state === "sent" ? "Not bought" : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function BundleResultsPanel({ results }: { results: BundleFleetResult }) {
  if (!results.available) {
    return (
      <Panel title="Bundle on reply" tip="One paid bundle sent to fans who answer a re-engagement message. Nothing has been set up yet.">
        <EmptyBlock icon="◇" title="Not set up yet" hint="The bundle tables do not exist in this database yet. Nothing has been sent." />
      </Panel>
    );
  }
  if (results.error) {
    return (
      <Panel title="Bundle on reply">
        <Notice tone="warn" title="Could not read the results">{results.error}</Notice>
      </Panel>
    );
  }
  const t = results.totals;
  const empty = results.clones.length === 0;
  return (
    <Panel
      title="Bundle on reply"
      tip="Fans who answered a re-engagement message get ONE paid bundle, unless they opted out or were hostile. This is read only: what happened, and what it earned."
    >
      {results.truncated && <Notice tone="warn" className="mb-3">A read was cut short, so figures here are lower bounds.</Notice>}
      {empty ? (
        <EmptyBlock icon="◇" title="No bundle activity yet" hint="Nothing has been queued or sent. It stays off until a creator's bundle setup is switched on." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Replies eligible" tip="Replies that were not opt-out or hostile, so the fan qualifies for the bundle." value={num(t.eligible)} sub={`${num(t.negative)} refused (opt-out or hostile)`} />
            <Kpi label="Bundles sent" tip="Telegram accepted the paid bundle." value={num(t.sent)} sub={`${num(t.sentByReply)} on reply, ${num(t.sentByBackfill)} backfill`} />
            <Kpi label="Waiting" tip="Queued and not sent yet: waiting on the delay, the hourly limit, or the sender being off." value={num(t.pending)} />
            <Kpi label="Failed" tip="Telegram refused it, or it may have been delivered but we could not confirm. Reasons are listed under each creator." value={num(t.failed + t.uncertain)} tone={t.failed + t.uncertain > 0 ? "crit" : "neutral"} sub={t.uncertain > 0 ? `${num(t.uncertain)} may have gone out` : undefined} />
            <Kpi label="Held back" tip="Eligible but stopped by a safety gate: outside the 24 hour reply window, paused fan, test user, and similar." value={num(t.gated)} />
            <Kpi label="Purchases" tip={BUNDLE_TIP} value={num(t.purchases)} sub={t.conversion == null ? undefined : `${pct(t.conversion)} of sent`} />
            <Kpi label="Stars earned" tip={BUNDLE_TIP} value={`${num(t.stars)} ⭐`} tone="good" />
          </div>

          <div className="mt-4 space-y-2">
            {results.clones.map((c) => (
              <details key={c.cloneId} className="rounded-xl border border-line bg-panel px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <ConfigPill c={c.config} />
                  <span className="text-muted">eligible <b className="text-ink">{num(c.eligible)}</b></span>
                  <span className="text-muted">sent <b className="text-ink">{num(c.sent)}</b></span>
                  <span className="text-muted">failed <b className={c.failed + c.uncertain ? "text-crit" : "text-ink"}>{num(c.failed + c.uncertain)}</b></span>
                  <span className="text-muted">bought <b className="text-ink">{num(c.purchases)}</b>{c.conversion != null ? ` (${pct(c.conversion)})` : ""}</span>
                  <span className="ml-auto font-semibold tabular-nums text-good">{num(c.stars)} ⭐</span>
                </summary>
                <div className="mt-3 space-y-3">
                  {c.config && (
                    <div className="text-xs text-muted">
                      Price {c.config.starPrice ? `${num(c.config.starPrice)} ⭐` : "not set"}, delay {c.config.delaySeconds}s, caption: <span className="text-ink">{c.config.captionPreview || "none"}</span>
                    </div>
                  )}
                  {c.failureReasons.length > 0 && (
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Why some did not go out</div>
                      <ul className="space-y-0.5 text-xs">
                        {c.failureReasons.map((f) => (
                          <li key={f.reason} className="flex justify-between gap-3"><span className="text-ink">{f.reason}</span><span className="tabular-nums text-muted">{num(f.count)}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Recent sends</div>
                    <RecentList rows={c.recent} />
                  </div>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
