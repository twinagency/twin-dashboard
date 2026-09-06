// ── Checks for the "What sells" breakdown ────────────────────────────────────
// Run:  npm run test:report
//
// THE CHECK THAT MATTERS: the panel adds up. Tracker #600 — Briana Redd's page
// showed A$1,796.06 lifetime proceeds (97,518⭐) over a "What sells" breakdown
// summing to A$149 (8,668⭐), off 91%. Nothing was miscounted: getAnalytics()
// returns eight feature buckets and the panel named six of them, so `media`
// (70,552⭐, a media sale whose `feature` column was never tagged) and `other`
// (18,298⭐) were dropped from the chart while still counting in the headline.
//
// A category chart that silently drops a category does not look broken, it looks
// like an answer, and this one sent the operator looking for missing money that
// was never missing. So the assertions here are against the REAL function the
// panel calls, and the load-bearing one is R2: displayed stars == byFeature
// stars, for every bucket the analytics module can produce.
//
// R7 reads FeatureKey out of lib/analytics-data.ts rather than hardcoding the
// list, so adding a bucket upstream cannot reintroduce #600 by omission here.
//
// PROVEN TO FAIL (planted back, restored after):
//   a) `rest` dropped from the return in reportFeatureRows(), i.e. the pre-fix
//      behaviour. Red on R1, R2, R3, R5, R7, and R2 reported 8,668 of 97,518 —
//      the screenshot's numbers exactly.
//   b) `always: false` on the credits row with credits absent. Red on R4.
//   c) the component's `reportFeatureRows(a.byFeature)` call replaced by an
//      inline six-bucket flatMap. Red on R6.

