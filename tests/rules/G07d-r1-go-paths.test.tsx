// RULE G07d r1 go-paths (REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win). #414 round 1 items 1, 4, 5.
//   1 the inbox bulk "Enable AI replies for existing chats" (AllFansControl + lib/onlyfans/bulk-ai.ts) resumed the account and every eligible
//     chat while the account's STOP was unconfirmed. The button is now held (with an ⓘ hint), and the hold is read again when run() starts,
//     before the account resume and before every chat.
//   4 Plan C approve and hand back ignored the STOP hold. Both are held on it and read it again at submit; Stop, Take over and Reject stay live.
//   2 availableActions' goHold was optional, so a caller that forgot it skipped the STOP hold silently. It is required (string | null):
//     the @ts-expect-error below fails `tsc -p tsconfig.tests.json` if it ever becomes optional again.
//   5 the hold lived in sessionStorage, so another tab of the same browser never saw it. It is now in localStorage (same key), a view
//     re-renders on the storage event, and it never expires; a legacy sessionStorage entry still holds.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), the Plan C typed mock backend. window.confirm stubbed to true.
//   node --import tsx --test tests/rules/G07d-r1-go-paths.test.tsx
import { bodyOf, button, calls, click, close, dom, json, mount, q, reloadPage, serve, settle, type Call } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { accounts, conversationDetails, conversationsByAccount } from "../../lib/onlyfans-preview/fixtures";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { availableActions } from "../../lib/onlyfans-preview/actions";
import { CONFIGURATION_SCHEMA, FACT_KEYS, parseConfiguration } from "../../lib/onlyfans/configuration";
import { MOCK_ACCOUNT, createPlanCMock, seedDraft } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";
import type { OnlyFansDataSource } from "../../lib/onlyfans-preview/data-source";
import type { ConversationSummary } from "../../lib/onlyfans-preview/types";

const require = createRequire(import.meta.url);
after(close);
dom.window.confirm = () => true;
const local = dom.window.localStorage, session = dom.window.sessionStorage;
beforeEach(async () => { await reloadPage(); local.clear(); session.clear(); });
const HELD = /held until the emergency stop is confirmed/i;
const holdJson = (accountId: string) => JSON.stringify({ accountId, since: 1, attempt: 1, carried: false });
/** As the launch panel in another tab leaves it: localStorage, no event in this document. */
const holdStop = (accountId: string) => local.setItem(`b-stop-held:${accountId}`, holdJson(accountId));

