import assert from "node:assert/strict";
import { after, test } from "node:test";
import { MEMORY_FIELD_LIMITS, correctFact, memoryValueError, parseMemoryEnvelope, parseMemoryPageEnvelope, readCoverage, readFanMemory, resumeHistory, type MemoryCorrection } from "../lib/onlyfans/launch/memory/b-memory-client";
const account = "account-a", fanId = "9007199254740993", version = "a".repeat(64), stamp = "2026-10-23T00:00:00Z";
const recovery = (fan: string | null = null) => ({ schemaVersion: "of-history-recovery.v1", accountId: account, fanId: fan, status: "incomplete", discoveryComplete: false,
  conversationsDiscovered: 125, conversationsComplete: 12, conversationsRetrying: 1, conversationsDeferredForLiveInput: 2, pagesCommitted: 20, messagesObserved: 400, messagesAdded: 395,
  totalMessages: null, percentComplete: null, recentRecoveryNeeded: true });
const row = { fanId, displayName: "Fan", username: null, storedMessages: 120, processedMessages: 100, memoryRevision: 2, lastProcessedAt: stamp,
  archive: { status: "needed", pagesCompleted: 1, messagesObserved: 120, completedAt: null } };
const page = () => ({ schemaVersion: "of-launch-b.v1", ok: true, accountId: account, memoryVersion: "of-history-memory.v1", fans: [row], nextCursor: "binding.cursor-1", progress: recovery() });
const detail = () => ({ schemaVersion: "of-launch-b.v1", ok: true, accountId: account, fanId, memory: { schemaVersion: "of-history-memory.v1", algorithm: "english-patterns.v1", revision: 2, version, canonicalDigest: version, fingerprint: version,
  facts: { home_city: { value: "Brisbane", source: "history", sourceMessageId: fanId, sourceAt: stamp, quote: "I live in Brisbane", sourceDigest: version } },
  summaries: { short_bio: "Saved notes", bullet_points: null }, overrides: { hobbies: { operation: "clear", revision: 2 } },
  interactions: [{ sourceMessageId: fanId, sourceAt: stamp, direction: "in", excerpt: "I live in Brisbane", sourceDigest: version }], summaryKind: "saved_profile_and_source_excerpts" },
  progress: { schemaVersion: "of-history-memory-progress.v1", algorithm: "english-patterns.v1", storedMessages: 120, processedCurrentMessages: 100, pendingMessages: 20, storedMemoryComplete: false,
    providerHistoryComplete: null, revision: 2, oldestStoredAt: stamp, newestStoredAt: stamp, lastProcessedAt: stamp }, recovery: recovery(fanId) });
const correction: MemoryCorrection = { field: "home_city", operation: "set", value: "Sydney", expectedVersion: version, reason: "Fan corrected their city." };
const originalFetch = globalThis.fetch;
const stub = (fn: (url: string, init?: RequestInit) => Response | Promise<Response>) => { globalThis.fetch = ((url: string, init?: RequestInit) => fn(String(url), init)) as typeof fetch; };
after(() => { globalThis.fetch = originalFetch; });

