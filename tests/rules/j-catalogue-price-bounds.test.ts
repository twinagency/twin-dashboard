/**
 * Rule j (handover/TEAM-BRIEFING.md §7): singles and approved bundles only, no invented prices or discounts. Dashboard
 * part that holds today: a catalogue item is offerable only with a price a person confirmed, the proposed price is never
 * read as approved, and the price the screen accepts (parseContentPrice, EngineCatalogue.tsx:13) is exactly the price the
 * server route accepts (validCatalogueDecision), so neither side can carry a price the other would refuse.
 * The parts that do not hold (Q4 bundle total, H2 Moxy prices) are in tests/known-red/j-invented-prices.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { canBeOffered, catalogueOfferText, ENGINE_CATALOGUE_SCHEMA, parseEngineCatalogue, validCatalogueDecision } from "../../lib/onlyfans/engine-catalogue";
import { displayContentPrice, parseContentPrice } from "../../lib/onlyfans/content";

const decision = (confirmedPriceCents: unknown) => ({ action: "approve", expectedRevision: 1, expectedFingerprint: "a".repeat(64), confirmedPriceCents });
const screenAccepts = (cents: number) => { const parsed = parseContentPrice(displayContentPrice(cents)); return parsed !== null && parsed >= 300 && parsed === cents; };

test("the screen and the server accept exactly the same confirmed prices", () => {
  const edges = [0, 1, 99, 100, 299, 300, 301, 999, 1200, 9999, 19_999, 20_000, 20_001, 50_000, 99_999];
  for (const cents of [...edges, ...Array.from({ length: 200 }, (_, i) => i * 113)])
    assert.equal(validCatalogueDecision(decision(cents)), screenAccepts(cents), `${cents} cents: screen and server must agree`);
  assert.equal(validCatalogueDecision(decision(300)), true, "control: USD 3.00 is a valid manual price");
  for (const bad of [299, 20_001, 1200.5, "1200", null, -300]) assert.equal(validCatalogueDecision(decision(bad)), false, `${String(bad)} is not a manual price`);
  assert.equal(validCatalogueDecision({ ...decision(1200), discountCents: 100 }), false, "no extra pricing field rides along");
  assert.equal(validCatalogueDecision({ action: "retire", expectedRevision: 1, expectedFingerprint: "a".repeat(64), confirmedPriceCents: 1200 }), false, "retire carries no price");
});

test("only an approved item with a confirmed price can be offered; a proposed price is never an approved one", () => {
  const row = (status: string, proposedPriceCents: number | null, approvedPriceCents: number | null) => ({ itemId: "1001", label: "Beach set", mediaCount: 3, tags: [],
    proposedPriceCents, approvedPriceCents, status, revision: 1, fingerprint: "b".repeat(64) });
  const page = (item: Record<string, unknown>) => parseEngineCatalogue({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, accountId: "of-a", items: [item], nextCursor: null }, "of-a");
  const approved = page(row("approved", 900, 1200))?.items[0];
  assert.ok(approved && canBeOffered(approved)); assert.equal(catalogueOfferText(approved), "Can be offered");
  const proposed = page(row("proposed", 900, null))?.items[0];
  assert.ok(proposed && !canBeOffered(proposed)); assert.equal(catalogueOfferText(proposed), "Not offered yet: needs approval");
  assert.equal(page(row("approved", 900, null)), null, "approved without a confirmed price is refused");
  assert.equal(page(row("proposed", 900, 1200)), null, "a confirmed price on an unapproved item is refused");
  assert.equal(page(row("approved", null, 150)), null, "a confirmed price below USD 3.00 is refused");
});
