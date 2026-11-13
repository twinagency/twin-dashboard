/** Native launch memory/automation contracts. Synthetic transport tests, separate from integrated browser acceptance. */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { bFetch } from "../lib/onlyfans/launch/b-common";
import { bAnswer } from "../lib/onlyfans/launch/b-route";
import { actionRules, parseAccounts, parseConversations, parseRuntime } from "../lib/onlyfans/launch/automation/b-automation";
import { readAccounts, readConversations, sendControl } from "../lib/onlyfans/launch/automation/b-automation-client";
import { createNativeConfigurationBackend, createNativeControlBackend, createNativeReadBackend } from "../lib/onlyfans/launch/native-backend";
import { parseEngagementAction, parseEngagementPage, parseEngagementSettings, validPolicy, type EngagementPolicy } from "../lib/onlyfans/launch/native";
import { CONTROL_SCHEMA } from "../lib/onlyfans/controls";
import { CONFIGURATION_HEADER, CONFIGURATION_SCHEMA } from "../lib/onlyfans/configuration";
import { ONLYFANS_SCHEMA_VERSION_HEADER } from "../lib/onlyfans/backend";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../lib/onlyfans-preview/types";
const realFetch = globalThis.fetch;
const stub = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => { globalThis.fetch = ((u: string, i?: RequestInit) => impl(String(u), i)) as typeof fetch; };
const json = (body: unknown, status = 200) => Response.json(body, { status });
after(() => { globalThis.fetch = realFetch; });
const conv = (id: string, extra = {}) => ({ conversationId: id, accountId: "acc-a", revision: 3, fan: { fanId: "1", displayName: "Fan", shortRef: "f1" }, automationMode: "automated", takeoverState: "none", lastActivityAt: "2026-10-22T00:00:00Z", requiresAttention: false, ...extra });
const policy: EngagementPolicy = { enabled: false, offers: true, follow_ups: true, reengagement: false, offer_delay_hours: 24, follow_up_delay_hours: 24, reengage_delay_hours: 168, expiry_hours: 24,
  fan_daily_limit: 1, fan_weekly_limit: 3, account_hourly_limit: 5, account_daily_limit: 20, unpaid_cooldown_hours: 24, repeat_item_days: 7, follow_up_text: "Checking in", reengage_text: "Hello again" };
const action = (over = {}) => ({ actionId: "11111111-1111-4111-8111-111111111111", kind: "follow_up", status: "scheduled", reason: null, fanId: "9007199254740993", dueAt: "2026-10-23T00:00:00Z", expiresAt: "2026-10-24T00:00:00Z", intentId: null, cancelRequested: false, ...over });

test("launch B: native envelopes cannot overwrite the browser response version", async () => {
  const response = await bAnswer({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "acc-a", engagementVersion: "of-engagement.v1", revision: 0, bindingCurrent: true, settings: policy }).json();
  assert.equal(response.schemaVersion, "of-launch-b.v1");
  assert(parseEngagementSettings(response));
});