test("native memory: fan pages preserve decimal IDs, cursors and unknown provider total", () => {
  const result = parseMemoryPageEnvelope(page(), account);
  assert.equal(result?.fans[0].fanId, fanId); assert.equal(result?.nextCursor, "binding.cursor-1");
  assert.equal(result?.progress.totalMessages, null); assert.equal(result?.progress.percentComplete, null);
});
test("native memory: wrong account, missing version and duplicate fan rows are refused", () => {
  assert.equal(parseMemoryPageEnvelope(page(), "other"), null);
  assert.equal(parseMemoryPageEnvelope({ ...page(), memoryVersion: "old" }, account), null);
  assert.equal(parseMemoryPageEnvelope({ ...page(), schemaVersion: "old" }, account), null);
  assert.equal(parseMemoryPageEnvelope({ ...page(), fans: [row, row] }, account), null);
});
test("native memory: fan detail keeps evidence, durable clear and separate archive/memory progress", () => {
  const result = parseMemoryEnvelope(detail(), account, fanId);
  assert.equal(result?.memory.overrides.hobbies.operation, "clear"); assert.equal(result?.memory.facts.home_city.quote, "I live in Brisbane");
  assert.equal(result?.progress.pendingMessages, 20); assert.equal(result?.recovery.totalMessages, null);
  assert.equal(parseMemoryEnvelope(detail(), account, "7"), null);
  assert.equal(parseMemoryEnvelope({ ...detail(), schemaVersion: "old" }, account, fanId), null);
  const d = detail(); assert.equal(parseMemoryEnvelope({ ...d, progress: { ...d.progress, pendingMessages: 19 } }, account, fanId), null);
});
test("native memory: cursor paging and source queries use scoped routes", async () => {
  let seen = ""; stub(url => { seen = url; return Response.json(page()); });
  assert.equal((await readCoverage(account, undefined, "binding.cursor-1")).kind, "ok");
  assert.equal(seen, `/api/onlyfans-launch/memory/accounts/${account}/fans?limit=50&cursor=binding.cursor-1`);
  stub(url => { seen = url; return Response.json(detail()); });
  assert.equal((await readFanMemory(account, fanId, undefined, "home city")).kind, "ok");
  assert.equal(seen, `/api/onlyfans-launch/memory/accounts/${account}/fans/${fanId}?query=home+city`);
});
test("native memory: correction sends field/set/version/reason and validates acknowledgement scope", async () => {
  let body: unknown; stub((_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: account, fanId, correction: { revision: 3, replayed: false } }); });
  assert.deepEqual(await correctFact(account, fanId, correction), { kind: "ok", data: { revision: 3, replayed: false } });
  assert.deepEqual(body, correction); assert(!("factId" in (body as object))); assert(!("expectedRevision" in (body as object)));
  stub(() => Response.json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: "other", fanId, correction: { revision: 3, replayed: false } }));
  assert.equal((await correctFact(account, fanId, correction)).kind, "unconfirmed");
});
test("native memory: lost acknowledgement retries the identical command and retains replay acknowledgement", async () => {
  const bodies: string[] = []; stub((_url, init) => { bodies.push(String(init?.body)); if (bodies.length === 1) throw new Error("lost acknowledgement"); return Response.json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: account, fanId, correction: { revision: 3, replayed: true } }); });
  assert.equal((await correctFact(account, fanId, correction)).kind, "unconfirmed");
  assert.deepEqual(await correctFact(account, fanId, correction), { kind: "ok", data: { revision: 3, replayed: true } });
  assert.equal(bodies[0], bodies[1]);
});
test("native memory: malformed clears and empty audit reasons never reach transport", async () => {
  let calls = 0; stub(() => { calls++; return Response.json({}); });
  assert.equal((await correctFact(account, fanId, { ...correction, operation: "clear" })).kind, "refused");
  assert.equal((await correctFact(account, fanId, { ...correction, reason: " " })).kind, "refused");
  assert.equal((await correctFact(account, fanId, { ...correction, expectedVersion: "2" })).kind, "refused"); assert.equal(calls, 0);
});
test("native memory: fact/profile length boundaries and adult numeric ages mirror native validation", async () => {
  assert.deepEqual(MEMORY_FIELD_LIMITS, { real_name: 40, his_age: 80, home_city: 80, home_country: 80, hobbies: 80, occupation: 80, fetishes: 80, short_bio: 400, bullet_points: 600 });
  for (const field of ["real_name", "home_city", "home_country", "hobbies", "occupation", "fetishes", "short_bio", "bullet_points"] as const) {
    assert.equal(memoryValueError(field, "x".repeat(MEMORY_FIELD_LIMITS[field])), null);
    assert(memoryValueError(field, "x".repeat(MEMORY_FIELD_LIMITS[field] + 1)));
  }
  for (const value of ["18", "27", "120"]) assert.equal(memoryValueError("his_age", value), null);
  for (const value of ["17", "121", "18.5", "twenty", "１８", "-18", " 27"]) assert(memoryValueError("his_age", value));
  let calls = 0; stub(() => { calls++; return Response.json({}); });
  for (const [field, value] of [["real_name", "x".repeat(41)], ["home_city", "x".repeat(81)], ["short_bio", "x".repeat(401)], ["his_age", "17"]] as const)
    assert.equal((await correctFact(account, fanId, { ...correction, field, value })).kind, "refused");
  assert.equal(calls, 0, "invalid values cannot enter transport");
});
test("native memory: stale versions and read-only denial remain explicit", async () => {
  stub(() => Response.json({ error: "Memory changed" }, { status: 409 }));
  assert.deepEqual(await correctFact(account, fanId, correction), { kind: "refused", status: 409, error: "Memory changed" });
  stub(() => Response.json({ code: "agency_read_only", error: "Read-only" }, { status: 403 }));
  assert.equal((await correctFact(account, fanId, correction)).kind, "readonly");
});
test("native memory: aborting an account read discards a later successful response", async () => {
  const controller = new AbortController(); stub(() => { controller.abort(); return Response.json(page()); });
  assert.equal((await readCoverage(account, controller.signal)).kind, "stale");
});
test("native memory: backfill acknowledges scheduling only and rejects a mismatched scope", async () => {
  let route = "", body = ""; stub((url, init) => { route = url; body = String(init?.body); return Response.json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: account, requested: "fan" }); });
  assert.deepEqual(await resumeHistory(account, fanId), { kind: "ok", data: { requested: "fan" } });
  assert.equal(route, `/api/onlyfans-launch/memory/accounts/${account}/fans/${fanId}/backfill`); assert.equal(body, "{}");
  stub(() => Response.json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: account, requested: "account" }));
  assert.equal((await resumeHistory(account, fanId)).kind, "unconfirmed");
});
