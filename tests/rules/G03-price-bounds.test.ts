// Regression guard (G03): was KNOWN RED tests/known-red/plan-c-price-bounds.test.ts, fixed in this PR (lib/onlyfans/plan-c.ts). Original header below.
/**
 * KNOWN RED (W1 lane 1 finding 9; REVIEW.md invariant 7 "Money: manual agency prices only").
 * lib/onlyfans/plan-c.ts:76 bounds prices 0..2,000,000 cents (`intIn(value, 0, 20_000_00)`); the rule is 300..20,000 cents
 * (docs/review/CORRECTNESS-REVIEW.md:13, commercial-categories.ts:21,32). Measured: 1, 299, 20,001 and 1,999,999 cents parse and the
 * draft is approvable. The edges (299, 20,001) are red so a tighter-but-wrong bound cannot pass; 300 and 20,000 are controls so an
 * over-tight bound cannot either. Turns green when the parser refuses (null) exactly the offers priced outside 300..20,000 cents.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, parsedDraft, seedOffer } from "./plan-c-fixtures";

const priced = (cents: number) => { const raw = seedOffer(); raw.parts[1].price_cents = cents; return raw; };

for (const cents of [300, 20_000])
  test(`control: an offer priced ${cents} cents (a bound) parses and shows ${cents}`, () => {
    assert.equal(parsedDraft(priced(cents)).offer?.priceCents, cents);
  });

for (const cents of [299, 20_001, 1, 1_999_999])
  test(`finding 9: a ${cents}-cent offer is refused`, () => {
    assert.equal(parsePlanCDraft(priced(cents), MOCK_ACCOUNT), null);
  });
