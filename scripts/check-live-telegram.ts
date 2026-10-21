import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as model from "../lib/live-telegram-model";
import * as windowModel from "../lib/chat-history-window";

const clone = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", slug: "creator-a", name: "Creator A", engine: "v2" };
const other = { ...clone, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", slug: "creator-b" };
const now = Date.now(), at = (n: number) => new Date(now - 60000 + n).toISOString();
const old: model.InboxFan = { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", clone_id: clone.id, telegram_id: 123, name: "Alex", username: "alex", blocked: true, total_spent_stars: 70, last_message_received: at(0) };
const raw = { chatId: "123", name: "@alex", username: "alex", lastSeen: at(500), firstSeen: at(0), starsSpent: 99999, bought: 8, messages: 100 };
const merged = model.overlayV2Fan(clone, raw, old)!;
assert.equal(merged.id, old.id); assert.equal(merged.name, "Alex"); assert.equal(merged.blocked, true);
assert.equal(merged.total_spent_stars, 70, "monitor gross sales must not replace scoped revenue");
assert.equal(merged.last_message_received, raw.lastSeen); assert.equal(merged._virtual, false);
const virtual = model.overlayV2Fan(clone, raw)!;
assert.equal(virtual.id, model.virtualFanId(clone.id, 123)); assert(!model.isStoredFan(virtual.id));
assert.equal(virtual.total_spent_stars, 0); assert.equal(virtual.message_credits, null);
assert.notEqual(model.fanKey(virtual), model.fanKey(model.overlayV2Fan(other, raw)!));
assert.equal(model.overlayV2Fan(clone, { chatId: "123),clone_id.neq.x" }), null);
assert(model.fanMatches(virtual, "active", "alex", at(-1000)));
assert(!model.fanMatches(virtual, "unreachable", "", at(-1000)));
assert(!model.fanMatches(virtual, "all", "different", at(-1000)));
assert.equal(model.parseInboxCursor("u.e30"), null);
assert.equal(model.parseInboxCursor("2026-10-12T00:00:00Z|1),id.gt.0"), null);

// Walk 370 rows, including equal timestamps/IDs across engines and repeated
// text. Every row must be seen exactly once through the single older cursor.
const v1 = Array.from({ length: 185 }, (_, i) => ({ id: String(i + 1), created_at: at(i), role: "human", content: "same text", source: "v1" as const }));
const v2 = v1.map(row => ({ ...row, source: "v2" as const, id: row.id.padStart(4, "0") }));
let cursor: model.InboxCursor | null = null;
const seen: string[] = [];
do {
  const page = model.mergeHistory(v1, v2, cursor);
  seen.push(...page.rows.map(row => `${row.source}:${row.id}`));
  assert(page.rows.every((row, i) => !i || model.compareMessages(page.rows[i - 1], row) < 0));
  if (!page.hasMore) break;
  cursor = model.parseInboxCursor(model.inboxCursor(page.rows[0]));
  assert(cursor);
} while (true);
assert.equal(seen.length, 370); assert.equal(new Set(seen).size, 370);
assert(model.compareMessages({ ...v1[0], created_at: "2026-10-12T00:00:00.123456Z" }, { ...v2[0], created_at: "2026-10-12T00:00:00.123Z" }) > 0);

// Exercise the real server bridge with database and private HTTP boundaries
// replaced. Scope checks happen before network access and before cache reuse.
let access: { cloneIds: string[] } | null = { cloneIds: [clone.id] };
let dbRows: any[] = [old], dbHistory: any[] = [], failHistory = false;
let rawFans: any[] = [raw];
let matchingDelay = false, failMatching = false, activeMatches = 0, peakMatches = 0;
let monitorHistory = [{ id: "turn:0", at: at(500), role: "user", content: "hello", delivery: "received" }, { id: "turn:1", at: at(501), role: "assistant", content: "recorded reply", delivery: "unverified" }];
const calls: { url: URL; params: URLSearchParams }[] = [];
const dbCalls: any[][] = [];
const db = { from(table: string) {
  const filters: any[][] = [["table", table]];
  const q: any = { then(resolve: any, reject: any) {
    dbCalls.push(filters);
    return (async () => {
      if (table === "users" && matchingDelay) {
        activeMatches++; peakMatches = Math.max(peakMatches, activeMatches);
        await new Promise<void>(done => setTimeout(done, 5));
        activeMatches--;
      }
      const ids = filters.find(([key]) => key === "in")?.[2];
      const creatorId = filters.find(([key, field]) => key === "eq" && field === "clone_id")?.[2];
      return { data: table === "users" ? dbRows.filter(row => (!ids || ids.includes(row.telegram_id)) && (!creatorId || creatorId === row.clone_id)) : dbHistory,
        error: table === "users" && failMatching ? new Error("fixture unavailable") : null };
    })().then(resolve, reject);
  } };
  for (const key of ["select", "eq", "in", "gte", "lte", "or", "order", "limit"]) q[key] = (...args: any[]) => { filters.push([key, ...args]); return q; };
  return q;
} };
const oldFetch = globalThis.fetch;
globalThis.fetch = async (input: any) => {
  const url = new URL(String(input)); calls.push({ url, params: url.searchParams });
  if (url.pathname.endsWith("/fans")) return Response.json(rawFans);
  if (failHistory) return new Response("unavailable", { status: 502 });
  return Response.json({ history: monitorHistory, hasMore: false });
};
const source = readFileSync("lib/live-telegram.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} as any };
const dependencies: Record<string, any> = {
  "./supabase": { supabaseAdmin: db }, "./live-telegram-model": model, "./chat-history-window": windowModel,
  "./dashboard-access": { getDashboardAccess: async () => access, requireCloneAccess: async (id: string) => { if (access && !access.cloneIds.includes(id)) throw new Error("denied"); } },
};
new Function("require", "module", "exports", js)((name: string) => { assert(dependencies[name], name); return dependencies[name]; }, module, module.exports);
async function main() {
  try {
    const bridge = module.exports;
    const index = await bridge.loadV2Fans([clone, other], null);
    assert.equal(index.fans.length, 1); assert.equal(index.fans[0].id, old.id);
    assert(calls.every(call => call.params.get("girl") === clone.slug), "never fetch an unassigned creator");
    assert(dbCalls.every(query => query.some(([key, field, value]) => key === "eq" && field === "clone_id" && value === clone.id)));
    // More than six batches, across two authorized creators: every batch is
    // covered once, runs concurrently, and the whole fleet shares the bound.
    const batchClone = { ...clone, id: "dddddddd-dddd-dddd-dddd-dddddddddddd", slug: "batch-a" };
    const batchOther = { ...other, id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", slug: "batch-b" };
    access = { cloneIds: [batchClone.id, batchOther.id] };
    rawFans = Array.from({ length: 1351 }, (_, i) => ({ ...raw, chatId: String(1000 + i) }));
    dbRows = [batchClone, batchOther].flatMap(c => rawFans.map((row, i) => ({ ...old, clone_id: c.id, id: `${c.id}-${i}`, telegram_id: Number(row.chatId), total_spent_stars: i })));
    matchingDelay = true;
    const beforeBatches = dbCalls.length;
    const batched = await bridge.loadV2Fans([batchClone, batchOther], null);
    assert.equal(batched.fans.length, 2702); assert.equal(batched.unavailable.length, 0);
    assert(peakMatches > 1, "matching batches must actually overlap");
    assert(peakMatches <= 6, "all creators share one six-read bound");
    assert.equal(dbCalls.length - beforeBatches, 20);
    for (const query of dbCalls.slice(beforeBatches)) assert(query.find(([key]) => key === "in")[2].length <= 150);
    assert(batched.fans.every((fan: any) => fan.total_spent_stars === fan.telegram_id - 1000), "parallel matching preserves authoritative financial values");
    failMatching = true;
    const unavailable = await bridge.loadV2Fans([batchClone], batchClone.id);
    assert.equal(unavailable.fans.length, 0); assert.deepEqual(unavailable.unavailable, [batchClone.name]);
    matchingDelay = false; failMatching = false; rawFans = [raw]; dbRows = [old];
    access = { cloneIds: [other.id] }; const requestsBefore = calls.length;
    const denied = await bridge.loadV2Fans([clone], null);
    assert.equal(denied.fans.length, 0); assert.equal(calls.length, requestsBefore, "cached data cannot escape revoked scope");
    await assert.rejects(bridge.loadTelegramHistory(clone, 123), /denied/);
    access = { cloneIds: [clone.id] };
    dbHistory = [{ id: 1, created_at: at(0), role: "human", content: "legacy" }];
    const history = await bridge.loadTelegramHistory(clone, 123);
    assert.equal(history.rows.length, 3); assert.equal(history.rows[0].source, "v1");
    assert.equal(history.rows[2].delivery, "unverified"); assert.equal(history.unavailable, false);
    const boundary = { ...v1[0], created_at: "2026-10-12T00:00:00.123456Z" };
    await bridge.loadTelegramHistory(clone, 123, { before: model.inboxCursor(boundary) });
    const passed = JSON.parse(Buffer.from(calls.at(-1)!.params.get("before")!, "base64url").toString());
    assert.deepEqual(passed, { at: "2026-10-12T00:00:00.123Z", id: "\uffff" });
    monitorHistory = [{ ...monitorHistory[0], id: "old-turn:0", at: "2025-01-01T00:00:00.000Z" },
      { ...monitorHistory[0], id: "invalid", at: "not-a-date" },
      { ...monitorHistory[0], id: "future", at: "2999-01-01T00:00:00.000Z" }];
    const oldHistory = await bridge.loadTelegramHistory(clone, 123);
    assert(oldHistory.rows.some((row: any) => row.id === "old-turn:0"), "V2 history older than 90 days remains visible");
    assert(!oldHistory.rows.some((row: any) => ["invalid", "future"].includes(row.id)));
    assert(!dbCalls.at(-1)!.some(([key]) => key === "gte"), "Legacy source has no age cutoff");
    failHistory = true;
    const partial = await bridge.loadTelegramHistory(clone, 123);
    assert.equal(partial.unavailable, true); assert.equal(partial.rows.length, 1);
    const plain = await bridge.loadTelegramHistory({ ...clone, engine: "live" }, 123);
    assert.equal(plain.combined, false); assert.equal(plain.unavailable, false);
    console.log("Unified Telegram: scoped fan matching, V2-only identities, partner revenue isolation, mixed-source pagination, microsecond boundaries, source failures and legacy fallback passed.");
  } finally { globalThis.fetch = oldFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
