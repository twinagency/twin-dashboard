// KNOWN RED (W3-lib-onlyfans-2 C1S5; REVIEW.md Structure "logic in the wrong layer / copy drift" with a user-visible
// effect): lib/onlyfans/controls.ts:80-86 DASHBOARD_CONTROL_REFUSALS is a hand-kept copy of the sentences the control
// route emits, and it has drifted. app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route.ts:55
// answers a chatter's pause/resume/no-contact with 403 {schemaVersion:"of-controls.v1", ok:false, outcome:"refused",
// error:"This action requires management permission."}, but that sentence is not in the 403 list, so controlRefusalNote
// shows the generic "Your session cannot change this conversation. Check your team access and refresh." and the
// operator is told to fix their session instead of being told the action needs a manager.
// Fixed: every refusal sentence the route emits is displayable (one shared list, the route's sentence added, or a
// route `code` the note looks up). The red feeds controlRefusalNote the REAL route answer (route child harness,
// W3-lib-onlyfans-2-route.child.ts scenario controls-non-manager: synthetic agency chatter, canChat without canManage),
// so a code-based fix is seen; it asserts the note names management, not the exact sentence.
// Team's Claude owns the fix; not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { controlRefusalNote } from "../../lib/onlyfans/controls";
import { runRoute } from "./W3-lib-onlyfans-2-route.spawn";

const refusal = (error: string) => ({ schemaVersion: "of-controls.v1", ok: false, outcome: "refused", error });
const GENERIC_403 = "Your session cannot change this conversation. Check your team access and refresh.";

test("control: a listed 403 sentence from the route is echoed", () => {
  assert.match(controlRefusalNote(403, refusal("Your team access is read-only.")), /read-only/i);
});

test("control: an unlisted upstream sentence is never echoed", () => {
  const raw = "Upstream said something internal.";
  const note = controlRefusalNote(403, refusal(raw));
  assert.notEqual(note, raw);
  // An always-"needs a manager" note would turn the C1S5 red green; an unlisted sentence must not read as one.
  assert.doesNotMatch(note, /manag/i);
});

test("C1S5: the route's management-permission 403 is shown as a management refusal", () => {
  const r = runRoute("controls-non-manager");
  assert.equal(r.status, 403, `the route refuses a non-manager pause: ${JSON.stringify(r.body)}`);
  assert.deepEqual(r.calls, [], "refused before any backend call");
  assert.match(JSON.stringify(r.body), /manag/i, "precondition: the route refused for lack of management, not another reason");
  const note = controlRefusalNote(r.status, r.body);
  assert.notEqual(note, GENERIC_403, "controls.ts:82 403 list is missing route.ts:55's sentence, so the generic session note shows");
  assert.match(note, /manag/i, `the note does not say the action needs a manager: "${note}"`);
});
