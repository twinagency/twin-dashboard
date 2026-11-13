// RULE G06 (REVIEW.md Structure "logic in the wrong layer / copy drift" with a user-visible effect): every refusal sentence
// the conversation-controls route emits is displayable. A chatter's management-permission 403 (real route answer, child
// harness scenario controls-non-manager) is shown as needing a manager, never as the generic "check your session" note,
// and an unlisted upstream sentence is never echoed nor read as a management refusal.
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
