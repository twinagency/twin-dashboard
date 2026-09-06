// ── Checks that the Revenue page gives ONE answer per question ───────────────
// Run:  npm run test:consistency
//
// Offline. Nothing here touches Supabase; every assertion is against a pure
// function or against the component source, so it runs in CI and cannot flake.
//
// WHY. The 2026-08-21 audit of the Revenue page found the same shape of defect
// five times: two places computing the same number differently, or one place
// computing it on the wrong clock, with nothing anywhere that would notice.
//
//   - "Top source" said Photos 21% while the report's "Top earner" said
//     Media 61%, on the same screen, because the tile filtered the catch-all
//     buckets out before picking the maximum and the report did not.
//   - A broad top-line "Conversion" ratio mixed account-level buyers with
//     creator–fan relationships in All creators. The only remaining conversion
//     is inside the explicitly labelled paid-message paywall report, where its
//     cohort is defined by the three visible steps.
//   - Peak hour and peak day were computed with Date#getHours() in a container
//     with no TZ, i.e. UTC, and labelled "(local)". Ten hours out on AEST.
//   - The daily chart padded zeroes from the window's end to today, inventing
//     no-sale days the operator never asked about, and shipping them out
//     through the public API as measurements.
//   - Revenue rendered as "A$8,295" sat beside profit rendered as "$4,102",
//     two currencies, one table, no labels.
//
// The load-bearing assertions are C1/C2 (one function, one answer) and C4-C8
// (the clock), because those are the ones a future edit can silently undo.
//
// PROVEN TO FAIL (planted back, restored after) — see the run log in the commit
// message; each item names the assertion it turned red.

import { readFileSync } from "node:fs";
import { classifyRevenueLedgerRow } from "../lib/revenue-ledger";
import { reportFeatureRows, topFeatureRow, type FeatureRow } from "../lib/report-features";
import { REPORT_TZ, normaliseHour, reportInstant, reportTzLabel } from "../lib/report-time";
import { starsToMoneyRate, usdToMoneyRate, AUD_PER_USD, STAR_USD } from "../lib/money";
import { intraPeriodTrendPct } from "../lib/revenue-trend";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
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

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DASH = src("components/RevenueDashboard.tsx");
const ANALYTICS = src("lib/analytics-data.ts");
const ROLLUP = src("lib/rollup.ts");

const row = (key: string, label: string, stars: number, sales: number, total: number): FeatureRow =>
  ({ key, label, stars, sales, avgStars: sales > 0 ? stars / sales : 0, share: total > 0 ? stars / total : 0 }) as FeatureRow;

// The live shape that produced the disagreement: the untagged catch-all is the
// biggest bucket by a distance, and it is the one the tile used to drop.
const TOTAL = 97_518;
const LIVE: FeatureRow[] = [
  row("media", "Media (untagged)", 70_552, 79, TOTAL),
  row("other", "Other", 18_298, 17, TOTAL),
  row("photo", "Photos", 5_975, 6, TOTAL),
  row("credits", "Message credits", 2_093, 7, TOTAL),
  row("tip", "Tips / spoil", 600, 1, TOTAL),
];

console.log("revenue page consistency\n");

// ── C1-C3: one answer to "what sells most" ───────────────────────────────────

check("C1 topFeatureRow picks the real maximum, catch-alls included", () => {
  const top = topFeatureRow(LIVE);
  assert(top, "topFeatureRow returned null on populated data");
  eq(top.key, "media", "the biggest bucket wins even when it is the untagged catch-all");
  eq(top.stars, 70_552, "top bucket stars");
  // The exact wrong answer the tile used to give.
  assert(top.key !== "photo", "picking 'photo' here means the catch-all filter is back: that is the 21%-vs-61% bug");
});

