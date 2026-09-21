import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { FunnelCounts, OptOutReport } from "@/lib/mtproto/types";

const pct = (r: number | null) => (r == null ? "n/a" : `${(r * 100).toFixed(1)}%`);

// Funnel (N2.1): eligible -> holdout | contacted -> acknowledged -> replied ->
// bought -> Stars. Money tile uses text-good, matching the house rule that a
// dollar/star figure is always green, never accent blue.
export default function FunnelCard({ title, subtitle, funnel, optOuts }: { title: string; subtitle?: string; funnel: FunnelCounts; optOuts?: OptOutReport }) {
  const steps: { label: string; value: number; money?: boolean }[] = [
    { label: "Eligible", value: funnel.eligible },
    { label: "Hold-out", value: funnel.holdout },
    { label: "Contacted", value: funnel.contacted },
    { label: "Acknowledged", value: funnel.acknowledged },
    { label: "Replied", value: funnel.replied },
    { label: "Bought", value: funnel.bought },
    { label: "Stars", value: funnel.stars, money: true },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        {funnel.partial && (
          <div className="mb-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">
            A paged read was cut short: figures below are lower bounds.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {steps.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${s.money ? "text-good" : ""}`}>
                {s.value.toLocaleString()}
                {s.money ? " ⭐" : ""}
              </div>
            </div>
          ))}
        </div>
        {optOuts && (
          <div className="mt-4">
            <div className="mb-1 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Opted out</span>
              {!optOuts.error && (
                <span className={`text-sm normal-case tabular-nums ${optOuts.total.optedOut > 0 ? "text-destructive" : "text-foreground"}`}>
                  {optOuts.total.optedOut.toLocaleString()} of {optOuts.total.contacted.toLocaleString()} contacted ({pct(optOuts.total.rate)})
                </span>
              )}
            </div>
            {optOuts.error ? (
              <div className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">
                Opt-out counts could not be read ({optOuts.error}); this is unknown, not zero.
              </div>
            ) : optOuts.perCreator.length === 0 ? (
              <div className="text-sm text-muted-foreground">No real sends yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {optOuts.perCreator.map((r) => (
                  <li key={r.cloneId} className="flex justify-between gap-3 rounded-md border border-border px-2 py-1">
                    <span>{r.cloneName}</span>
                    <span className={`tabular-nums ${r.optedOut > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {r.optedOut} of {r.contacted} · {pct(r.rate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {optOuts.partial && <div className="mt-1 text-xs text-warn">Partial: the opt-out read was cut short, counts are lower bounds.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
