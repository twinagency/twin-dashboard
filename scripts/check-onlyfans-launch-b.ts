/** Launch B (sections D memory, E automation): contract parsers, action rules, client reply handling. Synthetic only. */
import assert from "node:assert/strict";
import { B_CAPABILITIES, bFetch } from "../lib/onlyfans/launch/b-common";
import { actionRules, parseAccounts, parseConversations, parseRuntime } from "../lib/onlyfans/launch/automation/b-automation";
import { cancelAction, readAccounts, readConversations, readEngagement, sendControl, stopAutomation } from "../lib/onlyfans/launch/automation/b-automation-client";
import { correctField, readFan, readRecovery } from "../lib/onlyfans/launch/memory/b-memory-client";
import { fanOfConversation, parseFanReply, parseRecoveryReply, recoveryLines, validCorrection } from "../lib/onlyfans/launch/memory/b-memory";
import { parseEngagementReply, canCancel } from "../lib/onlyfans/launch/automation/b-engagement";
import { backfillRequest, fanCorrect, fanRead, recoveryRead } from "../lib/onlyfans/launch/live/memory";
import { engagementCancel, engagementRead, stopControl, type ConnectionPort } from "../lib/onlyfans/launch/live/engagement";
import type { Env } from "../lib/onlyfans/launch/live/upstream";
import { ACTION_A, POLICY, VERSION, fakeBackend, json, memProgress, memoryBody, recoveryBody, setEnv } from "./support/onlyfans-launch-fake";
import { CONTROL_SCHEMA } from "../lib/onlyfans/controls";

setEnv();
const ACTOR = "op-session:" + "1".repeat(64);
const env = (f: typeof fetch, over: Partial<Env> = {}): Env => ({ fetch: f, accountId: "acc-a", actor: ACTOR, canManage: true, agency: false, ...over });
const bodyOf = (a: { body: Record<string, unknown> }) => a.body as { ok: boolean; data?: any; code?: string; outcome?: string };
let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; } };
const realFetch = globalThis.fetch;
const stub = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => { globalThis.fetch = (async (u: string, i?: RequestInit) => impl(String(u), i)) as typeof fetch; };
const conv = (id: string, extra = {}) => ({ conversationId: id, accountId: "acc-a", revision: 3, fan: { fanId: "1", displayName: "Fan", shortRef: "f1" }, automationMode: "automated", takeoverState: "none", lastActivityAt: "2026-10-22T00:00:00Z", requiresAttention: false, ...extra });