check("C2 the tile and the report both call topFeatureRow", () => {
  // Source-level on purpose. Every value assertion above passes fine while the
  // component quietly keeps its own sort, which is exactly how the two numbers
  // drifted apart in the first place.
  const calls = [...DASH.matchAll(/topFeatureRow\(/g)].length;
  assert(calls >= 2, `expected both the Top source tile and the Top earner fact to call topFeatureRow(), found ${calls} call(s)`);
  assert(
    !/key\s*!==\s*"media"/.test(DASH),
    "the component must not filter the media bucket out before ranking again",
  );
  assert(
    !/\.replace\(\s*" \(untagged\)"\s*,\s*""\s*\)/.test(DASH),
    '"(untagged)" must stay on the label: it is the difference between "photos are our product" and "we are not recording what we sell"',
  );
});

check("C3 topFeatureRow is null-safe and never reports an empty window as a winner", () => {
  eq(topFeatureRow([]), null, "no data means no top source, not a zero-star row");
  eq(topFeatureRow([row("photo", "Photos", 0, 0, 0)]), null, "a zero-star bucket is not a top source");
});

// ── C4-C7: the clock ─────────────────────────────────────────────────────────

// Offset of REPORT_TZ from UTC at a given instant, derived through the function
// under test. Comparing against getUTCHours() is what makes this non-circular:
// if reportInstant regressed to reading UTC, every offset below becomes 0.
const offsetAt = (iso: string) => {
  const utcHour = new Date(iso).getUTCHours();
  return (reportInstant(iso).hour - utcHour + 24) % 24;
};

check("C4 hours are bucketed in REPORT_TZ, not UTC", () => {
  eq(REPORT_TZ, "Australia/Sydney", "default report zone");
  // July = AEST = UTC+10. A zero offset here means the UTC bug is back.
  eq(offsetAt("2026-07-15T03:00:00Z"), 10, "AEST offset in July");
  assert(offsetAt("2026-07-15T03:00:00Z") !== 0, "peak hour is being computed in UTC again");
  eq(reportInstant("2026-07-15T03:00:00Z").hour, 13, "03:00 UTC is 1 PM in Sydney, not 3 AM");
});

check("C5 DST is handled, so October does not shift every number by an hour", () => {
  // January = AEDT = UTC+11. Manual offset arithmetic gets this wrong twice a
  // year; Intl does not. Different offsets in Jan and Jul is the proof.
  eq(offsetAt("2026-01-15T03:00:00Z"), 11, "AEDT offset in January");
  assert(
    offsetAt("2026-01-15T03:00:00Z") !== offsetAt("2026-07-15T03:00:00Z"),
    "summer and winter offsets are identical: DST is not being applied",
  );
});

check("C6 the calendar day is the day it was in REPORT_TZ, not in UTC", () => {
  // 23:00 UTC on the 15th is 09:00 on the 16th in Sydney. Bucketing this under
  // the 15th is the "evening sales land on the wrong weekday" defect, and it is
  // why "peak day: Tuesday" could be Monday's takings.
  const at = reportInstant("2026-07-15T23:00:00Z");
  eq(at.dayKey, "2026-07-16", "a Sydney-morning sale belongs to the Sydney date");
  eq(at.hour, 9, "hour of that instant in Sydney");
  // dow cross-checked against the UTC weekday of the CORRECT calendar date.
  eq(at.dow, new Date("2026-07-16T00:00:00Z").getUTCDay(), "weekday must follow the Sydney date, not the UTC one");
});

check("C7 midnight is hour 0, not hour 24", () => {
  // Fed a RAW "24" rather than going through reportInstant. This machine's ICU
  // returns "00" for midnight, so the reportInstant route cannot exercise the
  // wrap at all — the first version of this assertion stayed green with the
  // `% 24` deleted, which the prove script caught. Testing normaliseHour
  // directly is what makes this check capable of failing anywhere.
  eq(normaliseHour("24"), 0, "ICU builds that emit '24' for midnight must wrap to 0");
  eq(normaliseHour("00"), 0, "and builds that emit '00' must stay 0");
  eq(normaliseHour("13"), 13, "an ordinary hour is untouched");
  eq(normaliseHour("bogus"), 0, "an unparseable hour must not become NaN and poison the array");
  const slots = new Array<number>(24).fill(0);
  slots[normaliseHour("24")] += 1; // would be a silent no-op write at index 24
  eq(slots[0], 1, "the midnight bucket must be writable inside a 24-slot array");
  // And the whole-instant path still agrees on this machine.
  const at = reportInstant("2026-07-15T14:00:00Z"); // 00:00 on the 16th, Sydney
  eq(at.hour, 0, "midnight through reportInstant");
  eq(at.dayKey, "2026-07-16", "and the date rolls forward");
  assert(reportTzLabel().length > 0, "the UI needs a zone label to print beside the number");
});

check("C8 analytics buckets through reportInstant and stops padding past the window", () => {
  assert(/reportInstant\(t\.paid_at\)/.test(ANALYTICS), "the ledger loop must bucket through reportInstant()");
  assert(
    !/hourStars\[d\.getHours\(\)\]/.test(ANALYTICS) && !/dowStars\[d\.getDay\(\)\]/.test(ANALYTICS),
    "hour/weekday are being read off the container clock again",
  );
  // The zero-pad ran to `now` instead of the end of the window being charted.
  const loop = ANALYTICS.match(/const dayCount = Math\.max\(1,[^;]+;/)?.[0] ?? "";
  assert(loop, "could not find the byDay day-count expression");
  assert(!/\bnow\b/.test(loop), `byDay is padding to now instead of the window end: ${loop}`);
  assert(/endDay/.test(loop), "byDay must run to the window end");
});

// ── C9-C10: conversion cohorts stay explicit, one currency in a table ────────

check("C9 buyer conversion keeps each numerator and denominator explicit", () => {
  assert(
    !/label:\s*"Conversion"/.test(DASH),
    "a bare top-grid Conversion tile hides its cohort; conversion belongs in the dedicated buyer panel",
  );
  assert(
    /function BuyerConversionPanel\(/.test(DASH),
    "the revenue page must render the dedicated Buyer conversion panel",
  );
  assert(
    /Have they ever bought\?/.test(DASH) && /Did people who messaged buy\?/.test(DASH) && /Did past buyers come back\?/.test(DASH),
    "the panel must distinguish all-time buying, selected-window buying, and seven-day return engagement",
  );
  assert(
    /activeChatBuyerRate: messagedFanTotal > 0 \? activeChatBuyers \/ messagedFanTotal : null/.test(ANALYTICS),
    "active-chat conversion must use buyers who actually chatted in the window over window chatters",
  );
  assert(
    /lifetimeBuyerRate: fans > 0 \? buyers \/ fans : null/.test(ANALYTICS),
    "lifetime buyer conversion must use buyer profiles over fan profiles",
  );
  assert(
    /activeBuyerEngagement7d: buyers > 0 \? activeBuyerProfiles7d \/ buyers : null/.test(ANALYTICS),
    "7-day buyer engagement must use active buyer profiles over all buyer profiles",
  );
});

check("C10 profit and revenue render in the same currency", () => {
  // 1000 stars and the USD those stars are worth must format identically.
  const stars = 1000;
  const asStars = starsToMoneyRate(stars, "AUD", AUD_PER_USD);
  const asUsd = usdToMoneyRate(stars * STAR_USD, "AUD", AUD_PER_USD);
  assert(Math.abs(asStars - asUsd) < 1e-9, `same money, two paths, two answers: ${asStars} vs ${asUsd}`);
  eq(usdToMoneyRate(100, "USD", AUD_PER_USD), 100, "USD passes through untouched");
  eq(usdToMoneyRate(100, "AUD", 1.4), 140, "USD converts at the live rate");
  assert(
    !/const usd = \(n: number\) => "\$" \+/.test(DASH),
    'profit must not render with a bare "$" beside A$ revenue: at 1.4 AUD/USD the margin reads 30% low',
  );
});

// ── C11-C12: a failure must look like a failure ──────────────────────────────

check("C11 a timeout is not reported as an unapplied migration", () => {
  assert(/57014/.test(ROLLUP), "rollup rpc() must recognise query_canceled (57014) as a timeout");
  assert(/PGRST202|42883/.test(ROLLUP), "rollup rpc() must recognise a genuinely missing function");
  assert(
    !/Migration 120 \(bot\/db\/migrations\/120_revenue_rollups\.sql\) must be applied to this project\.`,\s*\)/.test(ROLLUP),
    "rpc() must not append 'apply migration 120' to every error; 120 has been applied since 2026-08-17 and that sentence sent a verification pass chasing the wrong cause",
  );
});

check("C12 the paywall funnel degrades only when the table is genuinely absent", () => {
  assert(
    !/const paywallCollecting = Boolean\(paywallProbe\.error\)/.test(ANALYTICS),
    "any probe error must not read as 'still collecting': a timeout then renders 0 views / 0% conversion as a measurement",
  );
  assert(/PGRST205|42P01/.test(ANALYTICS), "only the missing-table codes may degrade quietly");
  assert(/throw new Error\(\s*`paywall_hits probe failed/.test(ANALYTICS), "every other probe failure must surface");
});

check("C13 the by-clone table shows the whole fleet", () => {
  assert(
    !/const earningClones = [^\n]*\.slice\(0, 8\)/.test(DASH),
    "the by-clone table must not silently drop 4 of 12 clones; a table that hides a third of the fleet reads as the whole fleet",
  );
});

// ── C14: the guard reportFeatureRows already carries, still standing ─────────

check("C14 topFeatureRow ranks over reportFeatureRows, so no bucket can hide from it", () => {
  const keys = LIVE.map((r) => r.key);
  const ranked = reportFeatureRows(LIVE);
  for (const k of keys) assert(ranked.some((r) => r.key === k), `bucket "${k}" vanished before ranking`);
  // Whatever reportFeatureRows renders as its biggest row is what the tile says.
  const biggest = [...ranked].filter((r) => r.stars > 0).sort((a, b) => b.stars - a.stars)[0];
  eq(topFeatureRow(LIVE)?.key, biggest.key, "the tile and the panel must agree on which row is biggest");
  eq(topFeatureRow(LIVE)?.label, biggest.label, "and on what it is called");
});

// ── C15: a refund changes net revenue, never the count of a paid order ──────

check("C15 analytics distinguishes paid orders from ledger adjustments", () => {
  const payment = classifyRevenueLedgerRow({ amount_stars: 1000, invoice_payload: null });
  const negativeAdjustment = classifyRevenueLedgerRow({ amount_stars: -400, invoice_payload: null });
  const explicitRefund = classifyRevenueLedgerRow({ amount_stars: 400, invoice_payload: "refund" });
  const zero = classifyRevenueLedgerRow({ amount_stars: 0, invoice_payload: null });

  assert(payment.paidOrder, "positive ordinary ledger row must be a paid order");
  assert(!payment.adjustment, "positive ordinary ledger row must not be an adjustment");
  assert(negativeAdjustment.adjustment, "negative amount must be an adjustment");
  assert(!negativeAdjustment.paidOrder, "negative adjustment must not be a paid order");
  assert(explicitRefund.adjustment, "refund payload must be an adjustment even if its amount is positive");
  assert(!explicitRefund.paidOrder, "refund payload must not be a paid order");
  assert(!zero.paidOrder, "zero-value ledger row must not be a paid order");
  assert(
    /const avgOrder = s\.sales > 0 \? s\.grossPaymentStars \/ s\.sales : null;/.test(DASH),
    "Avg paid order must use positive paid-order value, not signed adjusted revenue, and must stay undefined when there are no orders",
  );
  assert(
    /value: avgOrder === null \? "-" : money\(avgOrder\)/.test(DASH),
    "an empty paid-order denominator must render as an em dash, not a false $0",
  );
});

// ── C16-C18: reporting labels and arithmetic stay honest ────────────────────

check("C16 an odd-length intra-period trend compares average buckets, not unequal totals", () => {
  eq(intraPeriodTrendPct([100, 100, 100, 100, 100, 100, 100]), 0, "seven identical daily buckets");
  eq(intraPeriodTrendPct([0, 0]), null, "an empty range has no trend");
  eq(intraPeriodTrendPct([0, 100]), 100, "revenue appearing after an empty earlier half");
  eq(intraPeriodTrendPct([100]), null, "one bucket cannot be split");
  assert(
    /latter vs earlier half/.test(DASH) && /This is not a comparison with the previous period\./.test(DASH),
    "the UI must label the trend as intra-period instead of presenting it as a prior-period change",
  );
});

check("C17 creator drill-in uses the canonical Star conversion", () => {
  assert(
    /stats\.stars \* STAR_USD - stats\.costUsd/.test(DASH),
    "creator AI contribution must convert Stars with STAR_USD",
  );
  assert(!/stats\.stars \/ 50/.test(DASH), "the obsolete $0.02 per Star conversion must not return");
});

check("C18 metered AI cost is not labelled as whole-business profit", () => {
  assert(/Metered AI contribution \(USD\)/.test(DASH), "creator drill-in must name metered AI contribution");
  assert(/AI contribution/.test(DASH), "the creator and flow report must name AI contribution");
  assert(!/\{ k: "Profit"/.test(DASH), "creator cards must not label metered contribution as Profit");
  assert(!/>Profit</.test(DASH), "creator table must not label metered contribution as Profit");
});

check("C19 credit refunds remain netted against paid-message revenue", () => {
  const analytics = readFileSync(new URL("../lib/analytics-data.ts", import.meta.url), "utf8");
  assert(
    /const originalFeature =[^;]+;[\s\S]*if \(originalFeature === "credits"\)/.test(analytics),
    "paid-message Stars must use the original product feature even when the display bucket is Refunds",
  );
});

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed`);
for (const f of failures) console.error(`  ✗ ${f}`);
console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
