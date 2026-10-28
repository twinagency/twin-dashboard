import assert from "node:assert/strict";
import { test } from "node:test";
import { clearDrafts, clearSubmittedDraft, draftKey, readDraft, writeDraft } from "../lib/onlyfans/inbox-drafts";
import { parseFanFinancials } from "../lib/onlyfans/fan-financials";
import { createFetchOnlyFansTransport } from "../lib/onlyfans-preview/server-data-source";
import { createNativeReadBackend } from "../lib/onlyfans/launch/native-backend";
import { agencyGrant, agencyScopedFetch, agencyOnlyFansRequest, AGENCY_ACCESS_HEADER, AGENCY_CHAT_ACCESS_VERSION } from "../lib/onlyfans/agency-scope";
import { availableActions, canSubmitCommand } from "../lib/onlyfans-preview/actions";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";
import { readWithRecovery } from "../lib/onlyfans/read-recovery";
import { parseTeamCommand } from "../lib/agency-team-command";

test("drafts isolate agency/staff, creator and conversation; late receipts preserve other and newer drafts", () => {
  clearDrafts();
  const a = draftKey("agency-a:user-a", "account-a", "fan-1"), b = draftKey("agency-a:user-a", "account-a", "fan-2");
  const submitted = writeDraft(a, { body: "exact unsent draft", catalogItemId: "27" });
  writeDraft(b, { body: "second conversation" });
  assert.equal(readDraft(a).body, "exact unsent draft"); assert.equal(readDraft(a).catalogItemId, "27");
  for (const key of [draftKey("agency-b:user-a", "account-a", "fan-1"), draftKey("agency-a:user-b", "account-a", "fan-1"), draftKey("agency-a:user-a", "account-b", "fan-1")]) assert.equal(readDraft(key).body, "");
  assert(clearSubmittedDraft(a, submitted)); assert.equal(readDraft(b).body, "second conversation");
  const old = writeDraft(a, { body: "same text" }); writeDraft(a, { body: "same text" });
  assert.equal(clearSubmittedDraft(a, old), false, "identical text edited after submission is still a new draft");
  assert.equal(readDraft(a).body, "same text");
  const expired = writeDraft(a, { body: "expires" }, 1); assert.equal(readDraft(a, 8 * 60 * 60 * 1000 + 2).body, "");
  assert.equal(clearSubmittedDraft(a, expired), true); clearDrafts(); assert.equal(readDraft(b).body, "");
});

test("fan financials retain currency, pending/reversal status and unknown net; assets never become money", () => {
  const value = { version: "of-fan-financials.v1", totals: [
    { currency: "USD", status: "cleared", transactions: 1, grossCents: 1000, netCents: 800, lastTransactionAt: "2026-10-28T00:00:00Z" },
    { currency: "EUR", status: "pending", transactions: 1, grossCents: 300, netCents: null, lastTransactionAt: "2026-10-28T00:00:00Z" },
    { currency: "USD", status: "refunded", transactions: 1, grossCents: 500, netCents: 400, lastTransactionAt: "2026-10-28T00:00:00Z" },
  ], coverageComplete: false, coverageAt: null, commerceHeld: true };
  assert.deepEqual(parseFanFinancials(value), value); assert.equal(parseFanFinancials({ ...value, totals: [...value.totals, value.totals[0]] }), null);
  assert.equal(parseFanFinancials({ ...value, totals: [{ ...value.totals[0], grossCents: Number.MAX_SAFE_INTEGER + 1 }] }), null);
  assert.equal(parseFanFinancials(undefined), null);
});

test("server search transports account, identity query, filter and long continuation cursor", async () => {
  let requested = "";
  const source = createFetchOnlyFansTransport(async input => { requested = String(input); return Response.json({ page: { items: [], nextCursor: null } }); });
  const cursor = "a".repeat(150);
  await source.readConversations("account-a", cursor, false, { query: "name & user", filter: "unread" });
  const url = new URL(requested, "https://test.invalid");
  assert.equal(url.pathname, "/api/onlyfans/accounts/account-a/conversations");
  assert.equal(url.searchParams.get("query"), "name & user"); assert.equal(url.searchParams.get("filter"), "unread"); assert.equal(url.searchParams.get("cursor"), cursor);
});

