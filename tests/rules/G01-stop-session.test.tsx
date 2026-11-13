// RULE G01 (REVIEW.md inv 7 "Holds and STOP"): a stop holds that fan's approve and edit, including an editor already open,
// and a hand back sends the revision the stop recorded and releases the hold. A recorded stop never reads as less than recorded.
// Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy). No network.
import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_ACCOUNT, seedDraft, type PlanCMock } from "../contracts/plan-c-mock-backend";
import { approveButton, click, mountConsole, q, typeInto } from "./7a-harness";

const CONVERSATION = `${MOCK_ACCOUNT}:900000000001`;
const control = (action: string) => q(`[data-plan-c-conversation='${CONVERSATION}'] [data-plan-c-conversation-action='${action}']`);
const posts = (mock: PlanCMock, path: RegExp) => mock.posts().filter(call => path.test(call.path));

test("control: an open editor saves an edit when nothing holds the fan", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft()] });
  await click(q("[data-plan-c-draft] [data-plan-c-edit]"));
  await typeInto(q("textarea[aria-label='Part 1 text']"), "a changed first part");
  await click(q("[data-plan-c-edit-confirm]"));
  assert.equal(posts(mock, /\/edit$/).length, 1);
});

test("an editor opened before Stop cannot save an edit for the stopped fan", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft()] });
  await click(q("[data-plan-c-draft] [data-plan-c-edit]"));
  await typeInto(q("textarea[aria-label='Part 1 text']"), "a changed first part");
  await click(control("stop"));
  assert.equal(posts(mock, /\/stop$/).length, 1, "fixture: the stop was sent");
  const save = q("[data-plan-c-edit-confirm]");
  if (save && !save.disabled) await click(save);
  assert.equal(posts(mock, /\/edit$/).length, 0, "no edit leaves for a stopped fan");
  assert.equal(!!q("textarea[aria-label='Part 1 text']"), false, "the open editor closes when the hold appears");
});

test("a hand back after a recorded stop sends the stop's revision and makes approve live again", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft()] });
  await click(control("stop"));
  assert.equal(mock.state.commits.filter(c => c.action === "stop").length, 1, "fixture: the stop was recorded");
  assert.equal(approveButton()?.disabled, true, "a recorded stop holds approve");
  const recorded = mock.state.conversations[CONVERSATION].revision;
  await click(control("handback"));
  await click(q("[data-plan-c-conversation-confirm='handback']"));
  const handbacks = posts(mock, /\/handback$/);
  assert.equal(handbacks.length, 1);
  assert.equal(handbacks[0].body?.expectedRevision, recorded, "hand back carries the revision the stop recorded");
  assert.equal(mock.state.commits.filter(c => c.action === "handback").length, 1, "the hand back was recorded");
  assert.equal(approveButton()?.disabled, false, "approve is live again after the hand back");
});

test("a re-stop whose outcome is unconfirmed does not downgrade a recorded stop", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft()] });
  await click(control("stop"));
  assert.ok(q("[data-plan-c-stop-state='recorded']"), "fixture: the first stop was recorded");
  mock.faults.dropBeforeCommit = true;
  await click(control("stop"));
  assert.equal(posts(mock, /\/stop$/).length, 2, "fixture: the re-stop was attempted");
  assert.ok(q("[data-plan-c-stop-state='recorded']"), "the stop still reads as recorded");
});
