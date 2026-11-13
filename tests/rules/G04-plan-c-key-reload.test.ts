/**
 * RULE G04, was KNOWN RED (W1 lane 1 finding 6; REVIEW.md invariant 7 "carries an idempotency key that a user retry reuses").
 * lib/onlyfans/plan-c-client.ts kept the unconfirmed intent's key in an in-memory Map only, so a page reload minted a new key for the
 * same intent while PLAN_C_UNCONFIRMED_TEXT says "Retrying the same action is safe: it reuses the same key".
 * A real reload drops every module-level variable, and the client caches one store per operator + account at module level, so two
 * clients in one node process share a store and prove nothing about a reload (measured: tsx ignores a cache-busting `?reload=n`
 * import query). These tests therefore build two separate createCommandKeyStore instances over one seeded Web Storage.
 * Green since G04: a store with `persistAs` (the client names it plan-c-keys:<operator scope>:<account>) mirrors pending keys to
 * sessionStorage under a hash of the intent, a reloaded key is held, and day-old entries are pruned (#389 R2 S6: by age only, once,
 * in memory and storage alike; no count cap, since every entry is in flight or held and dropping one lets a retry act twice).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandKeyStore, createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import type { PlanCUnresolvedItem } from "../../lib/onlyfans/plan-c";
import { MOCK_ACCOUNT, parsedDraft, recordingFetch } from "./plan-c-fixtures";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) } });

const NAME = `plan-c-keys:operator-a:${MOCK_ACCOUNT}`;
const INTENT = "draft:reject:req-1:1:v3:the fan asked for a refund";
let n = 0;
const mint = () => (++n).toString(16).padStart(64, "0");

test("finding 6: a fresh store over the same storage (a reload) reuses the pending key, and holds it through a refusal", () => {
  store.clear();
  const before = createCommandKeyStore(mint, NAME);
  const key = before.keyFor(INTENT);
  before.settle(INTENT, "unconfirmed");
  const after = createCommandKeyStore(mint, NAME);
  assert.equal(after.keyFor(INTENT), key, "a reload minted a new key for an intent whose outcome is unconfirmed");
  after.settle(INTENT, "refused");
  assert.equal(after.keyFor(INTENT), key, "a refusal after a reload released a key whose earlier attempt may have committed");
  assert.equal(createCommandKeyStore(mint, NAME).keyFor(INTENT), key, "the refusal removed the held key from storage");
  after.settle(INTENT, "ack");
  assert.notEqual(createCommandKeyStore(mint, NAME).keyFor(INTENT), key, "a recorded ack releases the key");
});

test("storage holds the key under a hash of the intent, never the intent text", () => {
  store.clear();
  createCommandKeyStore(mint, NAME).keyFor(INTENT);
  const saved = store.get(NAME) ?? "";
  assert.ok(saved.length > 0);
  assert.ok(!saved.includes("refund") && !saved.includes("req-1"), saved);
});

test("malformed storage is an empty store, never a throw", () => {
  for (const bad of ["{not json", "[]", "null", JSON.stringify({ abc: ["f".repeat(64), Date.now()] }), JSON.stringify({ ["0".repeat(16)]: "f".repeat(64) })]) {
    store.set(NAME, bad);
    const fresh = createCommandKeyStore(mint, NAME);
    assert.equal(fresh.size(), 0, bad);
  }
});

test("stale entries expire in memory and storage, and no pending or held key is dropped by count", () => {
  store.clear();
  let clock = 0;
  const old = createCommandKeyStore(mint, NAME, () => clock);
  const key = old.keyFor(INTENT);
  clock = 24 * 3600_000 + 1;
  assert.notEqual(createCommandKeyStore(mint, NAME, () => clock).keyFor(INTENT), key, "a day-old entry was reused");
  store.clear();
  const many = createCommandKeyStore(mint, NAME, () => clock);
  const first = many.keyFor("intent 0");
  many.settle("intent 0", "unconfirmed");
  for (let i = 1; i < 60; i++) many.keyFor(`intent ${i}`);
  assert.equal(many.keyFor("intent 0"), first, "a held key was dropped");
  assert.equal(Object.keys(JSON.parse(store.get(NAME)!)).length, 60);
  assert.equal(createCommandKeyStore(mint, NAME, () => clock).size(), 60);
  clock += 24 * 3600_000;
  many.keyFor("intent 60");
  assert.equal(many.size(), 1, "day-old entries stayed in memory");
  assert.equal(Object.keys(JSON.parse(store.get(NAME)!)).length, 1);
});

test("G04c2 #10: the same store instance never hands out a day-old key; expiry is checked before the lookup", () => {
  store.clear();
  let clock = 0;
  const live = createCommandKeyStore(mint, NAME, () => clock);
  const key = live.keyFor(INTENT);
  clock = 24 * 3600_000 + 1;
  assert.notEqual(live.keyFor(INTENT), key, "a day-old key was reused by the instance that minted it");
  assert.equal(live.size(), 1, "the day-old entry stayed beside the new one");
});

test("another operator's scope never reuses the key", async () => {
  store.clear();
  const draft = parsedDraft(), { sent, fetchImpl } = recordingFetch(() => { throw new TypeError("reply lost"); });
  await createPlanCClient({ accountId: MOCK_ACCOUNT, operatorScope: "operator-a", fetchImpl }).approveDraft(draft);
  await createPlanCClient({ accountId: MOCK_ACCOUNT, operatorScope: "operator-b", fetchImpl }).approveDraft(draft);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1], sent[0]);
  assert.ok([...store.keys()].some(k => k.includes("operator-a")) && [...store.keys()].some(k => k.includes("operator-b")));
});

test("reconcile: the item id and the evidence cannot run together into another intent", async () => {
  store.clear();
  const keys = createCommandKeyStore(mint), { sent, fetchImpl } = recordingFetch(() => { throw new TypeError("reply lost"); });
  const client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl, keys });
  const item = (id: string) => ({ id }) as PlanCUnresolvedItem;
  await client.reconcile(item("a"), "msg:123456");
  await client.reconcile(item("a:msg"), "123456");
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1], sent[0], "two different reconciliations shared one commandKey");
});
