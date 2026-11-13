// RULE G01 (REVIEW.md inv 7 "Holds and STOP"): a STOP whose outcome is unconfirmed says "stop unconfirmed", and that fan's
// approve stays off and sends nothing, through the automatic reload after the command.
// Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy); dropBeforeCommit, so the stop is never
// applied. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_ACCOUNT, seedDraft } from "../contracts/plan-c-mock-backend";
import { approveButton, assertApproveHeld, click, mountConsole, q, text } from "./7a-harness";

const CONVERSATION = `${MOCK_ACCOUNT}:900000000001`;

/** One awaiting draft with a live approve (the control's state, and every red's starting point). */
async function mountLive() {
  const { mock } = await mountConsole({ drafts: [seedDraft()] });
  const before = approveButton();
  assert.ok(before && !before.disabled, "fixture: approve is live");
  return mock;
}
/** Then stop its conversation with the connection dropped before commit. Works for one or two clicks. */
async function stopUnconfirmed() {
  const mock = await mountLive();
  mock.faults.dropBeforeCommit = true;
  await click(q(`[data-plan-c-conversation='${CONVERSATION}'] [data-plan-c-conversation-action='stop']`));
  const confirm = q(`[data-plan-c-conversation-confirm='stop']`);
  if (confirm) await click(confirm);
  assert.equal(mock.posts().filter(call => /\/stop$/.test(call.path)).length, 1, "fixture: the stop was attempted once");
  assert.equal(mock.state.commits.length, 0, "fixture: the stop was never applied");
  assert.equal(mock.state.drafts[0].status, "awaiting", "fixture: the draft is genuinely still awaiting");
  assert.match(text(), /unconfirmed/i, "fixture: the result reads unconfirmed");
  return mock;
}

test("finding 3: control: a plain awaiting draft has a live approve", async () => {
  await mountLive();
});

test("finding 3: a stop whose connection was lost says 'stop unconfirmed'", async () => {
  await stopUnconfirmed();
  assert.match(text(), /stop unconfirmed/i, "REVIEW inv 7: an unconfirmed STOP shows 'stop unconfirmed'");
});

test("finding 3: after an unconfirmed stop, approve for that conversation is disabled and sends nothing", async () => {
  await assertApproveHeld(await stopUnconfirmed(), "the stop is unconfirmed");
});
