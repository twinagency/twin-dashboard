// Rule ("our cost and any unknown upstream key never reach the browser"), finding W2c N1-follow-c: the native memory parsers
// in lib/onlyfans/launch/native.ts validated known fields, then returned the RAW upstream object (`v as RecoveryProgress`, with a
// `[key: string]: unknown` index signature), so the memory BFF routes forwarded every unknown key, including raw `recentHistory`
// with extra cost figures, to BMemoryPanel. Each parser must build a new object naming every field; recentHistory is only ever
// parseRecentHistory's projection, and an invalid one drops only itself. Pure parser tests, no I/O.
// Run: nice -n 10 node --import tsx --test tests/rules/W2c-N1-follow-c-recovery-projection.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseMemoryFanPage, parseMemoryProgress, parseNativeMemory, parseRecoveryProgress } from "../../lib/onlyfans/launch/native";
import { parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { RECENT } from "./core-recent-fixtures";

const ACCOUNT = "account-a", FAN = "9007199254740993", V = "a".repeat(64), AT = "2026-10-23T00:00:00Z";
const LEAK = { memoryModelAccounting: { costUsd: 1.23 }, debugToken: "x" };
const SECRETS = ["costUsd", "debugToken", "1.23"];
const leaks = (v: unknown) => SECRETS.filter(s => JSON.stringify(v).includes(s));
const recovery = (fan: string | null = null) => ({ schemaVersion: "of-history-recovery.v1", accountId: ACCOUNT, fanId: fan, status: "incomplete",
  discoveryComplete: false, conversationsDiscovered: 125, conversationsComplete: 12, conversationsRetrying: 1, conversationsDeferredForLiveInput: 2,
  pagesCommitted: 20, messagesObserved: 400, messagesAdded: 395, totalMessages: null, percentComplete: null, recentRecoveryNeeded: true });
const progress = () => ({ schemaVersion: "of-history-memory-progress.v1", algorithm: "english-patterns.v1", storedMessages: 120, processedCurrentMessages: 100,
  pendingMessages: 20, storedMemoryComplete: false, providerHistoryComplete: null, revision: 2, oldestStoredAt: AT, newestStoredAt: AT, lastProcessedAt: null });
const memory = () => ({ schemaVersion: "of-history-memory.v1", algorithm: "english-patterns.v1", revision: 2, version: V, canonicalDigest: V, fingerprint: V,
  facts: { home_city: { value: "Brisbane", source: "history", revision: 2, sourceMessageId: FAN, sourceAt: AT, quote: "I live in Brisbane", sourceDigest: V },
    hobbies: { value: "Golf", source: "operator" } },
  summaries: { short_bio: "Saved notes", bullet_points: null }, overrides: { hobbies: { operation: "set", revision: 2 } },
  interactions: [{ sourceMessageId: FAN, sourceAt: AT, direction: "in", excerpt: "I live in Brisbane", sourceDigest: V }], summaryKind: "saved_profile_and_source_excerpts" });
const fanRow = () => ({ fanId: FAN, displayName: "Fan", username: null, storedMessages: 120, processedMessages: 100, memoryRevision: 2, lastProcessedAt: AT,
  archive: { status: "needed", pagesCompleted: 1, messagesObserved: 120, completedAt: null } });
const fanPage = () => ({ memoryVersion: "of-history-memory.v1", fans: [fanRow()], nextCursor: "binding.cursor-1" });
const parsedPage = () => ({ fans: [fanRow()], nextCursor: "binding.cursor-1" });

test("control: the fixtures are valid and parse on base", () => {
  assert.deepEqual(parseRecoveryProgress(recovery(FAN), ACCOUNT, FAN), recovery(FAN));
  assert.deepEqual(parseRecoveryProgress({ ...recovery(), recentHistory: RECENT }, ACCOUNT)?.recentHistory, RECENT);
  assert.deepEqual(parseMemoryProgress(progress()), progress());
  assert.deepEqual(parseNativeMemory(memory()), memory());
  assert.deepEqual(parseMemoryFanPage(fanPage()), parsedPage());
});

test("parseRecoveryProgress drops unknown keys, top level and inside recentHistory", () => {
  const recentHistory = { ...RECENT, ...LEAK, memoryModelAccounting: { ...RECENT.memoryModelAccounting, costUsd: 1.23 },
    initialHistory: { ...RECENT.initialHistory, debugToken: "x" } };
  const r = parseRecoveryProgress({ ...recovery(FAN), ...LEAK, recentHistory }, ACCOUNT, FAN);
  assert.ok(r, "an unknown key must be dropped, not refused");
  assert.deepEqual(leaks(r), []);
  assert.deepEqual(r, { ...recovery(FAN), recentHistory: RECENT });
  assert.deepEqual(parseRecentHistory(r.recentHistory), r.recentHistory, "re-parsing the projection is idempotent");
});

test("parseRecoveryProgress: an invalid recentHistory drops only itself", () => {
  for (const bad of [{ ...RECENT, percentComplete: 3, ...LEAK }, "x", null, { costUsd: 1.23 }]) {
    const r = parseRecoveryProgress({ ...recovery(), recentHistory: bad }, ACCOUNT);
    assert.deepEqual(r, recovery(), "recovery still parses, without recentHistory");
    assert.ok(r && !("recentHistory" in r));
  }
});

test("parseRecoveryProgress: validation strictness unchanged", () => {
  assert.equal(parseRecoveryProgress(recovery(), "other"), null);
  assert.equal(parseRecoveryProgress(recovery(FAN), ACCOUNT), null);
  assert.equal(parseRecoveryProgress({ ...recovery(), totalMessages: 5 }, ACCOUNT), null);
  assert.equal(parseRecoveryProgress({ ...recovery(), messagesAdded: -1 }, ACCOUNT), null);
});

test("parseMemoryProgress drops unknown keys, keeps known fields", () => {
  const p = parseMemoryProgress({ ...progress(), ...LEAK });
  assert.deepEqual(leaks(p), []); assert.deepEqual(p, progress());
  assert.equal(parseMemoryProgress({ ...progress(), pendingMessages: 19 }), null);
});

test("parseNativeMemory drops unknown keys at every level, keeps known fields", () => {
  const m = memory();
  const dirty = { ...m, ...LEAK, facts: { home_city: { ...m.facts.home_city, ...LEAK }, hobbies: { ...m.facts.hobbies, debugToken: "x" } },
    overrides: { hobbies: { ...m.overrides.hobbies, ...LEAK } }, interactions: [{ ...m.interactions[0], ...LEAK }] };
  const r = parseNativeMemory(dirty);
  assert.deepEqual(leaks(r), []); assert.deepEqual(r, m);
  assert.equal(parseNativeMemory({ ...m, interactions: [{ ...m.interactions[0], direction: "up" }] }), null);
});

test("parseMemoryFanPage drops unknown keys on every fan row and archive", () => {
  const f = fanRow();
  const r = parseMemoryFanPage({ ...fanPage(), ...LEAK, fans: [{ ...f, ...LEAK, archive: { ...f.archive, ...LEAK } }] });
  assert.deepEqual(leaks(r), []); assert.deepEqual(r, parsedPage());
  assert.equal(parseMemoryFanPage({ ...fanPage(), fans: [{ ...f, processedMessages: 121 }] }), null);
});
