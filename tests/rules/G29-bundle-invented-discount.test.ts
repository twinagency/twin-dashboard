// G29 (rule j, DROP finding Q4, docs/RISKS.md D12): validCategoryDraft took a bundle's approvedTotalCents from the request with
// no tie to the category's single price, so the API accepted a 2-item bundle at USD 3.00 when each single is USD 50.00.
// Manual prices only: a product never sells below its singles. H2 (Moxy price range) is deferred to G29b: Moxy settings are
// opaque on this branch, so there is no price field to bound. Pure function; no DB, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { validCategoryDraft } from "../../lib/onlyfans/commercial-categories";

const HASH = "e".repeat(64);
const category = (approvedTotalCents: number, mediaIds = ["1001", "1002"]) => ({ folderId: 7, priceCents: 5000, categoryPriceRevision: 1, classificationConfirmed: true, rightsConfirmed: true,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: Object.fromEntries(mediaIds.map(id => [id, HASH])) },
  products: [{ label: "Beach set", description: "Beach photos.", mediaIds, previewMediaIds: [], approvedTotalCents }] });

test("control: a bundle at the sum of its singles, and a single at its category price, are valid", () => {
  assert.equal(validCategoryDraft(category(10_000)), true);
  assert.equal(validCategoryDraft(category(5000, ["1001"])), true);
});

test("Q4: a bundle priced below the sum of its approved singles is refused", () => {
  assert.equal(validCategoryDraft(category(300)), false, "USD 3.00 for two USD 50.00 singles is an invented discount");
  assert.equal(validCategoryDraft(category(9_999)), false, "one cent under the sum is still an invented discount");
});

test("Q4: a single with an approved total below the category price is refused", () => {
  assert.equal(validCategoryDraft(category(300, ["1001"])), false);
});
