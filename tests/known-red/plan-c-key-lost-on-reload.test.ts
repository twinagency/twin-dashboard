/**
 * KNOWN RED (W1 lane 1 finding 6; REVIEW.md invariant 7 "carries an idempotency key that a user retry reuses").
 * lib/onlyfans/plan-c-client.ts:18-24,33 keeps the unconfirmed intent's key in an in-memory Map, so a page reload (a new client)
 * mints a new key for the same intent while the text says "Retrying the same action is safe: it reuses the same key"
 * (plan-c.ts:212). Measured: two default clients, same draft approve after an unconfirmed reply -> two different commandKeys,
 * so the backend can commit twice.
 * `sessionStorage` and `localStorage` (also as `window.*`) are installed, both backed by ONE Map, so a storage-backed fix can go
 * green under node. A real reload also drops every module-level variable; node cannot show that here (measured: tsx ignores a
 * cache-busting `?reload=n` import query and returns the same module instance), so the red also asserts the pending key was
 * written to Web Storage.
 * Accepted fixes (turn it green): the DEFAULT key store (`createPlanCClient` without `keys`) persisting pending intent keys in
 * window.sessionStorage or window.localStorage, scoped to account + operator, until the outcome is definite.
 * Stay red: a module-level Map (survives a new client, not a reload), and a persistent store injected only from PlanCConsole.tsx
 * (this test exercises the default store; that fix needs its own test).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { MOCK_ACCOUNT, parsedDraft, recordingFetch } from "../rules/plan-c-fixtures";

const store = new Map<string, string>();
const webStorage = () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
for (const name of ["sessionStorage", "localStorage"]) Object.defineProperty(globalThis, name, { configurable: true, value: webStorage() });
Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });

const lost = () => recordingFetch(() => { throw new TypeError("reply lost"); });

test("control: the same client retrying an unconfirmed approve reuses its key", async () => {
  store.clear();
  const draft = parsedDraft(), { sent, fetchImpl } = lost();
  const client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl });
  const first = await client.approveDraft(draft);
  assert.equal(first.ok, false); if (!first.ok) assert.equal(first.outcome, "unconfirmed");
  await client.approveDraft(draft);
  assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]);
});

test("finding 6: after a reload (a new client) the same unconfirmed intent reuses the same key, kept in Web Storage", async () => {
  store.clear();
  const draft = parsedDraft(), { sent, fetchImpl } = lost();
  await createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl }).approveDraft(draft);
  const persisted = [...store.values()].some(value => value.includes(sent[0]));
  await createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl }).approveDraft(draft);
  assert.equal(sent.length, 2);
  assert.equal(sent[1], sent[0], "a reload minted a new key for an intent whose outcome is unconfirmed");
  assert.ok(persisted, "the unconfirmed intent's key is not in sessionStorage/localStorage, so a real reload loses it");
});
