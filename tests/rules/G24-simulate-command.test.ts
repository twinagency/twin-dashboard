// RULE G24 (W4 lib-onlyfans-preview-1 F5): simulateCommand (lib/onlyfans-preview/fixture-data-source.ts) checks the viewer's scope,
// the exact revision and availableActions, so the pretend backend refuses what the live route refuses.
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { conversationDetails } from "../../lib/onlyfans-preview/fixtures";
import { createFixtureOnlyFansDataSource, operatorViewer, readOnlyView } from "../../lib/onlyfans-preview/fixture-data-source";
import type { CommandPayload, ConversationDetail, PreviewCommand, PreviewViewer } from "../../lib/onlyfans-preview/types";
import { AVA_ACCOUNT } from "./W4-lib-onlyfans-preview-1-helpers";

const takenOver = conversationDetails["of-conv-ava-1003"];
const noContact = conversationDetails["of-conv-ava-1004"];
const unknown = conversationDetails["of-conv-ava-1002"];
const message = (body: string): CommandPayload => ({ kind: "manual_message", body });
const NONE: CommandPayload = { kind: "none" };

async function submit(viewer: PreviewViewer, detail: ConversationDetail, command: PreviewCommand, payload: CommandPayload, revision = detail.summary.revision) {
  const source = createFixtureOnlyFansDataSource({ viewer });
  return source.submitCommand(createCommandRequest({ command, accountId: detail.accountId,
    conversationId: detail.summary.conversationId, expectedRevision: revision, payload }));
}
/** The good counterpart: an operator's valid send on the taken-over thread at its own revision. */
const validSend = () => submit(operatorViewer(), takenOver, "send_manual_message", message("hello"));

test("control: fixture preconditions hold, an empty send is refused, and nothing is ever applied", async () => {
  assert.equal(takenOver.summary.revision, 9);
  assert.equal(takenOver.summary.automationMode, "human_controlled");
  assert.equal(takenOver.accountId, AVA_ACCOUNT.accountId);
  assert.equal(noContact.summary.automationMode, "no_contact");
  assert.equal(noContact.accountId, AVA_ACCOUNT.accountId);
  assert.equal(unknown.summary.delivery, "unknown");
  assert.equal(unknown.accountId, AVA_ACCOUNT.accountId);
  const empty = await submit(operatorViewer(), takenOver, "send_manual_message", message("   "));
  assert.equal(empty.accepted, false);
  assert.equal(empty.applied, false);
  assert.equal((await validSend()).applied, false);
});

test("F5: a send to a fan who asked for no further contact is refused; the same send to a taken-over fan is not", async () => {
  const bad = await submit(operatorViewer(), noContact, "send_manual_message", message("hello"));
  assert.equal(bad.accepted, false, `accepted: ${bad.note}`);
  assert.equal((await validSend()).accepted, true);
});

test("F5: a send at a revision that is not the conversation's is refused; the same send at its revision is not", async () => {
  const bad = await submit(operatorViewer(), takenOver, "send_manual_message", message("hello"), 999);
  assert.equal(bad.accepted, false, `accepted at revision 999 vs ${takenOver.summary.revision}: ${bad.note}`);
  assert.equal((await validSend()).accepted, true);
});

test("F5: resuming automation while a delivery is unknown is refused with the hold's reason; pausing there is not", async () => {
  const bad = await submit(operatorViewer(), unknown, "resume_automation", NONE);
  assert.equal(bad.accepted, false, `accepted: ${bad.note}`);
  assert.equal(bad.refusalReason, "An earlier send is unresolved. Resolving it comes before resuming replies.");
  const good = await submit(operatorViewer(), unknown, "pause_automation", NONE);
  assert.equal(good.accepted, true, `pause refused: ${good.refusalReason}`);
});

test("F5: a send from a read-only view with no accounts is refused; the same send from the operator is not", async () => {
  const bad = await submit(readOnlyView([]), takenOver, "send_manual_message", message("hello"));
  assert.equal(bad.accepted, false, `accepted: ${bad.note}`);
  assert.equal((await validSend()).accepted, true);
});