// ---- 1: bulk enable ----
const account = accounts[0], viewer = operatorViewer(), ACCOUNT = account.accountId, at = "2026-11-01T10:00:00.000Z";
const CONTROL = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(ACCOUNT)}/emergency-stop`;
const CONFIG = `/api/onlyfans-configuration/accounts/${encodeURIComponent(ACCOUNT)}`;
const readiness = { readinessVersion: "of-launch-readiness.v1", observedAt: at, schemaRevision: "r1", readyToEnable: true, checks: [],
  accountControl: { enabled: false, bindingId: "binding-1", revision: 3, unresolvedOutgoing: 0, fingerprint: "b".repeat(64) },
  coverage: { storedMessages: 10, processedMessages: 10, providerTotalMessages: null, archiveComplete: true, pendingArchiveConversations: 0 },
  catalogue: { usableInspectedItems: 0, inspectedItems: 0, hasMore: false },
  autonomy: { accountEnabled: false, deliveryEnabled: true, automateNewConversations: false, engagementEnabled: false, existingAutomatedConversations: 0, workerCapabilities: {} },
  limits: [] };
const configuration = { schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: ACCOUNT, configuration: { configurationRevision: 7, fingerprint: "a".repeat(64),
  persona: "Approved synthetic persona.", personaTruncated: false, creatorFacts: Object.fromEntries(FACT_KEYS.map(key => [key, null])),
  factFields: FACT_KEYS.map(key => ({ key, label: key })), factsValid: true, readOnlyFacts: [], modelsValid: true, salesConfigurationValid: true,
  onRequestSalesEnabled: false, fasttDiscountResend: false, fasttPostBuyUpsell: false, dailyCostCapCents: 100, reasoningEffort: null,
  reasoningOptions: { "synthetic/model": ["low", "high"] }, sharedFacts: { state: "unconfigured", checkedAt: null, sourceUpdatedAt: null, overrideKeys: [] },
  defaultModel: "synthetic/model", replyModelOverride: null, replyOverridePresent: true, resolvedReplyModel: null, modelOptions: ["synthetic/model"],
  activation: { deploymentAllowed: true, allFansAllowed: true, allowedFans: [], selection: { mode: "all", fans: [] }, selectionValid: true, modelCredentialReady: true,
    proxySaved: true, automatedConversations: 0, pausedConversations: 1, noContactConversations: 0, takeoverConversations: 0, nextSendAt: null, throttleSeconds: 20 } } };
const resumes = () => calls.filter(c => c.method === "POST" && c.url === CONTROL && bodyOf(c).action === "resume");
const pauses = () => calls.filter(c => c.method === "POST" && c.url === CONTROL && bodyOf(c).action === "pause");
async function allFans(configRead: (call: Call) => Response | Promise<Response> = () => json(configuration)) {
  serve(call => call.method === "GET" && call.url === CONFIG ? configRead(call) : call.method === "GET" ? json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: ACCOUNT, readiness })
    : json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: ACCOUNT, command: { recorded: true } }));
  const { default: AllFansControl } = require("../../components/onlyfans-preview/AllFansControl");
  await mount(<AllFansControl account={account} viewer={viewer} source={createFixtureOnlyFansDataSource({ viewer })} onChanged={() => {}} />, "/onlyfans/inbox");
}
const enable = () => button(/^Enable AI replies for existing chats$/);
const box = () => q("[data-of-all-fans-controls]")?.textContent ?? "";

test("1: an unconfirmed STOP holds bulk Enable AI (with the reason) and Pause account stays live", async () => {
  holdStop(ACCOUNT);
  await allFans();
  assert.equal(enable()?.disabled, true, "bulk enable is offered while the account's STOP is unconfirmed");
  assert.match(box(), HELD, "the hold is not named");
  await click(button(/^Pause account$/));
  assert.equal(pauses().length, 1, "Pause account was held by the STOP hold");
});

test("1: a STOP held after render stops bulk enable at its start, and one held while it runs stops it before the account resume", async () => {
  await allFans();
  assert.equal(enable()?.disabled, false, "control: with no STOP hold bulk enable is offered");
  holdStop(ACCOUNT);
  await click(enable());
  assert.equal(calls.filter(c => c.method === "GET").length, 0, "bulk enable started reading and writing while the STOP is unconfirmed");
  assert.match(box(), HELD);
  assert.ok(parseConfiguration(configuration, ACCOUNT), "control: the fixture configuration parses, so only the hold can stop the resume");
  local.clear();
  let release!: () => void;
  const hung = new Promise<Response>(resolve => { release = () => resolve(json(configuration)); });
  await reloadPage();
  await allFans(() => hung);
  await click(enable());
  holdStop(ACCOUNT); // the launch panel sent a STOP while the enable was reading
  release(); await settle(); await settle();
  assert.equal(resumes().length, 0, "the account was resumed while its STOP is unconfirmed");
});

test("1: bulk-ai stops before the next chat once the STOP hold appears, and never resumes a chat under it", async () => {
  const { enableExistingFanChats } = require("../../lib/onlyfans/bulk-ai");
  const detail = Object.values(conversationDetails).find(d => d.accountId === ACCOUNT)!;
  const base: ConversationSummary = { ...detail.summary, revision: 0, automationMode: "paused", takeoverState: "none", delivery: "none" };
  const rows = [base, { ...base, conversationId: "second" }];
  // @ts-expect-error item 2: goHold is required; a caller that forgets it must fail the typecheck, not skip the STOP hold.
  assert.ok(availableActions({ account, summary: base, viewer }));
  const sends: string[] = [];
  let hold: string | null = null;
  const source = { kind: "live", listConversations: async () => ({ status: "ready", data: { items: rows, nextCursor: null } }),
    getConversation: async (_a: string, id: string) => ({ status: "ready", data: { ...detail, conversationId: id, summary: rows.find(r => r.conversationId === id)!, deliveryIncident: null } }),
    submitCommand: async (request: { conversationId: string }) => { sends.push(request.conversationId); hold = "Held until the emergency stop is confirmed.";
      return { simulated: false, applied: true, accepted: true, outcome: "recorded", request, note: "" }; } } as unknown as OnlyFansDataSource;
  await assert.rejects(enableExistingFanChats({ account, viewer, source, cancelled: () => false, progress: () => {}, stopHold: () => hold }), HELD);
  assert.deepEqual(sends, [base.conversationId], "a chat was resumed after the account's STOP hold appeared");
  hold = "Held until the emergency stop is confirmed.";
  sends.length = 0;
  await assert.rejects(enableExistingFanChats({ account, viewer, source, cancelled: () => false, progress: () => {}, stopHold: () => hold }), HELD);
  assert.deepEqual(sends, [], "bulk-ai resumed a chat under a STOP hold present from the start");
});

// ---- 4: Plan C ----
async function planC() {
  const draft = seedDraft();
  const mock = createPlanCMock({ drafts: [draft] }), proxy = createPlanCProxy(mock);
  const { default: PlanCConsole } = require("../../components/onlyfans-preview/PlanCConsole");
  await mount(<PlanCConsole accountId={MOCK_ACCOUNT} operatorScope="op-planc" canAct fetchImpl={proxy.fetch} />, "/onlyfans/plan-c");
  return { mock, paths: () => mock.posts().map(c => c.path) };
}
const live = (selector: string) => { const b = q<HTMLButtonElement>(selector); return Boolean(b && !b.disabled); };

test("4: Plan C approve and hand back are held by an unconfirmed STOP; Stop, Take over and Reject stay live", async () => {
  holdStop(MOCK_ACCOUNT);
  const { paths } = await planC();
  assert.deepEqual({ approve: live("[data-plan-c-approve]"), handback: live('[data-plan-c-conversation-action="handback"]'),
    stop: live('[data-plan-c-conversation-action="stop"]'), takeover: live('[data-plan-c-conversation-action="takeover"]'), reject: live("[data-plan-c-reject]") },
    { approve: false, handback: false, stop: true, takeover: true, reject: true }, "Plan C go or brake gated wrongly under an unconfirmed STOP");
  assert.match(q("[data-plan-c-console]")?.textContent ?? "", HELD, "the hold is not named");
  await click(q('[data-plan-c-conversation-action="stop"]'));
  assert.ok(paths().some(p => /\/stop$/.test(p)), "the Plan C Stop did not go out under the STOP hold");
});

test("4: a STOP held after render blocks Plan C approve and hand back at submit", async () => {
  const { paths } = await planC();
  assert.ok(live("[data-plan-c-approve]") && live('[data-plan-c-conversation-action="handback"]'), "control: with no hold both are offered");
  await click(q('[data-plan-c-conversation-action="handback"]'));
  holdStop(MOCK_ACCOUNT);
  await click(q("[data-plan-c-approve]"));
  await click(q('[data-plan-c-conversation-confirm="handback"]'));
  assert.deepEqual(paths().filter(p => /\/(approve|handback)$/.test(p)), [], "approve or hand back went out while the account's STOP is unconfirmed");
});

// ---- 5: shared across tabs ----
const AVA = "of-acc-ava-001", HUMAN = "of-conv-ava-1003";
async function inbox() {
  serve((call: Call) => {
    if (call.method === "POST") return json({ error: "fixture" }, 503);
    const path = new URL(call.url, "https://fixture.invalid").pathname;
    if (path === "/api/onlyfans/accounts") return json({ accounts });
    let m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations\/([^/]+)$/);
    if (m) return json({ conversation: conversationDetails[decodeURIComponent(m[2])] });
    m = path.match(/^\/api\/onlyfans\/accounts\/([^/]+)\/conversations$/);
    if (m) return json({ page: { items: conversationsByAccount[decodeURIComponent(m[1])] ?? [], nextCursor: null } });
    return json({ error: "fixture" }, 404);
  });
  const { default: OnlyFansWorkspace } = require("../../components/onlyfans-preview/OnlyFansWorkspace");
  await mount(<OnlyFansWorkspace view="inbox" source="server" draftPrincipal="op-session:fixture" operatorScope="op-r1" canManage canChat />, `/onlyfans/inbox?account=${AVA}`);
  await click(q(`[data-of-conversation-id="${HUMAN}"]`));
}
const handBack = () => Boolean(q('[data-of-actions] [data-of-action="release_takeover"]'));

test("5: a STOP hold written in another tab (localStorage + storage event) withdraws hand back here without a reload; clearing it restores it", async () => {
  await inbox();
  assert.equal(handBack(), true, "control: hand back is offered");
  holdStop(AVA);
  await act(async () => { dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: `b-stop-held:${AVA}`, newValue: holdJson(AVA), storageArea: local })); });
  assert.equal(handBack(), false, "a STOP held in another tab did not reach this tab");
  local.removeItem(`b-stop-held:${AVA}`);
  await act(async () => { dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: `b-stop-held:${AVA}`, newValue: null, storageArea: local })); });
  assert.equal(handBack(), true, "control: the other tab's clear restores hand back");
});

test("5: writeHold stores in localStorage under the same key, a legacy sessionStorage hold still holds, and an old hold never expires", async () => {
  const { readHold, writeHold } = require("../../components/onlyfans-launch/automation/stop-hold");
  writeHold("of-r1", { since: 5, attempt: 5, carried: false });
  assert.deepEqual({ local: local.getItem("b-stop-held:of-r1"), session: session.getItem("b-stop-held:of-r1") },
    { local: JSON.stringify({ accountId: "of-r1", since: 5, attempt: 5, carried: false }), session: null }, "the hold is not in localStorage, so other tabs never see it");
  session.setItem("b-stop-held:of-legacy", holdJson("of-legacy"));
  assert.ok(readHold("of-legacy"), "a hold written before this change (sessionStorage) was dropped");
  writeHold("of-legacy", null);
  assert.deepEqual([readHold("of-legacy"), session.getItem("b-stop-held:of-legacy")], [null, null], "clearing left the legacy entry holding");
  assert.ok(readHold("of-r1") && holdJson("x") && readHold("of-r1")!.since === 5, "an old hold expired");
});
