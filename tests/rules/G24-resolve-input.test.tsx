// RULE G24 R2 (#11): the Resolve control in the real InboxView is enabled exactly when the shared payload rule
// (commandPayloadProblem, which is the controls route's rule) accepts what the operator typed, not by a regex of its own.
// Measured before the fix: provider id "9999999999999999" (past Number.MAX_SAFE_INTEGER) enabled Resolve, and the route refuses it.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { click, q, render, typeInto } from "./7a-harness";
import { conversationDetails } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import type { CommandPayload } from "../../lib/onlyfans-preview/types";
import { AVA_ACCOUNT } from "./W4-lib-onlyfans-preview-1-helpers";

createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; }; // InboxView imports a stylesheet
const detail = conversationDetails["of-conv-ava-1002"]; // delivery unknown, incident of-attempt-ava-6001

async function resolveWith(providerMessageId: string) {
  const sent: CommandPayload[] = [];
  const { default: InboxView } = await import("../../components/onlyfans-preview/InboxView");
  await render(<InboxView accountsState={{ status: "ready", data: [AVA_ACCOUNT] }} activeAccount={AVA_ACCOUNT} activeAccountId={AVA_ACCOUNT.accountId} onSelectAccount={() => {}}
    conversations={{ status: "ready", data: { items: [detail.summary], nextCursor: null } }} selectedConversationId={detail.conversationId} onSelectConversation={() => {}}
    detailState={{ status: "ready", data: detail }} viewer={operatorViewer()} onCommand={(_, payload) => sent.push(payload)} commandResult={null} nextCursor={null}
    loadingMore={false} onLoadMore={() => {}} />);
  await click(q('[data-of-decision="delivered"]'));
  await typeInto(q('input[aria-label="Provider message ID"]'), providerMessageId);
  const control = q('[data-of-action="resolve_delivery_evidence"]');
  assert.ok(control, "fixture: Resolve is offered on the unknown delivery");
  const disabled = control.disabled;
  await click(control);
  return { disabled, sent };
}

test("control: an exact provider id enables Resolve and submits it", async () => {
  const run = await resolveWith("123");
  assert.equal(run.disabled, false);
  assert.deepEqual(run.sent, [{ kind: "delivery_resolution", providerMessageId: "123", attemptId: "of-attempt-ava-6001", decision: "delivered" }]);
});

test("#11: a provider id past the safe integer range keeps Resolve disabled and submits nothing", async () => {
  const run = await resolveWith("9999999999999999");
  assert.equal(run.disabled, true, "Resolve enabled for an id the route refuses");
  assert.deepEqual(run.sent, []);
});
