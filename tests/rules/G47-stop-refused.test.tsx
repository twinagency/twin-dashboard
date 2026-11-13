// Rule (W4 lib-onlyfans-preview-1 F2 follow-up, REVIEW inv 7 "No false success"): on a degraded session (pauseAutomation
// "unavailable") pause and no-contact stay offered, but the backend may refuse them. A refusal reads "Change not accepted"
// (data-of-command-accepted="false"), never "Change saved"; the thread is not shown as paused or recorded.
// Driven through the real browser transport (createFetchOnlyFansTransport) and the real InboxView. Offline: fake fetch, jsdom.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { q, render } from "./7a-harness";
import { availableActions, createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { accounts, conversationDetails, ACCOUNT_NOVA } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";
import { AUTOMATED } from "./W4-lib-onlyfans-preview-1-helpers";

createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; }; // InboxView imports a stylesheet
const NOVA = accounts.find(a => a.accountId === ACCOUNT_NOVA)!;
const base = conversationDetails["of-conv-ava-1003"];
const detail = { ...base, accountId: NOVA.accountId, deliveryIncident: null, summary: { ...base.summary, ...AUTOMATED, accountId: NOVA.accountId, delivery: "sent" as const } };
// The control route's answer when the backend refuses (route.ts answers {schemaVersion, ok:false, outcome, error, code} with its status).
const REFUSAL = { schemaVersion: "of-controls.v1", ok: false, outcome: "refused", code: "sender_unavailable", error: "The sender is unavailable or disabled for this account." };

for (const command of ["pause_automation", "mark_no_contact"] as const) {
  test(`${command} on a degraded session: offered, and a backend refusal never reads as a saved change`, async () => {
    assert.equal(NOVA.capabilities.pauseAutomation, "unavailable", "fixture: the degraded capability");
    const offered = availableActions({ account: NOVA, summary: detail.summary, viewer: operatorViewer() }).available.map(a => a.action);
    assert.ok(offered.includes(command), `the stop stays offered: ${offered}`);
    const transport = createFetchOnlyFansTransport((async () => Response.json(REFUSAL, { status: 409 })) as typeof fetch);
    const result = await transport.submitControl!(createCommandRequest({ command, accountId: NOVA.accountId, conversationId: detail.conversationId,
      expectedRevision: detail.summary.revision, payload: { kind: "none" } }));
    assert.deepEqual([result.outcome, result.applied, result.accepted], ["refused", false, false]);
    const { default: InboxView } = await import("../../components/onlyfans-preview/InboxView");
    await render(<InboxView accountsState={{ status: "ready", data: [NOVA] }} activeAccount={NOVA} activeAccountId={NOVA.accountId} onSelectAccount={() => {}}
      conversations={{ status: "ready", data: { items: [detail.summary], nextCursor: null } }} selectedConversationId={detail.conversationId} onSelectConversation={() => {}}
      detailState={{ status: "ready", data: detail }} viewer={operatorViewer()} onCommand={() => {}} commandResult={result} nextCursor={null} loadingMore={false} onLoadMore={() => {}} />);
    if (command === "pause_automation") assert.ok(q('[data-of-actions] [data-of-action="pause_automation"]'), "the pause button is still shown");
    const panel = q<HTMLElement>("[data-of-command-result]");
    assert.equal(panel?.getAttribute("data-of-command-accepted"), "false");
    assert.match(panel?.textContent ?? "", /^Change not accepted/);
    assert.doesNotMatch(panel?.textContent ?? "", /saved|recorded|paused|queued/i);
  });
}
