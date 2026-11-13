// Regression guard (G03): was KNOWN RED tests/known-red/plan-c-priced-non-offer.test.ts, fixed in this PR (lib/onlyfans/plan-c.ts). Original header below.
/**
 * KNOWN RED (W1 lane 1 finding 8; REVIEW.md invariant 7 "Money" / "No false success").
 * lib/onlyfans/plan-c.ts:82,86,135: a part's `action` may be any string <= 32 chars and still carries price/media/product, but only
 * "offer" is summarised, so `{action:"paid_media", price_cents:300}` parses as a reply with offer null: the price is never shown.
 * Measured: draft action "reply", offer null, parts[1].priceCents 300. A part whose action IS "reply" carrying a price, media or a
 * product parses the same way (measured), so a fix that only rejects unknown actions stays red on those three tests.
 * Turns green when a part's action is only reply|offer and a reply part carrying price/media/product is refused (null).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, parsedDraft, scopedDraft, scopedOffer } from "./plan-c-fixtures";
import type { RawPart } from "../contracts/plan-c-mock-backend";

test("control: a priced part whose action is offer is summarised and its price shown", () => {
  const draft = parsedDraft(scopedOffer());
  assert.equal(draft.action, "offer");
  assert.equal(draft.offer?.priceCents, 300);
});

test("finding 8: a priced part whose action is not offer is refused", () => {
  const raw = scopedDraft();
  raw.parts[1] = { ...raw.parts[1], action: "paid_media" as RawPart["action"], price_cents: 300, currency: "USD" };
  assert.equal(parsePlanCDraft(raw, MOCK_ACCOUNT), null);
});

const reply = (extra: Partial<RawPart>) => { const raw = scopedDraft(); raw.parts[1] = { ...raw.parts[1], action: "reply", ...extra }; return raw; };

test("finding 8: a reply part carrying a price is refused", () => {
  assert.equal(parsePlanCDraft(reply({ price_cents: 300, currency: "USD" }), MOCK_ACCOUNT), null);
});

test("finding 8: a reply part carrying media is refused", () => {
  assert.equal(parsePlanCDraft(reply({ media_ids: ["m1"] }), MOCK_ACCOUNT), null);
});

test("finding 8: a reply part carrying a product is refused", () => {
  assert.equal(parsePlanCDraft(reply({ catalog_item_id: "fixture-photo-1" }), MOCK_ACCOUNT), null);
});
