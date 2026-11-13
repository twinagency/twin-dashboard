// RULE G06 (REVIEW.md inv 7 "No false success" + Structure "silent fallbacks hiding an invariant"): fan financials claim
// complete coverage only with a coverageAt stamp behind it; the pair (coverageComplete:true, coverageAt:null) is refused or
// narrowed to coverageComplete:false, so the inbox never shows totals as verified with an unknown cutoff.
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

test("C1C1: complete coverage without a coverage stamp is narrowed to incomplete (totals kept, shown unverified)", () => {
  const p = parseFanFinancials(financials({ coverageAt: null }));
  assert.notEqual(p, null, "the totals are kept");
  assert.equal(p?.coverageComplete, false, "fan-financials.ts accepts coverageComplete:true with coverageAt:null");
});
