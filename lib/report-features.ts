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

// The single answer to "what sells most", used by BOTH the "Top source" tile at
// the top of the Revenue page and the report's "Top earner" fact lower down.
//
// They used to compute it separately and printed different answers on the same
// screen: the tile filtered out `media` and `other` before picking the max and
// said "Photos 21%", while the report ranked every bucket and said "Media 61%".
// The tile's filter was the exact mistake this file's header was written about
// after tracker #600 — dropping the catch-all buckets makes the remaining shares
// look like the whole story when they are a fifth of it.
//
// So: rank everything, hide nothing, and keep the "(untagged)" suffix on the
// label. An operator seeing "Media (untagged) 61%" learns something true and
// actionable (most sales are not tagged with what they were); one seeing
// "Photos 21%" learns something false.
export function topFeatureRow(byFeature: FeatureRow[]): FeatureRow | null {
  const ranked = reportFeatureRows(byFeature)
    .filter((r) => r.stars > 0)
    .sort((a, b) => b.stars - a.stars);
  return ranked[0] ?? null;
}
