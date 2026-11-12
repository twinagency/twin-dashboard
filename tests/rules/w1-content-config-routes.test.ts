/**
 * W1 lane 6 (app-onlyfans-content-config): the parts of REVIEW.md inv 7 that hold today in the drop's content/configuration routes,
 * driven through the real route handlers as the internal operator with a fake wire (tests/helpers/w1-content-config-route-harness.ts).
 * H1-H3: the category price, review and drafts routes validate before any upstream call (money bounds 300..20000, exact keys, nonce,
 * fingerprint, ids, no stray query). H4: the engine-catalogue key is reused by an identical retry, differs for a different decision,
 * and the relayed actor is the session's. H5: a preparation configure retried with the same requestId relays the same commandKey,
 * a different config a different one (a configure, not the revision-gated stop of lane 3 F7). What does not hold is in tests/known-red/w1-content-config-*.test.ts.
 * Mutation proofs: tests/rules/mutations/W1-app-onlyfans-content-config/.
 * init.sh runs tests/rules/*.test.* without --experimental-test-module-mocks; the file then re-runs itself with it (ensureModuleMocks).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HASH, NONCE, OPERATOR_ACTOR, ROUTES, call, calls, category, decision, ensureModuleMocks, preparationConfig, routeMockDrift, upstream } from "../helpers/w1-content-config-route-harness";

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 5 })) {
  test("control: the route.ts mock follows lib/onlyfans/route.ts", () => {
    assert.deepEqual(routeMockDrift(), []);
  });

  test("H1: category-price POST refuses an invalid price change before any upstream call", async () => {
    const valid = { requestId: NONCE, priceCents: 5000, expectedFingerprint: HASH };
    const send = (body: unknown, folderId = "7", query = "") => call(ROUTES.price, { accountId: "of-a", folderId }, { body, query });
    const invalid: [string, () => Promise<Response>][] = [
      ["299 cents", () => send({ ...valid, priceCents: 299 })],
      ["20001 cents", () => send({ ...valid, priceCents: 20001 })],
      ["300.5 cents", () => send({ ...valid, priceCents: 300.5 })],
      ["string price", () => send({ ...valid, priceCents: "500" })],
      ["extra key", () => send({ ...valid, actor: "client-forged" })],
      ["bad fingerprint", () => send({ ...valid, expectedFingerprint: "E".repeat(64) })],
      ["non-digit folderId", () => send(valid, "7a")],
      ["query string", () => send(valid, "7", "?force=1")],
    ];
    for (const [name, attempt] of invalid) {
      upstream();
      assert.equal((await attempt()).status, 400, `${name}: refused`);
      assert.equal(calls.length, 0, `${name}: no upstream call`);
    }
    for (const priceCents of [300, 20000]) {
      upstream();
      await send({ ...valid, priceCents });
      assert.equal(calls.length, 1, `${priceCents} cents: relayed exactly once`);
      assert.equal(calls[0].body?.priceCents, priceCents);
    }
  });

  test("H2: category-review GET refuses an invalid media list before any upstream call", async () => {
    const read = (query: string) => call(ROUTES.review, { accountId: "of-a", folderId: "7" }, { query: `?${query}` });
    const many = Array.from({ length: 501 }, (_, i) => String(1001 + i)).join(",");
    const invalid: [string, string][] = [
      ["duplicate id", "mediaIds=1001,1001"],
      ["501 ids", `mediaIds=${many}`],
      ["non-id", "mediaIds=1001,abc"],
      ["two mediaIds params", "mediaIds=1001&mediaIds=1002"],
      ["extra param", "mediaIds=1001&x=1"],
    ];
    for (const [name, query] of invalid) {
      upstream();
      assert.equal((await read(query)).status, 400, `${name}: refused`);
      assert.equal(calls.length, 0, `${name}: no upstream call`);
    }
    upstream();
    await read("mediaIds=1001,1002");
    assert.equal(calls.length, 1, "a valid list is relayed exactly once");
    assert.equal(calls[0].method, "GET");
  });

  test("H3: category-drafts POST refuses an invalid request before any upstream call", async () => {
    const send = (body: unknown) => call(ROUTES.drafts, { accountId: "of-a" }, { body });
    const invalid: [string, unknown][] = [
      ["extra body key", { requestId: NONCE, category, commandKey: "f".repeat(64) }],
      ["bad requestId", { requestId: "not-a-uuid", category }],
      ["category priced 299", { requestId: NONCE, category: { ...category, priceCents: 299 } }],
    ];
    for (const [name, body] of invalid) {
      upstream();
      assert.equal((await send(body)).status, 400, `${name}: refused`);
      assert.equal(calls.length, 0, `${name}: no upstream call`);
    }
    upstream();
    await send({ requestId: NONCE, category });
    assert.equal(calls.length, 1, "control: a valid request is relayed exactly once (route.ts mock applied)");
  });

  test("H4: engine-catalogue keys are reused by a retry, differ per decision, and carry the session actor", async () => {
    const send = (body: unknown) => call(ROUTES.catalogue, { accountId: "of-a", itemId: "123" }, { body });
    upstream();
    assert.equal((await send({ ...decision, actor: "client-forged" })).status, 400, "a client-supplied actor is refused");
    assert.equal(calls.length, 0);
    for (const body of [decision, decision, { ...decision, confirmedPriceCents: 1300 }, { ...decision, expectedRevision: 4 }]) await send(body);
    assert.equal(calls.length, 4);
    const keys = calls.map(c => c.body?.commandKey);
    assert.match(String(keys[0]), /^[a-f0-9]{64}$/);
    assert.equal(keys[1], keys[0], "an identical retry relays the same key");
    assert.notEqual(keys[2], keys[0], "another price is another decision");
    assert.notEqual(keys[3], keys[0], "another revision is another decision");
    for (const c of calls) assert.equal(c.body?.actor, OPERATOR_ACTOR, "the relayed actor is the session's");
  });

  test("H5: a preparation configure retried with the same requestId relays the same commandKey, a different config a different one", async () => {
    const send = (body: unknown) => call(ROUTES.preparation, { accountId: "of-a" }, { body });
    const configure = { action: "configure", expectedRevision: 3, requestId: NONCE, reason: "prepare the account", config: preparationConfig };
    const other = { ...configure, config: { ...preparationConfig, limits: { ...preparationConfig.limits, provider_requests: 11 } } };
    upstream();
    for (const body of [configure, configure, other]) await send(body);
    assert.equal(calls.length, 3, "each send relayed once");
    assert.match(String(calls[0].body?.commandKey), /^[a-f0-9]{64}$/);
    assert.equal(calls[1].body?.commandKey, calls[0].body?.commandKey, "a retry with the same requestId relays the same key");
    assert.notEqual(calls[2].body?.commandKey, calls[0].body?.commandKey, "a different config is a different command");
    for (const c of calls) assert.equal(c.body?.actor, OPERATOR_ACTOR, "the relayed actor is the session's");
  });
}
