/**
 * Rule b (handover/TEAM-BRIEFING.md §7) dashboard part + REVIEW.md inv 7 "Unconfirmed is not refused (D7)", W1 lane 2.
 * Characterization of what holds today for the two engine write backends, createEngineOperatorBackend
 * (lib/onlyfans/engine-operator.ts) and createEngineCatalogueBackend (lib/onlyfans/engine-catalogue-backend.ts): a reply
 * that does not prove the write was not applied (429, 5xx, a 200 that cannot be read, a 200 acknowledging another account,
 * a network error, an abort or timeout) reads "unconfirmed"; the statuses both copies agree prove nothing was applied read
 * "refused"; only a matching acknowledgement is success. Call count is owned by tests/rules/b-unknown-no-resend.test.tsx.
 * Deliberately excluded: 503 (reads "refused" today, known-red tests/known-red/b-d7-503-unconfirmed.test.ts) and
 * 405/410/422 (the two copies disagree, finding 9 in docs/review/W1/lib-onlyfans-engine.md).
 * Offline: fetchImpl fakes to https://backend.invalid, nothing leaves the process.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createEngineOperatorBackend } from "../../lib/onlyfans/engine-operator";
import { createEngineCatalogueBackend } from "../../lib/onlyfans/engine-catalogue-backend";

const ACCOUNT = "of-a", CONVERSATION = "of-a:42", REQUEST = "0a1b2c3d-1111-4222-8333-444455556661", ITEM = "123";
const options = (fetchImpl: typeof fetch) => ({ baseUrl: "https://backend.invalid", token: "synthetic-token", fetchImpl });

type Outcome = { ok: true } | { ok: false; outcome: "refused" | "unconfirmed" };
type Backend = { name: string; run: (fetchImpl: typeof fetch) => Promise<Outcome>; ack: (accountId: string) => Record<string, unknown> };
const BACKENDS: Backend[] = [
  { name: "engine operator",
    run: fetchImpl => createEngineOperatorBackend(options(fetchImpl))({ accountId: ACCOUNT, conversationId: CONVERSATION, requestId: REQUEST,
      action: "complete", expectedRevision: 5, commandKey: "a".repeat(64), actor: "operator:synthetic", note: "checked", environment: "live" }),
    ack: accountId => ({ schemaVersion: "of-engine-operator.v1", ok: true, accountId, conversationId: CONVERSATION, requestId: REQUEST, action: "complete",
      commandKey: "a".repeat(64), status: "completed", recordedRevision: 6, owner: "agency-user", nextStep: "none", replayed: false }) },
  { name: "engine catalogue",
    run: fetchImpl => createEngineCatalogueBackend(options(fetchImpl))(ACCOUNT, ITEM, { action: "approve", expectedRevision: 1,
      expectedFingerprint: "b".repeat(64), confirmedPriceCents: 1200, commandKey: "c".repeat(64), actor: "operator:synthetic" }),
    ack: accountId => ({ schemaVersion: "of-engine-catalogue.v1", ok: true, applied: true, accountId, itemId: ITEM, commandKey: "c".repeat(64),
      action: "approve", recordedRevision: 2, status: "approved" }) },
];

/** Runs one write against a fake upstream and returns its outcome. */
const attempt = (backend: Backend, reply: () => Response | Promise<Response>) => backend.run((async () => reply()) as typeof fetch);
const status = (code: number) => () => new Response("upstream says no", { status: code });

const UNCONFIRMED: Array<[string, (backend: Backend) => () => Response | Promise<Response>]> = [
  ["429", () => status(429)], ["500", () => status(500)], ["502", () => status(502)], ["504", () => status(504)],
  ["200 with a non-JSON body", () => () => new Response("<html>ok</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
  ["200 acknowledging another account", backend => () => Response.json(backend.ack("of-b"), { status: 200 })],
  ["thrown network error", () => () => { throw new TypeError("fetch failed"); }],
  ["AbortError", () => () => { throw new DOMException("The operation was aborted.", "AbortError"); }],
  ["timeout", () => () => { throw new DOMException("The operation timed out.", "TimeoutError"); }],
];
const REFUSED = [400, 401, 403, 404, 409, 413];

test("an engine write is success only on a matching acknowledgement for this account", async () => {
  for (const backend of BACKENDS)
    assert.deepEqual(await attempt(backend, () => Response.json(backend.ack(ACCOUNT), { status: 200 })), { ok: true }, `${backend.name}: matching ack`);
});

test("an engine write reply that does not prove the write was not applied reads unconfirmed", async () => {
  for (const backend of BACKENDS) for (const [label, reply] of UNCONFIRMED) {
    const result = await attempt(backend, reply(backend));
    assert.equal(result.ok, false, `${backend.name} ${label}: never success`);
    if (!result.ok) assert.equal(result.outcome, "unconfirmed", `${backend.name} ${label}: unconfirmed, not refused`);
  }
});

test("an engine write status that proves the write was not applied reads refused", async () => {
  for (const backend of BACKENDS) for (const code of REFUSED) {
    const result = await attempt(backend, status(code));
    assert.equal(result.ok, false, `${backend.name} ${code}: never success`);
    if (!result.ok) assert.equal(result.outcome, "refused", `${backend.name} ${code}: refused`);
  }
});
