/**
 * Known red (W6 app-posting-plus3 H1, stop holds win / REVIEW inv 7): `setFanSequenceStatus`
 * (app/sequences/actions.ts:355-388) accepts any target in ["active","paused","stopped"] and never calls
 * `canTransitionSession` (lib/sequence-policy.ts:249-259: stopped -> [], completed -> []). Its lock_version is the
 * one it just read (:364-370), not the one the page saw, so it cannot catch a stale page either. Migration 147 has no
 * session transition trigger (twin-bot db/migrations/147_video_sequences.sql:149, CHECK on the value only).
 * Condition: internal admin (access null: the agency proxy lib/agency-sequence.ts:177 does check) clicks Resume on a
 * fan page loaded while the session was paused, after someone or the runtime ended it. The ended session goes back
 * to `active` and paid parts are offered again.
 * Control: paused -> active is written. Turns green when the action refuses stopped/completed -> active and sends no
 * PATCH. Fake at the wire, offline.
 * Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-posting-plus3-session-resume-stopped.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE, FAN, loadSequenceActions, type Call } from "./W6-app-posting-plus3-harness";

function harness(status: string) {
  return loadSequenceActions((call: Call) => {
    if (call.table !== "video_sequence_sessions") throw new Error("unexpected table " + call.table);
    if (call.method === "GET") return { status: 200, json: [{ clone_id: CLONE, user_id: FAN, status, lock_version: 3 }] };
    if (call.method === "PATCH") return { status: 200, json: [{ user_id: FAN }] };
    throw new Error("unexpected " + call.method);
  });
}
const resume = () => {
  const fd = new FormData();
  fd.set("userId", FAN); fd.set("cloneId", CLONE); fd.set("status", "active");
  return fd;
};

test("control: a paused session can be resumed (PATCH status=active)", async () => {
  const { actions, wire } = harness("paused");
  await actions.setFanSequenceStatus(resume());
  const patch = wire.find((c) => c.method === "PATCH");
  assert.equal((patch?.body as { status: string }).status, "active");
});

for (const ended of ["stopped", "completed"]) {
  test(`HIGH: a ${ended} session cannot be resumed (refused, no PATCH)`, async () => {
    const { actions, wire } = harness(ended);
    await assert.rejects(actions.setFanSequenceStatus(resume()));
    assert.equal(wire.filter((c) => c.method === "PATCH").length, 0, `a ${ended} session must stay ${ended}`);
  });
}