test("chatter permissions stay narrow in UI, middleware and backend transport; old service refuses before any write", async () => {
  const id = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
  const grant = agencyGrant({ id, userId, cloneIds: [id], canManage: false, canChat: true }, false)!;
  assert(grant.canChat && !grant.canManage);
  assert(agencyOnlyFansRequest("/api/onlyfans-controls/accounts/acc-a/conversations/acc-a:101", "POST", false, false, true));
  assert(agencyOnlyFansRequest("/api/onlyfans-launch/memory/accounts/acc-a/fans/101", "PATCH", false, false, true));
  for (const path of ["/api/onlyfans-configuration/accounts/acc-a", "/api/onlyfans-campaigns/accounts/acc-a", "/api/onlyfans-launch/abc/accounts/acc-a/command", "/api/onlyfans-connections/creators"]) assert(!agencyOnlyFansRequest(path, "POST", false, false, true));
  const viewer = { kind: "operator" as const, label: "Chatter", canManage: false, canChat: true, scopedAccountIds: [], canActAsOwner: true };
  const account = { ...accounts[0], health: "connected" as const, capabilities: Object.fromEntries(Object.keys(accounts[0].capabilities).map(key => [key, "available"])) as typeof accounts[0]["capabilities"] };
  const summary = { ...Object.values(conversationDetails)[0].summary, automationMode: "human_controlled" as const, takeoverState: "effective" as const, delivery: "sent" as const };
  const actions = availableActions({ account, summary, viewer });
  assert(canSubmitCommand(viewer, actions, "send_manual_message")); assert(canSubmitCommand(viewer, actions, "release_takeover"));
  for (const action of ["pause_automation", "resume_automation", "resolve_delivery_evidence", "mark_no_contact"] as const) assert(!canSubmitCommand(viewer, actions, action));
  const foreign = availableActions({ account, summary, viewer: { ...viewer, canActAsOwner: false } }); assert(!canSubmitCommand(viewer, foreign, "send_manual_message"));
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({}, { headers: { [AGENCY_ACCESS_HEADER]: AGENCY_CHAT_ACCESS_VERSION } }); };
  const scoped = agencyScopedFetch(grant, { baseUrl: "http://service.invalid", token: "synthetic" }, fetcher);
  assert.equal((await scoped("http://service.invalid/onlyfans/control/v1/accounts/acc-a/conversations/acc-a:101", { method: "POST" })).status, 200); assert.equal(calls, 2);
  assert.equal((await scoped("http://service.invalid/onlyfans/configuration/v1/accounts/acc-a", { method: "POST" })).status, 503); assert.equal(calls, 2);
  let oldCalls = 0;
  const old = agencyScopedFetch(grant, { baseUrl: "http://service.invalid", token: "synthetic" }, async () => { oldCalls++; return Response.json({}, { headers: { [AGENCY_ACCESS_HEADER]: "of-agency.v1" } }); });
  assert.equal((await old("http://service.invalid/onlyfans/control/v1/accounts/acc-a/conversations/acc-a:101", { method: "POST" })).status, 503); assert.equal(oldCalls, 1);
  const form = new FormData(); Object.entries({ operation: "invite", email: "synthetic@example.invalid", access: "chat", creator_scope: "selected" }).forEach(([key, value]) => form.set(key, value)); form.append("creator_ids", id);
  const command = parseTeamCommand(form, false); assert(command && "can_chat" in command && command.can_chat && !command.can_manage);
});

