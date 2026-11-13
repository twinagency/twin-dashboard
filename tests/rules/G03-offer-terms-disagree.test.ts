// Regression guard (G03): was KNOWN RED tests/known-red/plan-c-offer-terms-disagree.test.ts, fixed in this PR (lib/onlyfans/plan-c.ts). Original header below.
/**
 * KNOWN RED (W1 lane 1 finding 4; REVIEW.md invariant 7 "No false success" / "Money: manual prices only"; plan-c.ts:104
 * "a half-read draft must never be offered for approval", :134 "Never invent a price or a quantity").
 * lib/onlyfans/plan-c.ts:131-146 summarises an offer from draft-level fields first and only the FIRST offer part (`.find`), so
 * the shown terms (price :139, currency :140, product :141, mediaCount :138/:146) can differ from the part that is sent, and a
 * draft-level `action:"reply"` beats an offer part (:131-133). Measured: draft priceCents 100 (and 500) over a 300-cent offer part parses
 * with offer.priceCents = the draft value and parts[1].priceCents 300; the draft stays approvable.
 * Turns green when parsePlanCDraft returns null on any disagreement between draft-level terms and offer parts, or between two
 * offer parts. Fixtures: scoped mock-backend shapes (tests/rules/plan-c-fixtures.ts), so only this finding decides each result.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, scopedOffer } from "./plan-c-fixtures";

const parse = (raw: unknown) => parsePlanCDraft(raw, MOCK_ACCOUNT);

test("control: a consistent offer draft parses with the terms of its offer part", () => {
  const draft = parse(scopedOffer());
  assert.ok(draft);
  assert.deepEqual(draft.offer, { productId: "fixture-photo-1", mediaCount: 1, mediaIds: ["m1"], priceCents: 300, currency: "USD" });
  const sameDeclared = parse({ ...scopedOffer(), priceCents: 300, currency: "USD", productId: "fixture-photo-1", mediaCount: 1 });
  assert.ok(sameDeclared, "draft-level terms that agree with the part are fine");
});

test("finding 4: a draft-level price that differs from the offer part's price is refused", () => {
  assert.equal(parse({ ...scopedOffer(), priceCents: 500 }), null);
});

test("finding 4: a draft-level currency that differs from the offer part's currency is refused", () => {
  assert.equal(parse({ ...scopedOffer(), currency: "EUR" }), null);
});

test("finding 4: a draft-level product that differs from the offer part's product is refused", () => {
  assert.equal(parse({ ...scopedOffer(), productId: "other-product" }), null);
});

test("finding 4: a draft-level mediaCount that differs from the media actually attached is refused", () => {
  assert.equal(parse({ ...scopedOffer(), mediaCount: 5 }), null);
});

test("finding 4: a draft-level action reply over a priced offer part is refused", () => {
  assert.equal(parse({ ...scopedOffer(), action: "reply" }), null);
});

test("finding 4: two offer parts with different prices are refused", () => {
  const raw = scopedOffer();
  raw.parts.push({ ...raw.parts[1], part_index: 2, price_cents: 900 });
  assert.equal(parse(raw), null);
});
