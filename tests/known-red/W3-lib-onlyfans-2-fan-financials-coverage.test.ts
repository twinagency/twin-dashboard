// KNOWN RED (W3-lib-onlyfans-2 C1C1; REVIEW.md inv 7 "No false success" (no label claims more than backend evidence) +
// Structure "silent fallbacks hiding an invariant"): lib/onlyfans/fan-financials.ts:7 accepts coverageComplete:true with
// coverageAt:null. components/onlyfans-preview/InboxView.tsx:681 then treats the totals as verified and :691 renders "Coverage through an unknown
// cutoff. Completed supported scan", a completeness claim with no cutoff behind it.
// Fixed: coverageComplete:true requires a coverageAt stamp; the pair (true, null) is refused (parseFanFinancials -> null)
// or narrowed to coverageComplete:false.
// Team's Claude owns the fix; not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { parseFanFinancials } from "../../lib/onlyfans/fan-financials";

const financials = (extra: Record<string, unknown>) => ({
  version: "of-fan-financials.v1",
  totals: [{ currency: "USD", status: "cleared", transactions: 2, grossCents: 1500, netCents: 1200, lastTransactionAt: "2026-11-10T09:00:00Z" }],
  coverageComplete: true,
  coverageAt: "2026-11-12T08:00:00Z",
  commerceHeld: false,
  ...extra,
});

test("control: complete coverage with a UTC stamp parses", () => {
  const parsed = parseFanFinancials(financials({}));
  assert.notEqual(parsed, null);
  assert.equal(parsed?.coverageComplete, true);
  assert.equal(parsed?.coverageAt, "2026-11-12T08:00:00Z");
});

test("control: incomplete coverage with no stamp parses", () => {
  assert.notEqual(parseFanFinancials(financials({ coverageComplete: false, coverageAt: null })), null);
});

test("C1C1: complete coverage without a coverage stamp is refused", () => {
  const p = parseFanFinancials(financials({ coverageAt: null }));
  assert.ok(p === null || p.coverageComplete === false, "fan-financials.ts:7 accepts coverageComplete:true with coverageAt:null");
});