import { readFileSync } from "node:fs";
import { reportFeatureRows, type FeatureRow } from "../lib/report-features";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, what: string): void {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const row = (key: string, label: string, stars: number, sales: number, total: number): FeatureRow =>
  ({
    key,
    label,
    stars,
    sales,
    avgStars: sales > 0 ? stars / sales : 0,
    share: total > 0 ? stars / total : 0,
  }) as FeatureRow;

// Briana Redd, read off the live ledger 2026-08-14, sorted the way byFeature
// sorts (biggest first). These are the exact rows behind the #600 screenshot.
const BRIANA_TOTAL = 97_518;
const BRIANA: FeatureRow[] = [
  row("media", "Media (untagged)", 70_552, 79, BRIANA_TOTAL),
  row("other", "Other", 18_298, 17, BRIANA_TOTAL),
  row("photo", "Photos", 5_975, 6, BRIANA_TOTAL),
  row("credits", "Message credits", 2_093, 7, BRIANA_TOTAL),
  row("tip", "Tips / spoil", 600, 1, BRIANA_TOTAL),
];

const sum = (rows: FeatureRow[]) => rows.reduce((n, r) => n + r.stars, 0);

// ── R1 nothing is dropped ────────────────────────────────────────────────────

check("R1 every bucket byFeature returns is rendered", () => {
  const shown = reportFeatureRows(BRIANA);
  for (const input of BRIANA) {
    const out = shown.find((r) => r.key === input.key);
    assert(out, `bucket "${input.key}" (${input.stars}⭐) was dropped from the panel`);
    eq(out.stars, input.stars, `bucket "${input.key}" stars`);
    eq(out.sales, input.sales, `bucket "${input.key}" sales`);
  }
});

// ── R2 the panel adds up to the headline ─────────────────────────────────────

check("R2 displayed stars equal the analytics total (this is #600)", () => {
  const shown = reportFeatureRows(BRIANA);
  eq(sum(shown), BRIANA_TOTAL, "the rows must sum to lifetime proceeds, not a subset of it");
  eq(sum(shown), sum(BRIANA), "the rows must sum to what byFeature reported");
  const shareTotal = shown.reduce((n, r) => n + r.share, 0);
  assert(Math.abs(shareTotal - 1) < 1e-9, `displayed shares must sum to 100%, got ${(shareTotal * 100).toFixed(2)}%`);
  const salesTotal = shown.reduce((n, r) => n + r.sales, 0);
  eq(salesTotal, 110, "every sale is on a row too, not just every Star");
});

// ── R3 the two buckets #600 actually lost ────────────────────────────────────

check("R3 the untagged and other catch-alls are rendered, not filtered out", () => {
  const shown = reportFeatureRows(BRIANA);
  const media = shown.find((r) => r.key === "media");
  const other = shown.find((r) => r.key === "other");
  assert(media, "the untagged media bucket must be shown; it held 72% of Briana Redd's money");
  assert(other, "the other bucket must be shown; it held 19%");
  eq(media.stars, 70_552, "untagged media stars");
  eq(other.stars, 18_298, "other stars");
  eq(shown.at(-2)?.key, "media", "catch-alls sort biggest first among themselves");
  eq(shown.at(-1)?.key, "other", "and sit after the named product rows");
});

// ── R4 zero rows for the core products, no phantom rows for the rest ─────────

check("R4 the four core products show at zero, tips and VIP do not appear empty", () => {
  const shown = reportFeatureRows([]);
  eq(
    shown.map((r) => r.key).join(","),
    "credits,photo,video,bundle",
    "an empty window still names the four things we sell, and nothing else",
  );
  for (const r of shown) {
    eq(r.stars, 0, `${r.key} stars in an empty window`);
    eq(r.sales, 0, `${r.key} sales in an empty window`);
    eq(r.avgStars, 0, `${r.key} avg must not be NaN or Infinity`);
    eq(r.share, 0, `${r.key} share in an empty window`);
  }
  eq(sum(shown), 0, "an empty window sums to zero, not to something");
});

// ── R5 labels ────────────────────────────────────────────────────────────────

check("R5 the panel's own product labels win, catch-alls keep the ledger's", () => {
  const shown = reportFeatureRows(BRIANA);
  eq(shown.find((r) => r.key === "credits")?.label, "Paid Messages", "operator wording, not 'Message credits'");
  eq(shown.find((r) => r.key === "photo")?.label, "Photos", "photo label");
  eq(shown.find((r) => r.key === "media")?.label, "Media (untagged)", "an unnamed bucket keeps the label analytics gave it");
  eq(shown[0].key, "credits", "product order is preserved: credits first");
  eq(shown[1].key, "photo", "then photos");
});

// ── R6 the panel calls this function ─────────────────────────────────────────

check("R6 RevenueDashboard builds its rows here, not from its own inline list", () => {
  // Source-level on purpose: #600 was an inline bucket list in the component
  // drifting from FEATURE_KEYS in the analytics module. Re-inlining it is the
  // one edit that would pass every assertion above while the panel stays wrong.
  const src = readFileSync(new URL("../components/RevenueDashboard.tsx", import.meta.url), "utf8");
  assert(/reportFeatureRows\(a\.byFeature\)/.test(src), "the What sells panel must build its rows with reportFeatureRows()");
  assert(
    !/const\s+reportFeatureOrder\s*=/.test(src),
    "the component must not carry its own feature order again; it belongs in lib/report-features.ts",
  );
});

// ── R7 every bucket the analytics module can emit survives ───────────────────

check("R7 no FeatureKey can be added upstream and silently vanish here", () => {
  const analytics = readFileSync(new URL("../lib/analytics-data.ts", import.meta.url), "utf8");
  const decl = analytics.match(/export type FeatureKey\s*=([^;]+);/);
  assert(decl, "could not read FeatureKey out of lib/analytics-data.ts");
  const keys = [...decl[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert(keys.length >= 8, `expected the full FeatureKey union, parsed ${keys.length}: ${keys.join(",")}`);
  const everyBucket = keys.map((k, i) => row(k, k, 100, 1, 100 * keys.length));
  const shown = reportFeatureRows(everyBucket);
  for (const k of keys) assert(shown.some((r) => r.key === k), `FeatureKey "${k}" is produced by analytics but never rendered`);
  eq(sum(shown), 100 * keys.length, "with every bucket populated the panel still sums to the total");
});

// ── R8 signed adjustments remain visible ────────────────────────────────────

check("R8 a negative adjustment is rendered and reconciles gross products to net revenue", () => {
  const rows = [
    row("photo", "Photos", 1_000, 1, 600),
    row("refund", "Refunds / adjustments", -400, 0, 600),
  ];
  const shown = reportFeatureRows(rows);
  const refund = shown.find((item) => item.key === "refund");
  assert(refund, "the negative adjustment row must not be filtered out");
  eq(refund.label, "Refunds / adjustments", "adjustment label");
  eq(refund.stars, -400, "signed adjustment Stars");
  eq(refund.sales, 0, "an adjustment is not a paid order");
  eq(sum(shown), 600, "visible product and adjustment rows must equal net revenue");
});

// ── report ───────────────────────────────────────────────────────────────────

console.log("what sells breakdown");
console.log(`  ${passed} passed`);
for (const f of failures) console.error(`  ✗ ${f}`);
console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
