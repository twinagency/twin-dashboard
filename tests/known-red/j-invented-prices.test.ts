// KNOWN RED (rule j: no invented discounts, manual prices only; DROP findings Q4 and H2, docs/RISKS.md D12).
// Q4: validCategoryDraft (commercial-categories.ts:35-37) takes a bundle's approvedTotalCents from the request with no tie
//     to the category's single price, so the API accepts a 2-item bundle at USD 3.00 when each single is USD 50.00.
//     The UI never builds bundles (CategoryDrafts.tsx:60), so this is the API path only.
// H2: validMoxyChange (moxy.ts:29-32) only checks `settings` is a record, so an uploaded Moxy setup with products at
//     1 cent or USD 1,000,000 is accepted and forwarded (MoxyControls.tsx:67, moxy/route.ts:39). D12: high.
// Team's Claude owns the fixes. Not wired into npm scripts; init.sh reports them.
import assert from "node:assert/strict";
import test from "node:test";
import { validCategoryDraft } from "../../lib/onlyfans/commercial-categories";
import { starterSettings, validMoxyChange } from "../../lib/onlyfans/moxy";

const HASH = "e".repeat(64);
const category = (approvedTotalCents: number) => ({ folderId: 7, priceCents: 5000, categoryPriceRevision: 1, classificationConfirmed: true, rightsConfirmed: true,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: { "1001": HASH, "1002": HASH } },
  products: [{ label: "Beach pair", description: "Two beach photos.", mediaIds: ["1001", "1002"], previewMediaIds: [], approvedTotalCents }] });
const moxy = (settings: Record<string, unknown>) => ({ expectedRevision: 1, mode: "off", settings });

test("control: a bundle at the sum of its singles and a starter Moxy setup are valid", () => {
  assert.equal(validCategoryDraft(category(10_000)), true);
  assert.equal(validMoxyChange(moxy(starterSettings("synthetic"))), true);
});

test("Q4: a bundle priced below the sum of its approved singles is refused", () => {
  assert.equal(validCategoryDraft(category(300)), false, "USD 3.00 for two USD 50.00 singles is an invented discount");
});

test("H2: a Moxy setup with prices outside the manual range is refused", () => {
  for (const price_cents of [1, 100_000_000]) {
    const settings = { ...starterSettings("synthetic"), products: [{ key: "synthetic-product", price_cents }] };
    assert.equal(validMoxyChange(moxy(settings)), false, `a product at ${price_cents} cents must not be saved`);
  }
});
