// Spend-tier badge — shared by the fans list + fan detail page so tiers render
// identically everywhere. Semantic "heat" scale (none → whale), color-scaled so
// the biggest spenders read strongest at a glance. Server-safe (no client hooks).

export type SpendTier = "none" | "low" | "mid" | "high" | "whale";

// Ordered coldest → hottest. Whale is the strongest (filled + ring emphasis).
export const SPEND_TIER_BADGE: Record<SpendTier, { label: string; cls: string }> = {
  none: {
    label: "No spend",
    cls: "bg-muted/10 text-muted",
  },
  low: {
    label: "Low",
    cls: "bg-accent/15 text-accent",
  },
  mid: {
    label: "Mid",
    cls: "bg-good/15 text-good",
  },
  high: {
    label: "High",
    cls: "bg-warn/15 text-warn",
  },
  whale: {
    label: "🐋 Whale",
    cls: "bg-info text-white ring-1 ring-info/40",
  },
};

function toTier(tier: string | null | undefined): SpendTier {
  return tier === "low" || tier === "mid" || tier === "high" || tier === "whale" ? tier : "none";
}

// Full labeled pill (used on the detail page header).
export default function SpendTierBadge({
  tier,
  className = "",
}: {
  tier: string | null | undefined;
  className?: string;
}) {
  const t = toTier(tier);
  const b = SPEND_TIER_BADGE[t];
  return (
    <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + b.cls + (className ? " " + className : "")}>
      {b.label} spender
    </span>
  );
}

// Compact pill for dense table rows. Hidden entirely for the "none" tier so the
// column only lights up for fans who actually spend.
export function SpendTierChip({ tier }: { tier: string | null | undefined }) {
  const t = toTier(tier);
  if (t === "none") return <span className="text-muted/60"> - </span>;
  const b = SPEND_TIER_BADGE[t];
  return <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + b.cls}>{b.label}</span>;
}
