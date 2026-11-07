import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canBeOffered, catalogueOfferText, parseCatalogueDecisionAck, parseEngineCatalogue, validCatalogueDecision, ENGINE_CATALOGUE_SCHEMA } from "../../lib/onlyfans/engine-catalogue";
import { createEngineCatalogueBackend } from "../../lib/onlyfans/engine-catalogue-backend";
import { createEngineStatusBackend } from "../../lib/onlyfans/engine-status-backend";

const catalogue = () => JSON.parse(readFileSync(new URL("./fixtures/engine-catalogue.json", import.meta.url), "utf8"));
const hash = "a".repeat(64);

test("the catalogue read keeps status, media count, tags and the proposed price apart from the approved price", () => {
  const page = parseEngineCatalogue(catalogue(), "of-a");
  assert.ok(page);
  const [proposed, approved, retired] = page.items;
  assert.deepEqual([proposed.status, approved.status, retired.status], ["proposed", "approved", "retired"]);
  assert.equal(proposed.mediaCount, 6); assert.deepEqual(proposed.tags, ["beach", "bikini"]);
  assert.equal(proposed.proposedPriceCents, 1500); assert.equal(proposed.approvedPriceCents, null);
  assert.equal(approved.approvedPriceCents, 2500);
  assert.deepEqual(page.items.map(canBeOffered), [false, true, false]);
  assert.deepEqual(page.items.map(catalogueOfferText), ["Not offered yet: needs approval", "Can be offered", "Retired: will not be offered"]);
});

test("a row that claims approval without a confirmed price, or a price without approval, is refused", () => {
  const base = catalogue();
  const withItem = (patch: object) => ({ ...base, items: [{ ...base.items[0], ...patch }] });
  assert.equal(parseEngineCatalogue(withItem({ status: "approved" }), "of-a"), null);
  assert.equal(parseEngineCatalogue(withItem({ approvedPriceCents: 1500 }), "of-a"), null);
  assert.equal(parseEngineCatalogue(withItem({ status: "live" }), "of-a"), null);
  assert.equal(parseEngineCatalogue(withItem({ proposedPriceCents: 5 }), "of-a"), null);
  assert.equal(parseEngineCatalogue(withItem({ tags: [""] }), "of-a"), null);
  assert.equal(parseEngineCatalogue(withItem({ extra: 1 }), "of-a"), null);
  assert.equal(parseEngineCatalogue(base, "of-b"), null);
  assert.equal(parseEngineCatalogue({ ...base, items: [base.items[0], base.items[0]] }, "of-a"), null);
});

test("decisions are exact: approve needs a confirmed price, retire carries none", () => {
  assert.equal(validCatalogueDecision({ action: "approve", expectedRevision: 0, expectedFingerprint: hash, confirmedPriceCents: 1500 }), true);
  assert.equal(validCatalogueDecision({ action: "retire", expectedRevision: 2, expectedFingerprint: hash }), true);
  for (const bad of [{ action: "approve", expectedRevision: 0, expectedFingerprint: hash }, { action: "approve", expectedRevision: 0, expectedFingerprint: hash, confirmedPriceCents: 299 },
    { action: "approve", expectedRevision: 0, expectedFingerprint: hash, confirmedPriceCents: 20001 }, { action: "approve", expectedRevision: 0, expectedFingerprint: hash, confirmedPriceCents: 15.5 },
    { action: "retire", expectedRevision: 0, expectedFingerprint: hash, confirmedPriceCents: 1500 }, { action: "propose", expectedRevision: 0, expectedFingerprint: hash },
    { action: "retire", expectedRevision: -1, expectedFingerprint: hash }, { action: "retire", expectedRevision: 0, expectedFingerprint: "short" }, null, []])
    assert.equal(validCatalogueDecision(bad), false, JSON.stringify(bad));
});

const decision = { action: "approve" as const, expectedRevision: 0, expectedFingerprint: hash, confirmedPriceCents: 1500, commandKey: "c".repeat(64), actor: "op-session:x" };
const ack = (patch: object = {}) => ({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, applied: true, accountId: "of-a", itemId: "11", commandKey: decision.commandKey, action: "approve", recordedRevision: 1, status: "approved", ...patch });

test("the decision client sends one scoped command and verifies the acknowledgement", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const decide = createEngineCatalogueBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async (url, init) => { seen.push({ url: String(url), init }); return Response.json(ack()); } });
  assert.deepEqual(await decide("of-a", "11", decision), { ok: true });
  assert.equal(seen[0].url, "http://backend.invalid/onlyfans/content/v1/accounts/of-a/engine-catalogue/11");
  assert.equal(seen[0].init?.method, "POST"); assert.equal(seen[0].init?.redirect, "error");
  assert.equal(JSON.parse(String(seen[0].init?.body)).confirmedPriceCents, 1500);
  for (const bad of [ack({ status: "retired" }), ack({ recordedRevision: 5 }), ack({ itemId: "12" }), ack({ commandKey: "d".repeat(64) })]) {
    const result = await createEngineCatalogueBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async () => Response.json(bad) })("of-a", "11", decision);
    assert.equal(result.ok === false && result.outcome, "unconfirmed");
  }
  assert.equal(parseCatalogueDecisionAck(ack(), { ...decision, accountId: "of-a", itemId: "11" })?.status, "approved");
});

test("an unserved route or a conflict is a refusal; a lost reply is unconfirmed", async () => {
  const run = (response: () => Response) => createEngineCatalogueBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async () => response() })("of-a", "11", decision);
  for (const status of [404, 405, 400, 403]) { const result = await run(() => new Response(null, { status })); assert.equal(result.ok === false && result.outcome, "refused", String(status)); }
  const conflict = await run(() => new Response(null, { status: 409 })); assert.match(conflict.ok ? "" : conflict.error, /changed/);
  const lost = await createEngineCatalogueBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async () => { throw new Error("lost"); } })("of-a", "11", decision);
  assert.equal(lost.ok === false && lost.outcome, "unconfirmed");
});

test("the catalogue list read passes the cursor and parses the page", async () => {
  const urls: string[] = [];
  const read = createEngineStatusBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async url => { urls.push(String(url)); return Response.json(catalogue()); } });
  const result = await read.catalogue("of-a", { cursor: "next=", limit: 20 });
  assert.equal(urls[0], "http://backend.invalid/onlyfans/api/v1/accounts/of-a/engine/catalogue?limit=20&cursor=next%3D");
  assert.equal(result.ok && result.data.items.length, 3);
});
