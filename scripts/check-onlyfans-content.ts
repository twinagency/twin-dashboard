import assert from "node:assert/strict";
import { createContentBackend, configuredContentBackend } from "../lib/onlyfans/content-backend";
import { CONTENT_SCHEMA, canonicalContent, parseContentItem, parseContentAck, validContentRequest,
  contentItemId, parseContentPrice, displayContentPrice } from "../lib/onlyfans/content";
import { parseCommandJson } from "../lib/onlyfans/command-json";

async function main() {
  const item = { revision: 3, fingerprint: "a".repeat(64), label: "Saved synthetic item", labelTruncated: false,
    description: "A synthetic landscape collection.", descriptionTruncated: false, priceCents: 1007,
    enabled: true, currency: "USD", isFreeTeaser: false };
  const read = { schemaVersion: CONTENT_SCHEMA, ok: true, accountId: "acc-a", itemId: "7", item };
  assert(parseContentItem(read, "acc-a", "7"));
  assert.equal(parseContentItem(read, "acc-b", "7"), null);
  assert.equal(parseContentItem(read, "acc-a", "8"), null);
  for (const change of [{ revision: -1 }, { fingerprint: "bad" }, { label: "é".repeat(81) }, { description: "é".repeat(1001) },
    { labelTruncated: true }, { label: null }, { priceCents: 1 }, { priceCents: 0 }, { priceCents: 20001 }, { enabled: null }, { unexpected: "secret" }])
    assert.equal(parseContentItem({ ...read, item: { ...item, ...change } }, "acc-a", "7"), null);
  assert(parseContentItem({ ...read, item: { ...item, label: null, labelTruncated: true, description: null, descriptionTruncated: true, priceCents: null } }, "acc-a", "7"));
  assert(parseContentItem({ ...read, item: { ...item, isFreeTeaser: true, priceCents: 0 } }, "acc-a", "7"));
  assert.equal(contentItemId("2147483647"), true); assert.equal(contentItemId("2147483648"), false);
  assert.equal(contentItemId("07"), false); assert.equal(contentItemId("7/8"), false);
  const request = { patch: { priceCents: 1007, description: "", enabled: false }, expectedRevision: 3, expectedFingerprint: item.fingerprint };
  assert(validContentRequest(request));
  for (const patch of [{}, { mediaIds: [1] }, { priceCents: 299 }, { priceCents: 1007.1 }, { label: " " }, { enabled: 1 }, { description: "é".repeat(1001) }])
    assert.equal(validContentRequest({ ...request, patch }), false);
  assert.equal(validContentRequest({ ...request, actor: "browser-supplied" }), false);
  assert.equal(parseContentPrice("10.07"), 1007); assert.equal(parseContentPrice("3"), 300);
  assert.equal(parseContentPrice("200.00"), 20000); assert.equal(parseContentPrice("10.005"), null);
  assert.equal(parseContentPrice("200.01"), null); assert.equal(parseContentPrice("1e2"), null);
  assert.equal(parseContentPrice("-3"), null); assert.equal(parseContentPrice("03.00"), null);
  assert.equal(displayContentPrice(1007), "10.07");
  for (let cents = 0; cents <= 20_000; cents++) assert.equal(parseContentPrice(displayContentPrice(cents)), cents);
  for (const raw of [JSON.stringify(request).replace('"priceCents":1007', '"priceCents":1007,"priceCents":1008'),
    JSON.stringify(request).replace('"enabled":false', '"enabled":false,"\\u0065nabled":true')]) assert.throws(() => parseCommandJson(raw));
  const command = { ...request, actor: "op-session:" + "b".repeat(64), commandKey: "c".repeat(64) };
  const ack = { schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "acc-a", itemId: "7", commandKey: command.commandKey,
    recordedRevision: 4, recordedFingerprint: "d".repeat(64) };
  assert(parseContentAck(ack, { ...command, accountId: "acc-a", itemId: "7" }));
  for (const change of [{ accountId: "acc-b" }, { itemId: "8" }, { commandKey: "e".repeat(64) }, { recordedRevision: 5 }, { extra: true }])
    assert.equal(parseContentAck({ ...ack, ...change }, { ...command, accountId: "acc-a", itemId: "7" }), null);
  assert.equal(canonicalContent({ patch: { enabled: true, label: "x" } }), canonicalContent({ patch: { label: "x", enabled: true } }));
  const posted: string[] = [];
  const wire: typeof fetch = async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/items/7");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer synthetic-content-only"); assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("X-OnlyFans-Content-Version"), CONTENT_SCHEMA);
    if (init?.method === "GET") return Response.json(read);
    posted.push(String(init?.body)); if (posted.length === 1) throw new Error("Synthetic lost acknowledgement");
    return Response.json(ack);
  };
  const backend = createContentBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic-content-only", fetchImpl: wire });
  assert((await backend.get("acc-a", "7")).ok);
  const lost = await backend.save("acc-a", "7", command); assert(!lost.ok && lost.outcome === "unconfirmed");
  assert((await backend.save("acc-a", "7", command)).ok); assert.equal(posted[0], posted[1]);
  for (const status of [400, 401, 403, 404, 409, 413, 503, 500]) {
    const result = await createContentBackend({ baseUrl: "http://127.0.0.1:1", token: "synthetic", fetchImpl: async () => new Response("refused", { status }) }).save("acc-a", "7", command);
    assert(!result.ok && result.outcome === (status === 500 ? "unconfirmed" : "refused"));
  }
  const old = { base: process.env.ONLYFANS_API_BASE_URL, content: process.env.ONLYFANS_CONTENT_TOKEN, read: process.env.ONLYFANS_API_TOKEN };
  try {
    process.env.ONLYFANS_API_BASE_URL = "http://127.0.0.1:1";
    process.env.ONLYFANS_CONTENT_TOKEN = "same"; process.env.ONLYFANS_API_TOKEN = "same";
    assert.equal(configuredContentBackend(), null);
    process.env.ONLYFANS_CONTENT_TOKEN = "separate"; assert(configuredContentBackend());
  } finally {
    for (const [key, value] of Object.entries({ ONLYFANS_API_BASE_URL: old.base, ONLYFANS_CONTENT_TOKEN: old.content, ONLYFANS_API_TOKEN: old.read }))
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  console.log("PASS content: scoped item/ack, exact USD cents, UTF-8 bounds, dirty-only metadata, duplicate-key refusal, separate credentials, historical retries and uncertain outcomes");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
