// KNOWN RED (W1 lane 7a finding 2, docs/review/W1/preview-plan-c-status-ui.md; REVIEW.md inv 7 "Holds and STOP": a STOP is
// never harder to trigger than a go, no fingerprint/revision gate on stop). PlanCConsole.tsx:30 hides every conversation
// control, Stop included, when the backend did not report the conversation's revision, and :32-38 make Stop two clicks
// (button, then "Confirm stop"); :189 refuses a stop without a revision. Approve is one click with no conversation revision
// (:105). "Two clicks = harder" is our reading of REVIEW inv 7 [i]; the click test counts clicks until each command leaves,
// so any fix that makes Stop no harder than Approve goes green. tests/components/plan-c-ui.test.tsx:178,201-207 (two-click
// stop) and :290-295 (revision gate) enshrine the current design (lane 9b, TEST-CHANGE when fixed); the client and
// route side is lane 1 finding 2 (plan-c-client.ts:86-87, plan-c-route.ts:66). Team's Claude owns the fix.
// Not wired into npm scripts. Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy). No network.
import assert from "node:assert/strict";
import test from "node:test";
import { seedDraft, type PlanCMock } from "../contracts/plan-c-mock-backend";
import { all, click, mountConsole, q } from "./7a-harness";

const STOP = "[data-plan-c-conversation-action='stop'], [data-plan-c-conversation-confirm='stop']";

test("finding 2: control: a conversation with a known revision renders a Stop button", async () => {
  await mountConsole({ drafts: [seedDraft()] });
  assert.equal(all("[data-plan-c-conversation-action='stop']").length, 1);
});

test("finding 2: a conversation whose revision the backend did not report still offers Stop", async () => {
  const draft = seedDraft(); (draft.conversation as { revision?: number }).revision = undefined;
  await mountConsole({ drafts: [draft] });
  assert.equal(all("[data-plan-c-draft]").length, 1, "fixture: the draft card renders");
  assert.ok(all(STOP).length >= 1, "Stop is offered for a listed conversation without a revision (no revision gate on stop, REVIEW inv 7)");
});

/** Clicks each step in order while it exists and no matching POST has left yet; returns the clicks it took (Infinity: none left). */
async function clicksUntilPost(mock: PlanCMock, steps: string[], path: RegExp) {
  let clicks = 0;
  for (const selector of steps) {
    if (mock.posts().some(call => path.test(call.path))) break;
    const element = q(selector);
    if (!element || element.disabled) continue;
    await click(element); clicks++;
  }
  return mock.posts().some(call => path.test(call.path)) ? clicks : Infinity;
}

test("finding 2: Stop takes no more clicks than Approve to send its command", async () => {
  const approveClicks = await clicksUntilPost((await mountConsole({ drafts: [seedDraft()] })).mock, ["[data-plan-c-approve]"], /\/approve$/);
  assert.equal(approveClicks, 1, "fixture: approve leaves on one click");
  const stopClicks = await clicksUntilPost((await mountConsole({ drafts: [seedDraft()] })).mock,
    ["[data-plan-c-conversation-action='stop']", "[data-plan-c-conversation-confirm='stop']"], /\/stop$/);
  assert.ok(stopClicks <= approveClicks, `Stop is never harder to trigger than approve (REVIEW inv 7): stop took ${stopClicks} clicks, approve ${approveClicks}`);
});
