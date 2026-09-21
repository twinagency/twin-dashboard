import type { LiftReport, LiftSide } from "@/lib/mtproto/types";
import { EmptyBlock, Notice, Panel, StatusPill } from "./kit";
import { MIN_LIFT_FANS, WINDOW_LABEL, liftDelta, liftReadiness, num, pct } from "./view";

// N2.2 / N3: contacted vs hold-out, same window, side by side at 24h/72h/7d.
// This is the "did it actually work" answer, so it is deliberately careful:
// with only a handful of fans in a group a couple of lucky buyers swing the
// percentages wildly, and we say so instead of declaring a winner. Money is
// OBSERVED, never claimed as net profit. Figures are the unchanged lift numbers.
export default function LiftCard({ reports }: { reports: LiftReport[] }) {
  const anyEnough = reports.some((r) => liftReadiness(r).enough);
  const nobody = reports.length === 0 || reports.every((r) => r.contacted.fans === 0 && r.holdout.fans === 0);
  return (
    <Panel
      title="Did it work? Messaged vs held back"
      tip={`Two groups of silent fans: the ones we messaged, and a hold-out we deliberately left alone. Both are measured over the same length of time, counting from each fan's own send time (for the hold-out: when they would have been messaged). Any paid order counts, and only fans whose time window has finished are included. Stars are observed spending, not profit. "Replied and bought" is the stricter rule and only applies to messaged fans.`}
    >
      {reports.some((r) => r.partial) && (
        <Notice tone="warn" className="mb-3">
          The purchase read was cut short: every figure here is a lower bound.
        </Notice>
      )}
      {nobody ? (
        <EmptyBlock icon="⚖" title="Nothing to compare yet" hint="Once a live run has messaged some fans and held others back, the two groups are compared here." />
      ) : (
        <>
          {!anyEnough && (
            <Notice tone="info" title="Not enough data yet" className="mb-3">
              We need at least {MIN_LIFT_FANS} fans in each group before the difference means anything. Right now a few lucky buyers could swing these percentages either way, so read them as a first look, not a result.
            </Notice>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {reports.map((r) => (
              <WindowCard key={r.windowHours} r={r} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function WindowCard({ r }: { r: LiftReport }) {
  const ready = liftReadiness(r);
  const d = liftDelta(r);
  const dim = ready.enough ? "" : "opacity-70";
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{WINDOW_LABEL[r.windowHours] ?? `${r.windowHours} hours`}</div>
        {ready.enough ? <StatusPill tone="good">Enough data</StatusPill> : <StatusPill tone="warn">Not enough data yet</StatusPill>}
      </div>

      <div className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-1.5 text-sm ${dim}`}>
        <span />
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">Messaged</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Held back</span>

        <Row label="Fans measured" a={num(r.contacted.fans)} b={num(r.holdout.fans)} />
        <Row label="Replied" a={pct(r.contacted.replyRate)} b="n/a" />
        <Row label="Bought" a={pct(r.contacted.buyerRate)} b={pct(r.holdout.buyerRate)} />
        <Row label="⭐ per fan" a={r.contacted.starsPerFan.toFixed(1)} b={r.holdout.starsPerFan.toFixed(1)} money />
        <Row label="⭐ total" a={num(r.contacted.stars)} b={num(r.holdout.stars)} money />
      </div>

      <AttributedLine side={r.contacted} />

      <div className="mt-3 rounded-xl bg-muted/5 px-3 py-2 text-[13px] leading-snug text-ink">
        {ready.enough ? (
          <>
            Messaged fans bought{" "}
            <span className={`font-semibold ${d.buyerPoints > 0 ? "text-good" : d.buyerPoints < 0 ? "text-crit" : ""}`}>
              {d.buyerPoints === 0 ? "as often as" : `${Math.abs(d.buyerPoints).toFixed(1)} points ${d.buyerPoints > 0 ? "more" : "less"} often than`}
            </span>{" "}
            held-back fans and spent{" "}
            <span className="font-semibold text-good">{Math.abs(d.starsPerFan).toFixed(1)} ⭐</span> {d.starsPerFan >= 0 ? "more" : "less"} per fan.
          </>
        ) : (
          <span className="text-muted">
            {ready.contacted} messaged and {ready.holdout} held back so far. Need {MIN_LIFT_FANS} in each before we compare.
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ label, a, b, money = false }: { label: string; a: string; b: string; money?: boolean }) {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className={`text-right font-semibold tabular-nums ${money ? "text-good" : "text-ink"}`}>{a}</span>
      <span className={`text-right tabular-nums ${money ? "text-good/70" : "text-muted"}`}>{b}</span>
    </>
  );
}

function AttributedLine({ side }: { side: LiftSide }) {
  return (
    <div className="mt-2 text-[11px] text-muted">
      Replied, then bought: <span className="font-semibold tabular-nums text-ink">{side.attributedBuyers}</span> fans, <span className="font-semibold tabular-nums text-good">{side.attributedStars} ⭐</span>
    </div>
  );
}
