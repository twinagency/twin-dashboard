// RULE G04c3h held-key-retention (regression guard; REVIEW.md inv 7: unknown-delivery holds win). Promoted from batch rwl 1
// (/tmp/rwl-batch1/FINDINGS.md) items B2, B4, B5 on #400 (G04c2), all proven red at d504d672.
//   B2 lib/onlyfans/plan-c-client.ts dropped every key older than 24h, in memory and on reload, held or in flight. A send or campaign create
//      rebuilt after that got a fresh key and could reach the fan twice. Every entry in the store is unresolved (an ack, or a refusal of a
//      never-unconfirmed attempt, deletes it at once), so now none expires: a day-old one is kept and listed by needsReview().
//   B4 the "stale" mark of a first revision refusal lived in memory only, so two refusals in a row across a reload never released the hold.
//   B5 a held write's request (message or campaign text) outlived sign-out in sessionStorage; cleanup ran only on a 401. Now the first held
//      store opened under a new operator scope forgets every other scope's held writes, in memory and storage, and keeps its own.
// Offline: a Map-backed Web Storage, synthetic ids. Assertions filter storage by name prefix, never by total length.
//   node --import tsx --test tests/rules/G04c3h-held-key-retention.test.ts
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createCommandKeyStore, heldKeyStore } from "../../lib/onlyfans/plan-c-client";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, String(v)), removeItem: (k: string) => void storage.delete(k),
  key: (i: number) => [...storage.keys()][i] ?? null, get length() { return storage.size; } } });
beforeEach(() => storage.clear());

const DAY = 24 * 3600_000;
const NAME = "of-campaign-keys:op-g04c3h:of-acct";
const INTENT = JSON.stringify({ kind: "create", body: { name: "Spring note" } });
const REQUEST = { kind: "create", body: { name: "Spring note" } };
let n = 0;
const mint = () => (++n).toString(16).padStart(64, "0");
const named = (prefix: string) => [...storage.keys()].filter(name => name.startsWith(prefix));

test("B2: an unconfirmed key outlives a day in the instance that holds it and across a reload, and is flagged for review", () => {
  let clock = 0;
  const live = createCommandKeyStore(mint, NAME, () => clock);
  const key = live.keyFor(INTENT, REQUEST);
  live.settle(INTENT, "unconfirmed");
  clock = DAY + 1;
  assert.equal(live.keyFor(INTENT), key, "the holding instance dropped a day-old unconfirmed key");
  const reloaded = createCommandKeyStore(mint, NAME, () => clock);
  assert.equal(reloaded.keyFor(INTENT), key, "a reload dropped a day-old unconfirmed key: a rebuilt create would get a fresh one");
  assert.deepEqual(reloaded.pending(), [REQUEST], "the day-old hold is no longer offered with its original request");
  assert.deepEqual(reloaded.needsReview(), [REQUEST], "the day-old hold is not flagged held, needs review");
  assert.deepEqual(createCommandKeyStore(mint, NAME, () => DAY - 1).needsReview(), [], "control: a hold younger than a day is not flagged");
  assert.equal(reloaded.settle(INTENT, "ack"), false, "control: an ack still releases a day-old hold");
  assert.equal(named(NAME).length, 0, "the acked hold stayed in storage");
});

test("B2: an attempt still in flight when the page went away is held after a day too, never silently dropped", () => {
  let clock = 0;
  const key = createCommandKeyStore(mint, NAME, () => clock).keyFor(INTENT, REQUEST);
  clock = 3 * DAY;
  const reloaded = createCommandKeyStore(mint, NAME, () => clock);
  assert.equal(reloaded.keyFor(INTENT), key, "a day-old in-flight key was dropped");
  assert.equal(reloaded.settle(INTENT, "refused"), true, "a refusal released a reloaded in-flight key whose attempt may have committed");
});

test("B4: two revision refusals in a row release the hold across a reload; any other outcome between them resets the count, persisted too", () => {
  const first = createCommandKeyStore(mint, NAME);
  const key = first.keyFor(INTENT, REQUEST);
  first.settle(INTENT, "unconfirmed");
  assert.equal(first.settle(INTENT, "stale"), true, "control: one revision refusal keeps the hold");
  const second = createCommandKeyStore(mint, NAME);
  assert.equal(second.settle(INTENT, "stale"), false, "the first refusal's mark was lost on reload: two in a row never release");
  assert.notEqual(second.keyFor(INTENT), key);
  storage.clear();
  const a = createCommandKeyStore(mint, NAME);
  a.keyFor(INTENT, REQUEST); a.settle(INTENT, "unconfirmed"); a.settle(INTENT, "stale"); a.settle(INTENT, "refused");
  assert.equal(createCommandKeyStore(mint, NAME).settle(INTENT, "stale"), true, "control: a refusal between the two reset the mark");
});

test("B5: the first held store under a new operator scope forgets every other scope's held writes and keeps its own", () => {
  const old = heldKeyStore("of-send-keys", "of-acct", "scope-old");
  old.keyFor("send hello", { body: "hello fan" }); old.settle("send hello", "unconfirmed");
  heldKeyStore("of-campaign-keys", "of-acct", "scope-old").keyFor(INTENT, REQUEST);
  storage.set("plan-c-keys:scope-old:of-acct", "{}");
  storage.set("of-send-keys:scope-new:of-acct", JSON.stringify({ ["0".repeat(16)]: ["a".repeat(64), Date.now(), { body: "mine" }] }));
  assert.equal(named("of-send-keys:scope-old:").length + named("of-campaign-keys:scope-old:").length, 2, "control: the old scope's holds are stored");
  heldKeyStore("of-send-keys", "of-acct");
  assert.equal(named("of-send-keys:scope-old:").length, 1, "a store with no operator scope wiped a scoped hold");
  const mine = heldKeyStore("of-campaign-keys", "of-acct-2", "scope-new");
  assert.equal(mine.size(), 0);
  assert.deepEqual(named("of-send-keys:scope-old:").concat(named("of-campaign-keys:scope-old:")), [], "the signed-out scope's message and campaign text stayed in storage");
  assert.deepEqual(old.pending(), [], "the signed-out scope's held send stayed in memory");
  assert.deepEqual(named("plan-c-keys:"), ["plan-c-keys:scope-old:of-acct"], "a Plan C key store (stable owner scope, no text) was wiped");
  assert.deepEqual(heldKeyStore("of-send-keys", "of-acct", "scope-new").pending(), [{ body: "mine" }], "the current scope's own hold was lost");
});
