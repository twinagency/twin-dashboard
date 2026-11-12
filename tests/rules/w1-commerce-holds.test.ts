/**
 * W1 lane 3 (lib-onlyfans-commerce): the parts of REVIEW.md inv 7 that hold today in the drop's commerce files.
 * D7: a Moxy save whose outcome is unknown (503 with or without a body, thrown fetch, unreadable 200) reads "unconfirmed"
 * and is attempted once. No false success: a category drafts ack is refused unless it echoes our commandKey, every draft is
 * disabled and priced as requested; a category price ack is unconfirmed unless it echoes our commandKey and names our folder;
 * a preparation POST ack is unconfirmed unless it echoes our commandKey. Money: category prices are 300..20000 cents both ways. Preparation never enables sales
 * or automatic replies, needs an explicit qualification mode and cannot spend more per request than its budget.
 * The parts that do not hold are in tests/known-red/w1-commerce-*.test.ts. Mutation proofs: tests/rules/mutations/W1-lib-onlyfans-commerce/.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMoxyBackend } from "../../lib/onlyfans/moxy-backend";
import { parseCategoryDraftAck, parseCategoryPrice, validCategoryDraft, type CategoryDraft } from "../../lib/onlyfans/commercial-categories";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { parsePreparationState, validPreparationConfig } from "../../lib/onlyfans/preparation";
import { createVaultBackend } from "../../lib/onlyfans/vault-backend";
import { HASH, preparationConfig as config, preparationState as preparation, sendPreparationStop } from "../helpers/w1-commerce-preparation-stub";

const KEY = "c".repeat(64);

test("a Moxy save with an unknown outcome is unconfirmed after exactly one call", async () => {
  const cases: [string, () => Response][] = [
    ["503 with a JSON body", () => new Response(JSON.stringify({ error: "synthetic unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } })],
    ["503 without a body", () => new Response(null, { status: 503 })],
    ["thrown fetch", () => { throw new TypeError("synthetic network failure"); }],
    ["200 with a non-JSON body", () => new Response("<html>synthetic</html>", { status: 200 })],
  ];
  for (const [name, respond] of cases) {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return respond(); }) as typeof fetch;
    const result = await createMoxyBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl })
      .save("of-a", { expectedRevision: 1, mode: "off", settings: {} }, "operator:synthetic");
    assert.equal(calls, 1, `${name}: attempted once, never retried`);
    assert.equal(result.ok ? null : result.outcome, "unconfirmed", `${name}: outcome unknown, never refused`);
  }
});

const category: CategoryDraft = { folderId: 7, priceCents: 5000, categoryPriceRevision: 1, classificationConfirmed: true, rightsConfirmed: true,
  reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: HASH, assets: { "1001": HASH } },
  products: [{ label: "Beach single", description: "One beach photo.", mediaIds: ["1001"], previewMediaIds: [] }] };
const draftAck = (top: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "of-a", commandKey: KEY,
  items: [{ itemId: "2001", commandKey: "f".repeat(64), categoryId: "7", categoryName: "Beach", item: { revision: 0, fingerprint: HASH, label: "Beach single", labelTruncated: false,
    description: "One beach photo.", descriptionTruncated: false, priceCents: 5000, enabled: false, currency: "USD", isFreeTeaser: false, ...item } }], ...top });

test("a category drafts ack is refused for a foreign commandKey", () => {
  assert.equal(parseCategoryDraftAck(draftAck(), "of-a", KEY, category)?.length, 1, "control: a matching ack parses");
  assert.equal(parseCategoryDraftAck(draftAck({ commandKey: "d".repeat(64) }), "of-a", KEY, category), null);
});

test("a category drafts ack is refused when a draft comes back enabled", () => {
  assert.equal(parseCategoryDraftAck(draftAck({}, { enabled: true }), "of-a", KEY, category), null, "a draft must never be sellable on creation");
});

test("a category drafts ack is refused when a draft price differs from the request", () => {
  for (const priceCents of [4999, 5001, 300]) assert.equal(parseCategoryDraftAck(draftAck({}, { priceCents }), "of-a", KEY, category), null, `${priceCents} acked for a 5000 request`);
});

const priceAck = (extra: Record<string, unknown> = {}) => ({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "of-a", commandKey: KEY, targetId: "7", fingerprint: HASH, ...extra });
async function setPrice(body: unknown) {
  const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const result = await createVaultBackend({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl })
    .setCategoryPrice("of-a", "7", { priceCents: 5000, expectedFingerprint: HASH, actor: "operator:synthetic", commandKey: KEY });
  return result.ok ? "ok" : result.outcome;
}

test("a category price ack with a foreign commandKey is unconfirmed", async () => {
  assert.equal(await setPrice(priceAck()), "ok", "control: a matching ack is ok");
  assert.equal(await setPrice(priceAck({ commandKey: "d".repeat(64) })), "unconfirmed");
});

test("a category price ack naming another folder is unconfirmed", async () => {
  assert.equal(await setPrice(priceAck({ targetId: "7" })), "ok", "control: our folder is ok");
  assert.equal(await setPrice(priceAck({ targetId: "8" })), "unconfirmed");
});

// Pins the draft floor/ceiling of validCategoryDraft as a whole: m10 (commercial-categories.ts:32 AND vault.ts:55) goes red,
// m14 (:32 alone) stays green because validVaultProduct re-checks each product's price. :32 alone is not pinned here.
test("category prices are 300..20000 cents in the price parser and the draft validator", () => {
  const price = (priceCents: number) => parseCategoryPrice({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "of-a",
    categoryPrice: { folderId: "7", name: "Beach", revision: 1, priceCents, currency: "USD", appliesTo: "single_asset", fingerprint: HASH } }, "of-a", "7");
  for (const cents of [300, 20_000]) { assert.notEqual(price(cents), null, `${cents} parses`); assert.equal(validCategoryDraft({ ...category, priceCents: cents }), true, `${cents} drafts`); }
  for (const cents of [299, 20_001]) { assert.equal(price(cents), null, `${cents} refused by parser`); assert.equal(validCategoryDraft({ ...category, priceCents: cents }), false, `${cents} refused by draft`); }
});

test("a preparation state that enables sales is refused", () => {
  assert.notEqual(parsePreparationState(preparation()), null, "control: a configured state parses");
  assert.equal(parsePreparationState(preparation({ salesEnabled: true })), null);
});

test("a preparation state that enables automatic replies is refused", () => {
  assert.equal(parsePreparationState(preparation({ automaticRepliesEnabled: true })), null);
});

test("a preparation config needs an explicit qualification mode", () => {
  assert.equal(validPreparationConfig(config), true, "control: a fixture config is valid");
  assert.equal(validPreparationConfig({ ...config, qualification: { reference: "synthetic-approval" } }), false, "missing mode must not default to anything");
});

test("a preparation config cannot spend more per request than its budget", () => {
  assert.equal(validPreparationConfig({ ...config, limits: { ...config.limits, provider_credits_per_request: 100 } }), true, "control: per request == budget");
  assert.equal(validPreparationConfig({ ...config, limits: { ...config.limits, provider_credits_per_request: 101 } }), false);
});

// The stop is answered status "stopped" so a correct F8 fix (ack tied to the action) keeps the control green.
async function preparationAnswered(commandKey: string) {
  const result = await sendPreparationStop(KEY, { commandKey, preparation: preparation({ status: "stopped" }) });
  return result.ok ? "ok" : result.outcome;
}

test("a preparation POST ack that does not echo our commandKey is unconfirmed", async () => {
  assert.equal(await preparationAnswered(KEY), "ok", "control: a matching ack is ok");
  assert.equal(await preparationAnswered("d".repeat(64)), "unconfirmed");
});
