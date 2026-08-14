// ── "What sells" display rows ────────────────────────────────────────────────
// The revenue report's product breakdown, split out of RevenueDashboard so the
// arithmetic is testable (scripts/check-report-features.ts). The panel renders
// exactly what this returns.
//
// THE RULE: every bucket getAnalytics() produces is rendered. Tracker #600 was
// this list disagreeing with FEATURE_KEYS in lib/analytics-data.ts — the panel
// named six buckets, byFeature returns eight, and the two it did not name were
// dropped from the panel while still counting toward the headline total. Briana
// Redd read 97,518⭐ lifetime proceeds against 8,668⭐ of visible categories, 91%
// missing, because 70,552⭐ sat in `media` (a media sale whose `feature` column
// was never tagged) and 18,298⭐ in `other`. A category chart that silently drops
// a category is worse than no chart: it reads as a complete answer.
//
// So the preferred order below is a PREFERENCE, never a filter. Anything it does
// not name is appended rather than discarded, which is also why adding a feature
// key to analytics-data alone cannot hide revenue here again.

import type { AnalyticsData, FeatureKey } from "./analytics-data";

export type FeatureRow = AnalyticsData["byFeature"][number];

// `always: true` renders the row at zero rather than hiding it. An operator who
// sees no Videos row cannot tell "sold none this window" from "the chart broke",
// and the four core products are the ones worth answering that question for.
const PREFERRED: { key: FeatureKey; label: string; always: boolean }[] = [
  { key: "credits", label: "Paid Messages", always: true },
  { key: "photo", label: "Photos", always: true },
  { key: "video", label: "Videos", always: true },
  { key: "bundle", label: "Bundles", always: true },
  { key: "tip", label: "Tips / spoil", always: false },
  { key: "subscription", label: "VIP subscriptions", always: false },
];

export function reportFeatureRows(byFeature: FeatureRow[]): FeatureRow[] {
  const named = new Set<string>(PREFERRED.map((p) => p.key));
  // Named buckets keep the product order and the panel's own labels, which are
  // the operator's words ("Paid Messages") rather than the ledger's ("credits").
  const preferred = PREFERRED.flatMap((p) => {
    const row = byFeature.find((r) => r.key === p.key);
    if (row) return [{ ...row, label: p.label }];
    return p.always ? [{ key: p.key, label: p.label, stars: 0, sales: 0, avgStars: 0, share: 0 }] : [];
  });
  // Everything else, biggest first. Catch-alls read last even when they are the
  // largest line, but they are never absent, and the share % is on the row.
  const rest = byFeature.filter((r) => !named.has(r.key)).sort((a, b) => b.stars - a.stars);
  return [...preferred, ...rest];
}
