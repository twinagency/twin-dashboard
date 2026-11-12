// KNOWN RED (rule j: manual prices only, no invented discounts; REVIEW.md inv 7 "Money"; W1 lane 3 findings F2, F3).
// F2: validCategoryDraft (commercial-categories.ts:35-37) lets a single-asset product carry its own approvedTotalCents,
//     which overrides the category's confirmed single price (:36); the ack check (:49) then compares against that same
//     request value, so a USD 3.00 single in a USD 50.00 category is accepted end to end. Distinct from Q4 (bundles).
// F3: a bundle whose approvedTotalCents is present but null passes the key check (:35), `??` falls back to the single
//     category price (:36) and the bundle guard (:37) only checks the key exists: a multi-asset bundle at one single's price.
// Q4 (bundle below the sum of singles) is in tests/known-red/j-invented-prices.test.ts, not duplicated here.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { validCategoryDraft } from "../../lib/onlyfans/commercial-categories";

const HASH = "e".repeat(64);
const draft = (mediaIds: string[], extra: Record<string, unknown>) => ({ folderId: 7, priceCents: 5000, categoryPriceRevision: 1, classificationConfirmed: true, rightsConfirmed: true,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: Object.fromEntries(mediaIds.map(id => [id, HASH])) },
  products: [{ label: "Beach set", description: "Beach photos.", mediaIds, previewMediaIds: [], ...extra }] });

// The control keeps only the single: the recommended fix may drop bundles entirely (F15), so a bundle control would go red on a correct fix.
test("control: a single at the category price with no approvedTotalCents is valid", () => {
  assert.equal(validCategoryDraft(draft(["1001"], {})), true);
});

test("F2: a single-asset product cannot override the category's single price", () => {
  assert.equal(validCategoryDraft(draft(["1001"], { approvedTotalCents: 300 })), false, "USD 3.00 single in a USD 50.00 category is an invented price");
});

test("F3: a bundle with a null approved total is refused, not priced as one single", () => {
  assert.equal(validCategoryDraft(draft(["1001", "1002"], { approvedTotalCents: null })), false, "a 2-item bundle must not fall back to the single price");
});
