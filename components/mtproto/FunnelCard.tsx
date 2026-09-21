import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { FunnelCounts } from "@/lib/mtproto/types";

// Funnel (N2.1): eligible -> holdout | contacted -> acknowledged -> replied ->
// bought -> Stars. Money tile uses text-good, matching the house rule that a
// dollar/star figure is always green, never accent blue.
export default function FunnelCard({ title, subtitle, funnel }: { title: string; subtitle?: string; funnel: FunnelCounts }) {
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
      </CardContent>
    </Card>
  );
}