test("launch B: account parser refuses invalid modes, duplicate rows and path-shaped IDs", () => {
  const ok = { accounts: [{ accountId: "acc-a", health: "connected", automationMode: "paused", binding: { handle: "@a" } }] };
  assert.equal(parseAccounts(ok)?.[0].handle, "@a");
  assert.equal(parseAccounts({ accounts: [{ ...ok.accounts[0], automationMode: "turbo" }] }), null);
  assert.equal(parseAccounts({ accounts: [ok.accounts[0], ok.accounts[0]] }), null);
  assert.equal(parseAccounts({ accounts: [{ ...ok.accounts[0], accountId: "../x y" }] }), null);
});
test("launch B: conversation rows cannot cross accounts or repeat identities", () => {
  const body = (items: unknown[]) => ({ accountId: "acc-a", page: { items, nextCursor: null } });
  assert.equal(parseConversations(body([conv("acc-a:1")]), "acc-a")?.items.length, 1);
  assert.equal(parseConversations(body([conv("acc-a:1", { accountId: "acc-b" })]), "acc-a"), null);
  assert.equal(parseConversations(body([conv("acc-a:1"), conv("acc-a:1")]), "acc-a"), null);
  assert.equal(parseConversations(body([conv("acc-a:1", { revision: -1 })]), "acc-a"), null);
  assert.equal(parseConversations({ accountId: "acc-a", page: { items: [], nextCursor: "x" } }, "acc-a")?.more, true);
});
test("launch B: runtime projection preserves absent delivery policy and account scope", () => {
  // The workspace route's envelope around an of-workspace.v2 settings read (route.ts answers {schemaVersion, workspace}).
  const inner = { schemaVersion: "of-workspace.v2", section: "settings", accountId: "acc-a", asOf: "2026-11-12T10:00:00Z", lastCompleteSyncAt: null,
    runtimeEnabled: false, historyRecoveryRequired: true, providerConnectionVerified: true, deliveryPolicy: null, configuration: null };
  const base = (workspace: Record<string, unknown>) => ({ schemaVersion: "of-preview.v2", workspace });
  assert.equal(parseRuntime(base(inner), "acc-a")?.deliveryEnabled, null);
  assert.equal(parseRuntime(base(inner), "acc-b"), null); assert.equal(parseRuntime(base({ ...inner, runtimeEnabled: "yes" }), "acc-a"), null);
  assert.equal(parseRuntime(inner, "acc-a"), null, "the bare inner payload is not what the route serves");
});
test("launch B: read-only, takeover and no-contact gate conversation controls", () => {
  const names = (c: Parameters<typeof actionRules>[0], manager: boolean) => actionRules(c, manager).filter(r => r.enabled).map(r => r.action);
  assert.deepEqual(names({ automationMode: "automated", takeoverState: "none" }, false), []);
  assert.deepEqual(names({ automationMode: "automated", takeoverState: "none" }, true), ["pause_automation", "request_takeover", "mark_no_contact"]);
  assert.deepEqual(names({ automationMode: "paused", takeoverState: "none" }, true), ["resume_automation", "request_takeover", "mark_no_contact"]);
  assert.deepEqual(names({ automationMode: "human_controlled", takeoverState: "effective" }, true), ["release_takeover", "mark_no_contact"]);
  assert.deepEqual(names({ automationMode: "no_contact", takeoverState: "none" }, true), []);
  assert.equal(actionRules({ automationMode: "automated", takeoverState: "none" }, true).find(r => r.action === "mark_no_contact")?.confirm, true);
});
test("launch B: transport keeps denied, unavailable, conflict and unknown write outcomes distinct", async () => {
  stub(() => json({ ok: false }, 401)); assert.equal((await bFetch("/a")).kind, "denied");
  stub(() => json({ code: "agency_read_only", error: "Read-only" }, 403)); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "readonly");
  stub(() => json({ ok: false }, 500)); assert.equal((await bFetch("/a")).kind, "unavailable");
  assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "unconfirmed");
  stub(() => { throw new Error("net"); }); assert.equal((await bFetch("/a", { method: "POST", body: {} })).kind, "unconfirmed");
  stub(() => json({ error: "changed" }, 409)); assert.deepEqual(await bFetch("/a", { method: "POST", body: {} }), { kind: "refused", status: 409, error: "changed" });
});
test("launch B: an aborted account request ignores both later failure and success", async () => {
  for (const fail of [true, false]) { const c = new AbortController(); stub(() => { c.abort(); if (fail) throw new Error("aborted"); return json({ accounts: [] }); }); assert.equal((await bFetch("/a", { signal: c.signal })).kind, "stale"); }
});
test("launch B: conversation command acknowledgement matches scope, revision and action", async () => {
  let seen: { url: string; body: unknown } | undefined;
  const ack = (over = {}) => ({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "a".repeat(64), accountId: "acc-a", conversationId: "acc-a:7", action: "pause_automation", recordedRevision: 4, ...over });
  stub((url, init) => { seen = { url, body: JSON.parse(String(init?.body)) }; return json(ack()); });
  assert.deepEqual(await sendControl("acc-a", "acc-a:7", "pause_automation", 3), { kind: "ok", data: { recordedRevision: 4 } });
  assert.equal(seen!.url, "/api/onlyfans-controls/accounts/acc-a/conversations/acc-a%3A7"); assert.deepEqual(seen!.body, { action: "pause_automation", expectedRevision: 3 });
  // A stop applied at a later revision (the fan wrote in between) is still recorded; at or below the expected one is not.
  stub(() => json(ack({ recordedRevision: 9 }))); assert.deepEqual(await sendControl("acc-a", "acc-a:7", "pause_automation", 3), { kind: "ok", data: { recordedRevision: 9 } });
  for (const bad of [{ recordedRevision: 3 }, { accountId: "acc-b" }, { action: "resume_automation" }, { applied: false }]) {
    stub(() => json(ack(bad))); assert.equal((await sendControl("acc-a", "acc-a:7", "pause_automation", 3)).kind, "unconfirmed");
  }
});
test("launch B: client account/conversation reads validate actual native read shapes", async () => {
  stub(() => json({ accounts: [{ accountId: "acc-a", health: "connected", automationMode: "automated" }] })); assert.equal((await readAccounts()).kind, "ok");
  stub(() => json({ accounts: "nope" })); assert.equal((await readAccounts()).kind, "unavailable");
  stub(() => json({ accountId: "acc-b", page: { items: [], nextCursor: null } })); assert.equal((await readConversations("acc-a")).kind, "unavailable");
});
test("launch B: engagement policies retain explicit limits and reject invalid byte lengths", () => {
  assert(validPolicy(policy)); assert.equal(validPolicy({ ...policy, account_daily_limit: 121 }), false);
  assert.equal(validPolicy({ ...policy, fan_daily_limit: 4, fan_weekly_limit: 3 }), false);
  assert.equal(validPolicy({ ...policy, follow_up_text: "é".repeat(501) }), false);
  assert.equal(parseEngagementSettings({ engagementVersion: "of-engagement.v1", revision: 2, bindingCurrent: false, settings: policy })?.bindingCurrent, false);
  assert.equal(parseEngagementSettings({ engagementVersion: "old", revision: 2, bindingCurrent: true, settings: policy }), null);
});
test("launch B: action states preserve cancellation-requested, uncertain and transport-accepted distinctions", () => {
  for (const status of ["scheduled", "queued", "dispatching", "unknown", "accepted", "not_accepted", "cancelled", "expired"]) assert.equal(parseEngagementAction(action({ status }))?.status, status);
  assert.equal(parseEngagementAction(action({ status: "unknown", cancelRequested: true }))?.cancelRequested, true);
  assert.equal(parseEngagementAction(action({ fanId: 9007199254740992 })), null);
  assert.equal(parseEngagementAction(action({ status: "refused" })), null, "use the actual backend not_accepted state");
  const page = parseEngagementPage({ engagementVersion: "of-engagement.v1", actions: [action()], nextCursor: "binding.page-2" });
  assert.equal(page?.nextCursor, "binding.page-2"); assert.equal(page?.actions[0].fanId, "9007199254740993");
  assert.equal(parseEngagementPage({ engagementVersion: "old", actions: [], nextCursor: null }), null);
});
test("launch B: configuration transport uses its purpose header and refuses mismatched acknowledgement", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const response = { schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "acc-a", commandKey: "b".repeat(64) };
  const call = createNativeConfigurationBackend({ baseUrl: "http://127.0.0.1:8788", token: "synthetic-configuration-token", fetchImpl: (async (url, init) => { request = { url: String(url), init }; return json(response); }) as typeof fetch });
  assert.equal((await call("acc-a", "engagement/actions", "GET", undefined, { cursor: "binding.page-2", limit: "50" })).ok, true);
  assert.equal(new Headers(request!.init?.headers).get(CONFIGURATION_HEADER), CONFIGURATION_SCHEMA);
  assert.equal(new Headers(request!.init?.headers).get("Authorization"), "Bearer synthetic-configuration-token");
  assert.equal(request!.url, "http://127.0.0.1:8788/onlyfans/configuration/v1/accounts/acc-a/engagement/actions?cursor=binding.page-2&limit=50");
  const mismatch = await call("acc-a", "engagement/settings", "POST", { commandKey: "c".repeat(64) }); assert(!mismatch.ok && mismatch.outcome === "unconfirmed");
});
test("launch B: read and control purposes remain separate and stop needs a recorded matching command", async () => {
  const key = "d".repeat(64); let headers = new Headers();
  const read = createNativeReadBackend({ baseUrl: "http://127.0.0.1:8788", token: "synthetic-read", fetchImpl: (async (_url, init) => { headers = new Headers(init?.headers); return json({ schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION, ok: true, accountId: "acc-a" }); }) as typeof fetch });
  assert.equal((await read("acc-a", "readiness")).ok, true); assert.equal(headers.get(ONLYFANS_SCHEMA_VERSION_HEADER), ONLYFANS_PREVIEW_SCHEMA_VERSION); assert.equal(headers.get("Authorization"), "Bearer synthetic-read");
  let recorded = true;
  const control = createNativeControlBackend({ baseUrl: "http://127.0.0.1:8788", token: "synthetic-control", fetchImpl: (async (_url, init) => { headers = new Headers(init?.headers); return json({ schemaVersion: CONTROL_SCHEMA, ok: true, accountId: "acc-a", command: { recorded, commandKey: key } }); }) as typeof fetch });
  assert.equal((await control("acc-a", "control", { commandKey: key, action: "emergency_stop" })).ok, true); assert.equal(headers.get("Authorization"), "Bearer synthetic-control");
  recorded = false; const noRecord = await control("acc-a", "control", { commandKey: key, action: "emergency_stop" }); assert(!noRecord.ok && noRecord.outcome === "unconfirmed");
});