test("read recovery retries only once, refuses writes and keeps authentication/backoff/persistent failure visible", async () => {
  let calls = 0;
  const transient: typeof fetch = async () => Response.json({}, { status: ++calls === 1 ? 503 : 200 });
  assert.equal((await readWithRecovery("https://test.invalid", {}, transient)).status, 200); assert.equal(calls, 2);
  calls = 0; assert.equal((await readWithRecovery("https://test.invalid", {}, async () => { calls++; return Response.json({}, {status:503}); })).status, 503); assert.equal(calls, 2);
  for (const status of [401, 403, 429]) { calls = 0; assert.equal((await readWithRecovery("https://test.invalid", {}, async () => { calls++; return Response.json({}, {status}); })).status, status); assert.equal(calls, 1); }
  calls = 0; await assert.rejects(readWithRecovery("https://test.invalid", {method:"POST"}, async () => { calls++; return Response.json({}); })); assert.equal(calls, 0);
  const ac = new AbortController(); ac.abort(); await assert.rejects(readWithRecovery("https://test.invalid", { signal: ac.signal }, async () => { throw ac.signal.reason; }));
});

test("readiness distinguishes service refusal, invalid envelope, wrong account, timeout and backend reference", async () => {
  const options = { baseUrl: "http://service.invalid", token: "synthetic" };
  for (const [status, pattern] of [[401, /credential was rejected/], [503, /HTTP 503/]] as const) {
    const read = createNativeReadBackend({ ...options, fetchImpl: async () => Response.json({}, { status, headers: { "X-OnlyFans-Evidence-Reference": "a".repeat(32) } }) });
    const result = await read("acc-a", "readiness"); assert(!result.ok); assert.match(result.error, pattern); assert.match(result.error, /Reference: a{32}/);
  }
  const wrong = createNativeReadBackend({ ...options, fetchImpl: async () => Response.json({schemaVersion:"of-read.v1", ok:true, accountId:"other"}) });
  assert.equal((await wrong("acc-a", "readiness")).ok, false);
  const timeout = createNativeReadBackend({ ...options, fetchImpl: async () => { throw new DOMException("synthetic", "TimeoutError"); } });
  const result = await timeout("acc-a", "readiness"); assert(!result.ok); assert.match(result.error, /timed out/);
});


test("readiness partial memory evidence is explicit and cannot become green coverage", async () => {
  const { parseNativeReadiness } = await import("../lib/onlyfans/launch/native");
  const sample = { readinessVersion:"of-launch-readiness.v1", observedAt:"2026-10-28T00:00:00Z", schemaRevision:"0098_ledger_exclusion", readyToEnable:false,
    checks:[{key:"memory",status:"unknown",blocking:false,observedAt:"2026-10-28T00:00:00Z",blocker:"full_memory_coverage_not_verified_inline",action:"history_memory"}],
    accountControl:{enabled:false,bindingId:"binding",revision:0,unresolvedOutgoing:1,fingerprint:"a".repeat(64)},
    coverage:{storedMessages:10000,processedMessages:null,memorySample:{inspectedMessages:50,processedCurrentMessages:49,complete:false},providerTotalMessages:null,archiveComplete:false,pendingArchiveConversations:2},
    catalogue:{usableInspectedItems:0,inspectedItems:0,hasMore:false},autonomy:{accountEnabled:false,deliveryEnabled:false,existingAutomatedConversations:0,automateNewConversations:false,engagementEnabled:false,workerCapabilities:{}},limits:[] };
  assert(parseNativeReadiness(sample));
  const unknownCount = {...sample, coverage:{...sample.coverage,storedMessages:null,storedCountStatus:"unavailable"}};
  assert(parseNativeReadiness(unknownCount));
  assert.equal(parseNativeReadiness({...unknownCount,coverage:{...unknownCount.coverage,storedCountStatus:undefined}}),null);
  assert.equal(parseNativeReadiness({...unknownCount,checks:[{...sample.checks[0],status:"ready"}]}),null);
  assert.equal(parseNativeReadiness({...sample,coverage:{...sample.coverage,memorySample:undefined}}),null);
  assert.equal(parseNativeReadiness({...sample,checks:[{...sample.checks[0],status:"ready"}]}),null);
  assert.equal(parseNativeReadiness({...sample,coverage:{...sample.coverage,memorySample:{...sample.coverage.memorySample,processedCurrentMessages:51}}}),null);
});
