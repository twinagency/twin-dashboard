// RULE G24 R1 (#1, #6): availableActions (lib/onlyfans-preview/actions.ts) reads ONE settled list for the rollup and the incident.
// #1: a rollup outcome this build does not know holds, as an unknown incident outcome already does (live casts unvalidated
// strings, server-data-source.ts readConversations/readConversation).
// #6: an incident reporting queued/generating holds (the backend counts both unresolved: onlyfans_read/contract.py:109
// UNRESOLVED_OUTCOMES, projections.py:347-356 raises the incident from them). A queued/generating ROLLUP with no incident is the
// ordinary AI queue (lib/onlyfans/ai-visibility.ts:38-39 "AI reply queued") and does not hold resume or hand back.
import assert from "node:assert/strict";
import test from "node:test";
import type { DeliveryOutcome } from "../../lib/onlyfans-preview/types";
import { incident, offered, PAUSED, TAKEN_OVER } from "./W4-lib-onlyfans-preview-1-helpers";

const UNKNOWN_TO_THIS_BUILD = "superseded" as DeliveryOutcome;
const GO = ["send_manual_message", "release_takeover", "resume_automation"] as const;
const goOffered = (delivery: DeliveryOutcome, outcome?: DeliveryOutcome) => [
  ...offered({ delivery, shape: TAKEN_OVER, incident: outcome ? incident(outcome) : undefined }),
  ...offered({ delivery, shape: PAUSED, incident: outcome ? incident(outcome) : undefined }),
].filter(action => (GO as readonly string[]).includes(action));

test("control: a sent rollup with no incident offers send, hand back and resume", () => {
  assert.deepEqual([...new Set(goOffered("sent"))].sort(), [...GO].sort());
});

// Flash final: the backend raises an incident only while its attempt pointer stands and refuses sends until then, whatever the
// incident's outcome (onlyfans_read/projections.py delivery_incident, onlyfans_runtime/store.py Store._unresolved).
for (const outcome of ["failed", "refused", "sent"] as const) {
  test(`a recorded incident reporting "${outcome}" holds every go action`, () => {
    assert.deepEqual(goOffered("sent", outcome), []);
  });
}

test("#1: a rollup outcome this build does not know holds every go action, with no incident", () => {
  assert.deepEqual(goOffered(UNKNOWN_TO_THIS_BUILD), []);
});

for (const outcome of ["queued", "generating"] as const) {
  test(`#6: an incident reporting "${outcome}" beside a sent rollup holds every go action`, () => {
    assert.deepEqual(goOffered("sent", outcome), []);
  });

  test(`#6: a "${outcome}" rollup with no incident (the AI queue) still offers hand back and resume`, () => {
    const actions = goOffered(outcome);
    assert.ok(actions.includes("release_takeover") && actions.includes("resume_automation"), `offered: ${actions}`);
    assert.ok(!actions.includes("send_manual_message"), "a manual send must still wait for the queued AI reply");
  });
}
