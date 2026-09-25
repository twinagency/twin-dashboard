import type { BundleCloneResult, BundleFleetResult, BundleFlowResult, BundleRecentSend } from "@/lib/mtproto/bundle-results";
import { EmptyBlock, Kpi, Notice, Panel, StatusPill } from "./kit";
import { num, pct, timeAgo, type Tone } from "./view";

// Results of "bundle on reply" (a free preview video + a 2-part paid video
// sequence sold over the Business connection), fleet wide, per creator, per
// FLOW — a creator can run several flows at once (different sequences,
// captions, prices). Read only: no controls here, the switch lives in the
// database (bundle_push_config) and nothing on this panel can send. Part
// purchases are matched by the exact entitlement row the sequence feature
// already writes (see lib/mtproto/bundle-results.ts) — no price/time guessing,
// so Part 1 and Part 2 sharing a price is never ambiguous.

const STATE: Record<BundleRecentSend["state"], { label: string; tone: Tone }> = {
  pending: { label: "Queued", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Preview sent", tone: "good" },
  failed: { label: "Failed", tone: "crit" },
  uncertain: { label: "Maybe sent", tone: "warn" },
  skipped: { label: "Held back", tone: "neutral" },
};

const AUDIENCE_LABEL: Record<NonNullable<BundleFlowResult["audience"]>, string> = {
  campaign_repliers: "replied to a re-engagement send",
  active_chatters: "chatting in the last 23h",
};

function FlowPill({ f }: { f: BundleFlowResult }) {
  if (f.enabled) return <StatusPill tone="good" dot title="Switched on for this flow.">On</StatusPill>;
  if (f.placeholder) return <StatusPill tone="neutral" title="Placeholder row: no sequence, prices or a real caption yet.">Off, needs setup</StatusPill>;
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
            <span className="text-muted">{timeAgo(r.sentAt ?? r.createdAt)}</span>
            {r.error && <span className="text-crit">{r.error}</span>}
            <span className="ml-auto flex gap-2">
              <span className={r.part1Bought ? "font-semibold text-good" : "text-muted"}>{r.part1Bought ? `Part 1: ${num(r.part1Bought)} ⭐` : r.state === "sent" ? "Part 1: not bought" : ""}</span>
              <span className={r.part2Bought ? "font-semibold text-good" : "text-muted"}>{r.part2Bought ? `Part 2: ${num(r.part2Bought)} ⭐` : ""}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FlowBlock({ f }: { f: BundleFlowResult }) {
  return (
    <details className="rounded-lg border border-line bg-bg px-3 py-2">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-ink">{f.name}</span>
        <span className="text-muted">({f.flowKey})</span>
        <FlowPill f={f} />
        <span className="text-muted" title={`Audience: fans who are ${AUDIENCE_LABEL[f.audience]}. Priority ${f.priority} (lower goes first).`}>
          {AUDIENCE_LABEL[f.audience]}
        </span>
        <span className="text-muted">eligible <b className="text-ink">{num(f.eligible)}</b></span>
        <span className="text-muted">preview sent <b className="text-ink">{num(f.previewsSent)}</b></span>
        <span className="text-muted">part 1 <b className="text-ink">{num(f.part1Purchases)}</b></span>
        <span className="text-muted">part 2 <b className="text-ink">{num(f.part2Purchases)}</b></span>
        {f.conversion != null && <span className="text-muted">({pct(f.conversion)} of preview slots bought)</span>}
        <span className="ml-auto font-semibold tabular-nums text-good">{num(f.stars)} ⭐</span>
      </summary>
      <div className="mt-2 space-y-2">
        <div className="text-xs text-muted">
          Part 1 {f.part1Price ? `${num(f.part1Price)} ⭐` : "not set"}, Part 2 {f.part2Price ? `${num(f.part2Price)} ⭐` : "not set"}, delay {f.delaySeconds}s, gap to another flow {f.minGapHours}h.
          {" "}Caption: <span className="text-ink">{f.captionPreview || "none"}</span>
        </div>
        {(f.flowGated > 0 || f.gated > 0) && (
          <div className="text-xs text-muted">
            {f.flowGated > 0 && <>held back by another flow (in flight or inside its gap): <b className="text-ink">{num(f.flowGated)}</b>. </>}
            {f.gated > 0 && <>held back by a fan safety gate: <b className="text-ink">{num(f.gated)}</b>.</>}
          </div>
        )}
        {f.failureReasons.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Why some did not go out</div>
            <ul className="space-y-0.5 text-xs">
              {f.failureReasons.map((r) => (
                <li key={r.reason} className="flex justify-between gap-3"><span className="text-ink">{r.reason}</span><span className="tabular-nums text-muted">{num(r.count)}</span></li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Recent sends</div>
          <RecentList rows={f.recent} />
        </div>
      </div>
    </details>
  );
}

function CloneBlock({ c }: { c: BundleCloneResult }) {
  return (
    <details className="rounded-xl border border-line bg-panel px-4 py-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-ink">{c.name}</span>
        <span className="text-muted">{c.flows.length} flow{c.flows.length === 1 ? "" : "s"}</span>
        <span className="text-muted">preview sent <b className="text-ink">{num(c.previewsSent)}</b></span>
        <span className="text-muted">bought <b className="text-ink">{num(c.purchases)}</b></span>
        <span className="ml-auto font-semibold tabular-nums text-good">{num(c.stars)} ⭐</span>
      </summary>
      <div className="mt-3 space-y-2">
        {c.flows.map((f) => <FlowBlock key={f.flowId} f={f} />)}
      </div>
    </details>
  );
}

export default function BundleResultsPanel({ results }: { results: BundleFleetResult }) {
  if (!results.available) {
    return (
      <Panel title="Bundle on reply" tip="A free preview video plus a 2-part paid video sequence sent to fans who answer a re-engagement message. Nothing has been set up yet.">
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
      tip="A fan who answers a re-engagement message (and isn't opt-out or hostile) gets a free preview video with a caption, then can buy Part 1 and Part 2 of the sequence. A creator can run several of these flows; a fan is only ever in one at a time. Read only: what happened, and what it earned."
    >
      {results.truncated && <Notice tone="warn" className="mb-3">A read was cut short, so figures here are lower bounds.</Notice>}
      {empty ? (
        <EmptyBlock icon="◇" title="No bundle activity yet" hint="Nothing has been queued or sent. It stays off until a creator's flow is switched on." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <Kpi label="Replies eligible" tip="Replies that were not opt-out or hostile, so the fan qualifies for some flow." value={num(t.eligible)} sub={`${num(t.negative)} refused`} />
            <Kpi label="Previews sent" tip="Telegram accepted the free preview video." value={num(t.previewsSent)} sub={`${num(t.sentByReply)} on reply, ${num(t.sentByBackfill)} backfill`} />
            <Kpi label="Waiting" tip="Queued and not sent yet: waiting on the delay, the hourly limit, or the sender being off." value={num(t.pending)} />
            <Kpi label="Failed" tip="Telegram refused it, or it may have been delivered but we could not confirm." value={num(t.failed + t.uncertain)} tone={t.failed + t.uncertain > 0 ? "crit" : "neutral"} sub={t.uncertain > 0 ? `${num(t.uncertain)} may have gone out` : undefined} />
            <Kpi label="Held back" tip="Eligible but stopped by a fan safety gate or the multi-flow rules (another flow in flight or too recent)." value={num(t.gated + t.flowGated)} />
            <Kpi label="Part 1 bought" tip="Confirmed by the exact entitlement the sequence feature grants, not by price guessing." value={num(t.part1Purchases)} />
            <Kpi label="Part 2 bought" tip="Confirmed the same way as Part 1." value={num(t.part2Purchases)} sub={t.conversion == null ? undefined : `${pct(t.conversion)} of preview slots`} />
            <Kpi label="Stars earned" tip="Sum of confirmed Part 1 and Part 2 payments, across every flow." value={`${num(t.stars)} ⭐`} tone="good" />
          </div>

          <div className="mt-4 space-y-2">
            {results.clones.map((c) => <CloneBlock key={c.cloneId} c={c} />)}
          </div>
        </>
      )}
    </Panel>
  );
}
