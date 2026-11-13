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
import { MOCK_ACCOUNT, seedDraft, seedOffer } from "./plan-c-fixtures";

const parse = (raw: unknown) => parsePlanCDraft(raw, MOCK_ACCOUNT);

test("control: a consistent offer draft parses with the terms of its offer part", () => {
  const draft = parse(seedOffer());
  assert.ok(draft);
  assert.deepEqual(draft.offer, { productId: "fixture-photo-1", mediaCount: 1, mediaIds: ["m1"], priceCents: 300, currency: "USD" });
  const sameDeclared = parse({ ...seedOffer(), priceCents: 300, currency: "USD", productId: "fixture-photo-1", mediaCount: 1 });
  assert.ok(sameDeclared, "draft-level terms that agree with the part are fine");
});

test("finding 4: a draft-level price that differs from the offer part's price is refused", () => {
  assert.equal(parse({ ...seedOffer(), priceCents: 500 }), null);
});

test("finding 4: a draft-level currency that differs from the offer part's currency is refused", () => {
  assert.equal(parse({ ...seedOffer(), currency: "EUR" }), null);
});

test("finding 4: a draft-level product that differs from the offer part's product is refused", () => {
  assert.equal(parse({ ...seedOffer(), productId: "other-product" }), null);
});

test("finding 4: a draft-level mediaCount that differs from the media actually attached is refused", () => {
  assert.equal(parse({ ...seedOffer(), mediaCount: 5 }), null);
});

test("finding 4: a draft-level action reply over a priced offer part is refused", () => {
  assert.equal(parse({ ...seedOffer(), action: "reply" }), null);
});

test("finding 4: two offer parts with different prices are refused", () => {
  const raw = seedOffer();
  raw.parts.push({ ...raw.parts[1], part_index: 2, price_cents: 900 });
  assert.equal(parse(raw), null);
});

// R1 (review finding 9): each of these goes red with its check removed from parseOfferTerms.
test("finding 9: two identical offer parts are refused (one offer per draft)", () => {
  const raw = seedOffer();
  raw.parts.push({ ...raw.parts[1], part_index: 2 });
  assert.equal(parse(raw), null);
});

const terms = { productId: "fixture-photo-1", mediaIds: ["m1"], mediaCount: 1, priceCents: 300, currency: "USD" };
test("finding 9: a nested offer or product block that disagrees with the offer part is refused", () => {
  assert.ok(parse({ ...seedOffer(), offer: terms, product: { id: "fixture-photo-1" } }), "control: agreeing nested blocks parse");
  assert.equal(parse({ ...seedOffer(), offer: { ...terms, priceCents: 500 } }), null);
  assert.equal(parse({ ...seedOffer(), offer: { ...terms, mediaIds: ["m2"] } }), null);
  assert.equal(parse({ ...seedOffer(), product: { id: "other-product" } }), null);
});

test("finding 9: a reply draft that declares offer terms is refused", () => {
  assert.ok(parse(seedDraft()), "control");
  assert.equal(parse({ ...seedDraft(), priceCents: 300 }), null);
  assert.equal(parse({ ...seedDraft(), offer: terms }), null);
  assert.equal(parse({ ...seedDraft(), product: { id: "fixture-photo-1" } }), null);
});

// R1 D6: a price alias pair is one term; when both are set they must agree, never "first alias wins".
test("D6: priceCents and price_cents that disagree are refused, on the part and on the draft", () => {
  const part = (extra: Record<string, unknown>) => { const raw = seedOffer(); Object.assign(raw.parts[1], extra); return raw; };
  assert.ok(parse(part({ priceCents: 300 })), "control: agreeing aliases parse");
  assert.equal(parse(part({ priceCents: 300, price_cents: 20000 })), null);
  assert.equal(parse({ ...seedOffer(), priceCents: 300, price_cents: 20000 }), null);
  const reply = seedDraft(); Object.assign(reply.parts[1], { priceCents: null, price_cents: 300 });
  assert.equal(parse(reply), null, "a null alias does not hide a price on a reply part");
});

// R2 S3: every alias pair is one term. Two set aliases that disagree are refused wherever they are read; null counts as set,
// so a null beside a value is a disagreement too. The backend sends one alias per field (approval.py:157-161, operator_v2.py:235-246).
test("S3: part aliases that disagree are refused for media, previews, product, text and index", () => {
  const part = (extra: Record<string, unknown>) => { const raw = seedOffer(); Object.assign(raw.parts[1], extra); return raw; };
  assert.ok(parse(part({ mediaIds: ["m1"], previewIds: [], productId: "fixture-photo-1", text: "Plan C fixture photo" })), "control: agreeing aliases parse");
  for (const extra of [{ mediaIds: ["m2"] }, { media_ids: ["m1", "m2"], mediaIds: ["m2", "m1"] }, { previewIds: ["m1"] }, { productId: "other-product" },
    { catalogItemId: "other-product" }, { text: "Something else" }, { partIndex: 3 }, { productId: null }, { mediaIds: null }])
    assert.equal(parse(part(extra)), null, JSON.stringify(extra));
});

test("S3: draft-level aliases that disagree are refused", () => {
  assert.equal(parse({ ...seedDraft(), fan_id: "900000000002" }), null);
  assert.equal(parse({ ...seedDraft(), conversation_id: `${MOCK_ACCOUNT}:900000000002` }), null);
  assert.equal(parse({ ...seedDraft(), version: 2 }), null);
  assert.equal(parse({ ...seedDraft(), expires_at: new Date(Date.now() + 60 * 60_000).toISOString() }), null);
});