async function main() {
  await test("capability list matches what is wired", () => {
    const real = B_CAPABILITIES.filter(c => c.source === "real").map(c => c.id).sort();
    assert.deepEqual(real, ["automation.accounts", "automation.controls", "automation.conversations", "automation.emergency-stop", "automation.follow-ups", "automation.runtime", "memory.corrections", "memory.coverage", "memory.facts"]);
    assert.equal(B_CAPABILITIES.find(c => c.id === "automation.account-mode-write")?.source, "unavailable", "no backend route exists for an account-mode write");
    assert.equal(B_CAPABILITIES.length, 10);
  });
  await test("parseAccounts strict", () => {
    const ok = { accounts: [{ accountId: "acc-a", health: "connected", automationMode: "paused", binding: { handle: "@a" } }] };
    assert.equal(parseAccounts(ok)?.[0].handle, "@a");
    assert.equal(parseAccounts({ accounts: [{ ...ok.accounts[0], automationMode: "turbo" }] }), null);
    assert.equal(parseAccounts({ accounts: [ok.accounts[0], ok.accounts[0]] }), null);
    assert.equal(parseAccounts({ accounts: [{ ...ok.accounts[0], accountId: "../x y" }] }), null);
    assert.equal(parseAccounts(null), null);
  });
  await test("parseConversations rejects another account's rows and duplicates", () => {
    const body = (items: unknown[]) => ({ accountId: "acc-a", page: { items, nextCursor: null } });
    assert.equal(parseConversations(body([conv("acc-a:1")]), "acc-a")?.items.length, 1);
    assert.equal(parseConversations(body([conv("acc-a:1", { accountId: "acc-b" })]), "acc-a"), null);
    assert.equal(parseConversations(body([conv("acc-a:1"), conv("acc-a:1")]), "acc-a"), null);
    assert.equal(parseConversations({ ...body([]), accountId: "acc-b" }, "acc-a"), null);
    assert.equal(parseConversations(body([conv("acc-a:1", { revision: -1 })]), "acc-a"), null);
    assert.equal(parseConversations({ accountId: "acc-a", page: { items: [], nextCursor: "x" } }, "acc-a")?.more, true);
    assert.equal(parseConversations({ accountId: "acc-a", page: { items: [], nextCursor: "x" } }, "acc-a")?.cursor, "x");
    assert.equal(parseConversations({ accountId: "acc-a", page: { items: [], nextCursor: "../bad cursor" } }, "acc-a"), null);
  });
  await test("parseRuntime", () => {
    const base = { accountId: "acc-a", section: "settings", runtimeEnabled: false, historyRecoveryRequired: true, providerConnectionVerified: true, deliveryPolicy: null };
    assert.equal(parseRuntime(base, "acc-a")?.deliveryEnabled, null);
    assert.equal(parseRuntime(base, "acc-b"), null);
    assert.equal(parseRuntime({ ...base, runtimeEnabled: "yes" }, "acc-a"), null);
  });
  await test("action rules: read-only, no-contact, state gating", () => {
    const names = (c: Parameters<typeof actionRules>[0], m: boolean) => actionRules(c, m).filter(r => r.enabled).map(r => r.action);
    assert.deepEqual(names({ automationMode: "automated", takeoverState: "none" }, false), []);
    assert.deepEqual(names({ automationMode: "automated", takeoverState: "none" }, true), ["pause_automation", "request_takeover", "mark_no_contact"]);
    assert.deepEqual(names({ automationMode: "paused", takeoverState: "none" }, true), ["resume_automation", "request_takeover", "mark_no_contact"]);
    assert.deepEqual(names({ automationMode: "human_controlled", takeoverState: "effective" }, true), ["release_takeover", "mark_no_contact"]);
    assert.deepEqual(names({ automationMode: "no_contact", takeoverState: "none" }, true), []);
    assert.equal(actionRules({ automationMode: "automated", takeoverState: "none" }, true).find(r => r.action === "mark_no_contact")?.confirm, true);
    assert(actionRules({ automationMode: "automated", takeoverState: "none" }, false).every(r => r.reason === "Your team access is read-only."));
  });
  await test("bFetch maps statuses", async () => {
    stub(() => json({ ok: false, code: "operator_only", error: "Operator only." }, 403)); assert.deepEqual(await bFetch("/a", { method: "POST", body: {} }), { kind: "refused", status: 403, code: "operator_only", error: "Operator only." });
    stub(() => json({ ok: false }, 401)); assert.equal((await bFetch("/a")).kind, "denied");
    stub(() => json({ ok: false, code: "agency_read_only", error: "Your team access is read-only." }, 403)); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "readonly");
    stub(() => json({ ok: false }, 500)); assert.equal((await bFetch("/a")).kind, "unavailable");
    stub(() => json({ ok: false }, 500)); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "unconfirmed");
    stub(() => { throw new Error("net"); }); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "unconfirmed");
    stub(() => json({ error: "no" }, 409)); assert.deepEqual(await bFetch("/a", { method: "POST", body: {} }), { kind: "refused", status: 409, error: "no" });
    stub(() => json({ error: "no", code: "ledger_busy" }, 409)); assert.deepEqual(await bFetch("/a", { method: "POST", body: {} }), { kind: "refused", status: 409, error: "no", code: "ledger_busy" });
  });
  await test("aborted request is stale, even if the network then fails", async () => {
    const c = new AbortController();
    stub(async () => { c.abort(); throw new Error("aborted"); });
    assert.equal((await bFetch("/a", { signal: c.signal })).kind, "stale");
    const c2 = new AbortController();
    stub(async () => { c2.abort(); return json({ accounts: [] }); });
    assert.equal((await bFetch("/a", { signal: c2.signal })).kind, "stale");
  });
  await test("sendControl validates the acknowledgement and URL", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const ack = (over = {}) => ({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "a".repeat(64), accountId: "acc-a", conversationId: "acc-a:7", action: "pause_automation", recordedRevision: 4, ...over });
    stub((url, init) => { seen = { url, body: JSON.parse(String(init?.body)) }; return json(ack()); });
    const r = await sendControl("acc-a", "acc-a:7", "pause_automation", 3);
    assert.deepEqual(r, { kind: "ok", data: { recordedRevision: 4 } });
    assert.equal(seen!.url, "/api/onlyfans-controls/accounts/acc-a/conversations/acc-a%3A7");
    assert.deepEqual(seen!.body, { action: "pause_automation", expectedRevision: 3 });
    for (const bad of [{ recordedRevision: 9 }, { accountId: "acc-b" }, { action: "resume_automation" }, { applied: false }]) {
      stub(() => json(ack(bad))); assert.equal((await sendControl("acc-a", "acc-a:7", "pause_automation", 3)).kind, "unconfirmed");
    }
    stub(() => json({ ok: false, error: "changed" }, 409)); assert.equal((await sendControl("acc-a", "acc-a:7", "pause_automation", 3)).kind, "refused");
  });
  await test("client reads shape-check", async () => {
    stub(() => json({ accounts: [{ accountId: "acc-a", health: "connected", automationMode: "automated" }] })); const a = await readAccounts();
    assert(a.kind === "ok" && a.data[0].accountId === "acc-a");
    stub(() => json({ accounts: "nope" })); assert.equal((await readAccounts()).kind, "unavailable");
    stub(() => json({ accountId: "acc-b", page: { items: [], nextCursor: null } })); assert.equal((await readConversations("acc-a")).kind, "unavailable");
    let seen = ""; stub(u => { seen = u; return json({ accountId: "acc-a", page: { items: [], nextCursor: null } }); }); await readConversations("acc-a", "c1"); assert.equal(seen, "/api/onlyfans/accounts/acc-a/conversations?cursor=c1");
  });
  await test("fan ids come only from this account's conversation ids", () => {
    assert.equal(fanOfConversation("acc-a", "acc-a:7"), "7");
    assert.equal(fanOfConversation("acc-a", "acc-b:7"), null);
    assert.equal(fanOfConversation("acc-a", "acc-a:../7"), null);
    assert.equal(fanOfConversation("acc-a", "acc-a:0"), null);
  });

  // ---- memory (server handlers against the synthetic backend) ----
  await test("recovery read: configuration purpose, observed counts only, account bound", async () => {
    const b = fakeBackend(); const a = await recoveryRead(env(b.fetch));
    assert.equal(a.status, 200); assert.equal(b.last().path, "/onlyfans/configuration/v1/accounts/acc-a/history-memory/progress");
    assert.equal(bodyOf(a).data.recovery.conversationsComplete, 4); assert.equal("percentComplete" in bodyOf(a).data.recovery, false);
    assert(parseRecoveryReply(a.body, "acc-a")); assert.equal(parseRecoveryReply(a.body, "acc-b"), null);
    assert(recoveryLines(bodyOf(a).data.recovery).some(l => /not complete/i.test(l)));
    const other = fakeBackend({ recovery: () => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: "acc-a", progress: recoveryBody("acc-b") }) });
    assert.equal((await recoveryRead(env(other.fetch))).status, 503, "another account's progress is never shown");
    assert.equal((await recoveryRead(env(fakeBackend({ recovery: () => json({}, 404) }).fetch))).status, 404);
  });
  await test("fan read: both reads, strict ids, fan and account must match", async () => {
    const b = fakeBackend(); const a = await fanRead(env(b.fetch), "7");
    assert.equal(a.status, 200); assert.deepEqual(b.calls.map(c => c.path.split("/accounts/acc-a")[1]).sort(), ["/history-memory/fans/7/memory", "/history-memory/fans/7/progress"]);
    assert(parseFanReply(a.body, "acc-a", "7")); assert.equal(parseFanReply(a.body, "acc-a", "8"), null); assert.equal(parseFanReply(a.body, "acc-b", "7"), null);
    for (const bad of ["../7", "0", "7/x", "abc", ""]) { const n = b.calls.length; assert.equal((await fanRead(env(b.fetch), bad)).status, 400); assert.equal(b.calls.length, n); }
    const wrongFan = fakeBackend({ "fan.progress": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], recovery: recoveryBody(m[1], "9"), memory: memProgress() }) });
    assert.equal((await fanRead(env(wrongFan.fetch), "7")).status, 503);
    const badCounts = fakeBackend({ "fan.progress": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], recovery: recoveryBody(m[1], m[2]), memory: memProgress({ pendingMessages: 99 }) }) });
    assert.equal((await fanRead(env(badCounts.fetch), "7")).status, 503, "processed + pending must equal stored");
    const half = fakeBackend({ "fan.memory": () => json({}, 404) }); assert.equal((await fanRead(env(half.fetch), "7")).status, 404);
    assert.equal(bodyOf(a).data.memory.facts.find((f: any) => f.field === "home_city").quote, "I live in Leeds");
  });
  await test("correction: server-derived actor and key, validated fields, success only when recorded", async () => {
    const b = fakeBackend(); const input = { field: "real_name", operation: "set", value: "Sam", expectedVersion: VERSION };
    const a = await fanCorrect(env(b.fetch), "7", input);
    assert.equal(a.status, 200); assert.equal(bodyOf(a).outcome, "recorded");
    const sent = b.last().body as Record<string, unknown>; assert.equal(sent.actor, ACTOR); assert.match(String(sent.commandKey), /^[a-f0-9]{64}$/); assert.equal(sent.expectedVersion, VERSION);
    await fanCorrect(env(b.fetch), "7", { ...input }); assert.equal((b.last().body as any).commandKey, sent.commandKey, "retry = same key");
    await fanCorrect(env(b.fetch), "7", { ...input, value: "Sammy" }); assert.notEqual((b.last().body as any).commandKey, sent.commandKey);
    await fanCorrect(env(b.fetch), "7", { field: "hobbies", operation: "clear", value: null, expectedVersion: VERSION }); assert.equal((b.last().body as any).value, null);
    const n = b.calls.length;
    assert.equal((await fanCorrect(env(b.fetch, { canManage: false }), "7", input)).status, 403);
    assert.equal((await fanCorrect(env(b.fetch, { actor: null }), "7", input)).status, 403);
    for (const bad of [{ ...input, field: "persona" }, { ...input, operation: "delete" }, { ...input, value: " Sam" }, { ...input, value: "x".repeat(41) }, { ...input, value: "" }, { ...input, expectedVersion: "short" },
      { ...input, actor: "me" }, { ...input, commandKey: "k" }, { field: "hobbies", operation: "clear", value: "x", expectedVersion: VERSION }, { field: "his_age", operation: "set", value: "17", expectedVersion: VERSION },
      { field: "his_age", operation: "set", value: "abc", expectedVersion: VERSION }, { ...input, reason: "bad\u0007" }, null])
      assert.equal((await fanCorrect(env(b.fetch), "7", bad)).status, 400, JSON.stringify(bad));
    assert.equal((await fanCorrect(env(b.fetch), "../7", input)).status, 400); assert.equal(b.calls.length, n);
    assert.equal(validCorrection({ field: "his_age", operation: "set", value: "30", expectedVersion: VERSION }), true);
    assert.equal((await fanCorrect(env(fakeBackend({ "fan.correct": () => json({ ok: false, code: "conflict" }, 409) }).fetch), "7", input)).status, 409);
    for (const h of [() => { throw new Error("timeout"); }, () => json({}, 500), (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], correction: { revision: 4, replayed: false }, commandKey: "0".repeat(64) }),
      (c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], commandKey: c.body.commandKey })]) {
      const x = await fanCorrect(env(fakeBackend({ "fan.correct": h as never }).fetch), "7", input); assert.equal(x.status, 502); assert.equal(bodyOf(x).outcome, "unconfirmed");
    }
  });
  await test("history backfill is only a request; read-only and bad ids are refused", async () => {
    const b = fakeBackend(); const a = await backfillRequest(env(b.fetch), {}); assert.equal(bodyOf(a).outcome, "requested"); assert.equal(b.last().path.endsWith("/history-memory/backfill"), true);
    assert.deepEqual(b.last().body, { actor: ACTOR });
    assert.equal(bodyOf(await backfillRequest(env(b.fetch), { fanId: "7" })).data.requested, "fan"); assert.equal(b.last().path.endsWith("/history-memory/fans/7/backfill"), true);
    const n = b.calls.length;
    assert.equal((await backfillRequest(env(b.fetch, { canManage: false }), {})).status, 403);
    assert.equal((await backfillRequest(env(b.fetch), { fanId: "../1" })).status, 400); assert.equal((await backfillRequest(env(b.fetch), { actor: "me" })).status, 400); assert.equal(b.calls.length, n);
    assert.equal((await backfillRequest(env(fakeBackend({ backfill: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], requested: "fan" }) }).fetch), {})).status, 502);
  });
  await test("memory client: PATCH carries only the correction; no actor or key", async () => {
    let seen: { url: string; body: any; method?: string } | null = null;
    stub((url, init) => { seen = { url, body: JSON.parse(String(init?.body)), method: init?.method }; return json({ ok: true, accountId: "acc-a", data: { revision: 4 }, outcome: "recorded" }); });
    const r = await correctField("acc-a", "7", { field: "real_name", operation: "set", value: "Sam", expectedVersion: VERSION });
    assert.equal(r.kind, "ok"); assert.equal(seen!.url, "/api/onlyfans-launch/memory/accounts/acc-a/fans/7"); assert.equal(seen!.method, "PATCH"); assert.deepEqual(Object.keys(seen!.body).sort(), ["expectedVersion", "field", "operation", "value"]);
    stub(() => json({ ok: true, accountId: "acc-a", data: { recovery: { status: "complete", discoveryComplete: true, recentRecoveryNeeded: false, conversationsDiscovered: 1, conversationsComplete: 1, conversationsRetrying: 0, conversationsDeferredForLiveInput: 0, pagesCommitted: 1, messagesObserved: 1, messagesAdded: 1, fanId: null } } }));
    assert.equal((await readRecovery("acc-a")).kind, "ok");
    stub(() => json({ ok: true, accountId: "acc-b", data: {} })); assert.equal((await readRecovery("acc-a")).kind, "unavailable"); assert.equal((await readFan("acc-a", "7")).kind, "unavailable");
  });

  // ---- engagement and stop controls ----
  await test("engagement read: settings and actions, strict shapes, canonical statuses", async () => {
    const b = fakeBackend(); const a = await engagementRead(env(b.fetch));
    assert.equal(a.status, 200); assert.equal(bodyOf(a).data.actions.length, 1); assert.equal(bodyOf(a).data.settings.settings.enabled, true);
    assert(parseEngagementReply(a.body, "acc-a")); assert.equal(parseEngagementReply(a.body, "acc-b"), null);
    const bad = fakeBackend({ "engagement.actions": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], actions: [{ ...ACTION_A, status: "sent" }] }) });
    assert.equal((await engagementRead(env(bad.fetch))).status, 503);
    const dup = fakeBackend({ "engagement.actions": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], actions: [ACTION_A, ACTION_A] }) });
    assert.equal((await engagementRead(env(dup.fetch))).status, 503);
    const extra = fakeBackend({ engagement: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", revision: 1, bindingCurrent: true, settings: { ...POLICY, surprise: 1 } }) });
    assert.equal((await engagementRead(env(extra.fetch))).status, 503);
    assert.equal(canCancel("scheduled"), true); assert.equal(canCancel("queued"), true); for (const s of ["dispatching", "accepted", "unknown", "cancelled", "expired", "not_accepted"] as const) assert.equal(canCancel(s), false, s);
  });
  await test("engagement cancel: 'cancelled' only when the backend says cancelled", async () => {
    const b = fakeBackend(); const id = ACTION_A.actionId;
    const a = await engagementCancel(env(b.fetch), { actionId: id }); assert.equal(bodyOf(a).outcome, "cancelled"); assert.deepEqual(b.last().body, { actor: ACTOR, reason: "operator_cancelled" });
    const late = fakeBackend({ "engagement.cancel": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", action: { ...ACTION_A, actionId: m[2], status: "dispatching", cancelRequested: true } }) });
    const l = await engagementCancel(env(late.fetch), { actionId: id }); assert.equal(bodyOf(l).outcome, "cancel_requested"); assert.equal(bodyOf(l).data.cancelled, false);
    const done = fakeBackend({ "engagement.cancel": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", action: { ...ACTION_A, actionId: m[2], status: "accepted" } }) });
    assert.equal(bodyOf(await engagementCancel(env(done.fetch), { actionId: id })).outcome, "not_cancellable");
    const n = b.calls.length;
    assert.equal((await engagementCancel(env(b.fetch, { canManage: false }), { actionId: id })).status, 403);
    for (const bad of [{ actionId: "../x" }, { actionId: id, actor: "me" }, {}, null]) assert.equal((await engagementCancel(env(b.fetch), bad)).status, 400);
    assert.equal(b.calls.length, n);
    const other = fakeBackend({ "engagement.cancel": (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], action: { ...ACTION_A, actionId: "22222222-2222-2222-2222-222222222222", status: "cancelled" } }) });
    assert.equal((await engagementCancel(env(other.fetch), { actionId: id })).status, 502, "an ack for a different action is not accepted");
    assert.equal((await engagementCancel(env(fakeBackend({ "engagement.cancel": () => { throw new Error("x"); } }).fetch), { actionId: id })).status, 502);
  });
  const port = (over: Partial<ConnectionPort> = {}, calls: unknown[] = []): ConnectionPort => ({
    get: async () => ({ ok: true, data: { revision: 4, status: "verified", outgoingEnabled: true } }),
    command: async (_a, c) => { calls.push(c); return { ok: true, ack: { recordedRevision: 5 } }; }, ...over });
  await test("stop engagement: sends the full settings with only the switch changed; success only on a matching ack", async () => {
    const b = fakeBackend(); const a = await stopControl(env(b.fetch, { agency: true }), { scope: "engagement" }, null);
    assert.equal(bodyOf(a).outcome, "recorded"); const post = b.calls.find(c => c.method === "POST")!; const sent = post.body as any;
    assert.deepEqual(sent.settings, { ...POLICY, enabled: false }); assert.equal(sent.expectedRevision, 5); assert.equal(sent.actor, ACTOR);
    const off = fakeBackend({ engagement: (_c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], engagementVersion: "of-engagement.v1", revision: 5, bindingCurrent: true, settings: { ...POLICY, enabled: false } }) });
    const none = await stopControl(env(off.fetch), { scope: "engagement" }, null); assert.equal(bodyOf(none).outcome, "no_change"); assert.equal(off.calls.filter(c => c.method === "POST").length, 0, "nothing is recorded when nothing changed");
    const wrongRev = fakeBackend({ "engagement.settings": (c: any, m: any) => json({ schemaVersion: "of-configuration.v3", ok: true, accountId: m[1], revision: 99, commandKey: c.body.commandKey }) });
    assert.equal(bodyOf(await stopControl(env(wrongRev.fetch), { scope: "engagement" }, null)).outcome, "unconfirmed");
    const lost = fakeBackend({ "engagement.settings": () => { throw new Error("t"); } }); assert.equal((await stopControl(env(lost.fetch), { scope: "engagement" }, null)).status, 502);
    assert.equal((await stopControl(env(fakeBackend({ "engagement.settings": () => json({}, 409) }).fetch), { scope: "engagement" }, null)).status, 409);
    const unread = fakeBackend({ engagement: () => json({}, 500) }); const u = await stopControl(env(unread.fetch), { scope: "engagement" }, null);
    assert.equal(u.status, 503); assert.equal(unread.calls.filter(c => c.method === "POST").length, 0);
  });
  await test("account pause: operator only, read-only refused, ack must be recorded", async () => {
    const calls: any[] = []; const b = fakeBackend();
    const a = await stopControl(env(b.fetch), { scope: "account" }, port({}, calls));
    assert.equal(bodyOf(a).outcome, "recorded"); assert.equal(bodyOf(a).data.recordedRevision, 5);
    assert.deepEqual(calls[0], { action: "pause", payload: {}, expectedRevision: 4, actor: ACTOR, commandKey: calls[0].commandKey }); assert.match(calls[0].commandKey, /^[a-f0-9]{64}$/);
    await stopControl(env(b.fetch), { scope: "account" }, port({}, calls)); assert.equal(calls[1].commandKey, calls[0].commandKey, "retry = same key");
    const agency = await stopControl(env(b.fetch, { agency: true }), { scope: "account" }, port({}, calls)); assert.equal(agency.status, 403); assert.equal(bodyOf(agency).code, "operator_only");
    assert.equal((await stopControl(env(b.fetch, { canManage: false }), { scope: "account" }, port())).status, 403);
    assert.equal((await stopControl(env(b.fetch), { scope: "account" }, null)).status, 503);
    assert.equal(calls.length, 2, "refusals never reach the connection backend");
    const already = await stopControl(env(b.fetch), { scope: "account" }, port({ get: async () => ({ ok: true, data: { revision: 4, status: "paused", outgoingEnabled: false } }) }, calls));
    assert.equal(bodyOf(already).outcome, "no_change"); assert.equal(calls.length, 2);
    const lost = await stopControl(env(b.fetch), { scope: "account" }, port({ command: async () => ({ ok: false, status: 502, outcome: "unconfirmed", error: "x" }) }));
    assert.equal(lost.status, 502); assert.equal(bodyOf(lost).outcome, "unconfirmed", "a lost reply is never reported as paused");
    const refused = await stopControl(env(b.fetch), { scope: "account" }, port({ command: async () => ({ ok: false, status: 409, outcome: "refused", error: "x" }) })); assert.equal(refused.status, 409);
    assert.equal((await stopControl(env(b.fetch), { scope: "account" }, port({ get: async () => ({ ok: false, status: 503, error: "x" }) }))).status, 503);
    for (const bad of [{ scope: "all" }, {}, { scope: "account", actor: "me" }, null]) assert.equal((await stopControl(env(b.fetch), bad, port())).status, 400);
  });
  await test("automation client: stop and cancel send only the request, never an actor", async () => {
    const sent: any[] = []; stub((url, init) => { sent.push({ url, body: JSON.parse(String(init?.body)) }); return json({ ok: true, accountId: "acc-a", data: {}, outcome: "recorded" }); });
    await stopAutomation("acc-a", "account"); await cancelAction("acc-a", ACTION_A.actionId);
    assert.deepEqual(sent[0], { url: "/api/onlyfans-launch/automation/accounts/acc-a/emergency-stop", body: { scope: "account" } });
    assert.deepEqual(sent[1], { url: "/api/onlyfans-launch/automation/accounts/acc-a/follow-ups", body: { actionId: ACTION_A.actionId } });
    stub(() => json({ ok: true, accountId: "acc-a", data: { settings: { revision: 1, bindingCurrent: true, settings: { enabled: true } }, actions: [{ ...ACTION_A, status: "bogus" }] } })); assert.equal((await readEngagement("acc-a")).kind, "unavailable");
  });
  globalThis.fetch = realFetch;
  console.log(`check-onlyfans-launch-b: ${passed} passed, 0 failed, 0 skipped`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
