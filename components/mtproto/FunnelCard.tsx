import type { FunnelCounts, OptOutReport } from "@/lib/mtproto/types";
import { EmptyBlock, Panel } from "./kit";
import { funnelStages, num, pct } from "./view";
import { Info } from "@/components/clone/fields";

// Funnel (N2.1): eligible -> contacted -> acknowledged -> replied -> bought.
// Hold-out is the control group, shown as a side note. Bars are drawn against
// the first step so drop-offs are visible at a glance; every figure is the
// unchanged funnel number. Stars live in the KPI strip above (house rule: a
// money figure is green, never accent blue).
export default function FunnelCard({ title, subtitle, funnel, optOuts }: { title: string; subtitle?: string; funnel: FunnelCounts; optOuts?: OptOutReport }) {
  const stages = funnelStages(funnel);
  const top = Math.max(1, ...stages.map((s) => s.value));
  const empty = stages.every((s) => s.value === 0);
  return (
    <Panel
      title={title}
      tip="Follow a silent fan from being picked to buying. Each bar is compared with the first one, and the small percentage is how many made it from the step before."
      actions={
        <div className="flex items-center gap-2 text-xs text-muted">
          {subtitle && <span>{subtitle}</span>}
          {funnel.partial && <span className="rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn">lower bounds</span>}
        </div>
      }
    >
      {empty ? (
        <EmptyBlock icon="▽" title="No real messages yet" hint="Dry runs never show up in this funnel. It fills in once a live run sends real messages." />
      ) : (
        <ol className="space-y-2.5">
          {stages.map((s) => (
            <li key={s.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[9.5rem_1fr_auto]">
              <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
                <span className="truncate">{s.label}</span>
                <Info text={s.tip} />
              </span>
              <div className="h-6 overflow-hidden rounded-md bg-line/60">
                <div className="h-full rounded-md bg-accent-2/80" style={{ width: `${s.value === 0 ? 0 : Math.max(2, Math.round((s.value / top) * 100))}%` }} />
              </div>
              <span className="min-w-[5.5rem] text-right text-sm tabular-nums text-ink">
                <span className="font-semibold">{num(s.value)}</span>
                {s.ofPrev != null && <span className="ml-1.5 text-[11px] text-muted">{pct(s.ofPrev, 0)}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {funnel.holdout > 0 && (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted">
          <span>
            <span className="font-semibold text-ink">{num(funnel.holdout)}</span> fans were held back on purpose, so results can be compared fairly.
          </span>
        </div>
      )}

      {optOuts && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Opted out
              <Info text="Fans who asked us to stop after a message. Counted only among fans we actually messaged." />
            </span>
            {!optOuts.error && (
              <span className={`text-sm tabular-nums ${optOuts.total.optedOut > 0 ? "font-semibold text-crit" : "text-ink"}`}>
                {optOuts.total.optedOut.toLocaleString()} of {optOuts.total.contacted.toLocaleString()} contacted ({pct(optOuts.total.rate)})
              </span>
            )}
          </div>
          {optOuts.error ? (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              Opt-out counts could not be read ({optOuts.error}); this is unknown, not zero.
            </div>
          ) : optOuts.perCreator.length === 0 ? (
            <div className="text-sm text-muted">No real sends yet.</div>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {optOuts.perCreator.map((r) => (
                <li key={r.cloneId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink">{r.cloneName}</span>
                  <span className={`shrink-0 tabular-nums ${r.optedOut > 0 ? "font-semibold text-crit" : "text-muted"}`}>
                    {r.optedOut} of {r.contacted} · {pct(r.rate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {optOuts.partial && <div className="mt-1.5 text-xs text-warn">Partial: the opt-out read was cut short, counts are lower bounds.</div>}
        </div>
      )}
    </Panel>
  );
}
