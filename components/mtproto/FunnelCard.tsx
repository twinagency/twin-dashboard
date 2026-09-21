import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { FunnelCounts } from "@/lib/mtproto/types";

// Funnel (N2.1): eligible -> holdout | contacted -> delivered -> replied ->
// bought -> Stars. Money tile uses text-good, matching the house rule that a
// dollar/star figure is always green, never accent blue.
export default function FunnelCard({ title, subtitle, funnel }: { title: string; subtitle?: string; funnel: FunnelCounts }) {
  const steps: { label: string; value: number; money?: boolean }[] = [
    { label: "Eligible", value: funnel.eligible },
    { label: "Hold-out", value: funnel.holdout },
    { label: "Contacted", value: funnel.contacted },
    { label: "Delivered", value: funnel.delivered },
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
