/**
 * Known red (W6 app-mtproto-campaign-plus5 F1, cross-girl isolation): `saveFlowAction`
 * (app/mtproto-campaign/flows/actions.ts:62) -> `updateFlow` (lib/mtproto/flows.ts:201-221) lets an operator move a
 * flow to another girl, with that girl's media, while a run that already carries the flow is still open. The girl
 * check `assertUsableFlow` (lib/mtproto/runs.ts:125) runs only at run creation; the worker's enrollment gate
 * (twin-mtproto src/store.ts:1854 selects `id, steps, enabled, archived`, never `clone_id`) snapshots whatever steps
 * the flow holds, so girl A's fans would be enrolled into girl B's photos/offers.
 * The main window is a dry run in status `done` awaiting Confirm LIVE (`confirmLive`, runs.ts:296-335, does not
 * re-check the flow), so both a queued run and a reviewed dry run are covered.
 * Control: retargeting a flow no run uses is allowed. Turns green when `updateFlow` refuses (a RunValidationError /
 * FlowValidationError) while an open or awaiting-confirm run references the flow. A fix that forks the flow instead
 * of refusing needs this test updated (TEST-CHANGE). Fake db only, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createFlow, updateFlow } from "../../lib/mtproto/flows";
import { createDryRun, queueRun } from "../../lib/mtproto/runs";
import { RunValidationError } from "../../lib/mtproto/validate";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";

const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLONE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHOTO_B = "55555555-5555-4555-8555-555555555555";
const textStep = { id: "s1", when: "reply", action: { type: "text", lines: ["hey you"] } };
const photoBStep = { id: "s1", when: "reply", action: { type: "free_media", photoIds: [PHOTO_B], videoIds: [], caption: "for you" } };

function freshDb(): FakeDb {
  const db = new FakeDb();
  db.seed("clones", [{ id: CLONE_A, name: "Alpha", status: "active" }, { id: CLONE_B, name: "Beta", status: "active" }]);
  db.seed("photos", [{ id: PHOTO_B, clone_id: CLONE_B }]);
  __setMtDbForTest(db);
  return db;
}
test.after(() => __setMtDbForTest(null));

test("control: a flow no run uses can move to girl B with girl B's photo", async () => {
  freshDb();
  const f = await createFlow({ name: "A", cloneId: CLONE_A, steps: [textStep] }, "operator");
  const moved = await updateFlow(f.id, { name: "A", cloneId: CLONE_B, steps: [photoBStep] }, "operator");
  assert.equal(moved.cloneId, CLONE_B);
});

async function attachedRun(status: "queued" | "done"): Promise<{ db: FakeDb; flowId: string }> {
  const db = freshDb();
  const f = await createFlow({ name: "A", cloneId: CLONE_A, steps: [textStep] }, "operator");
  const run = await createDryRun({ createdBy: "operator", cloneIds: [CLONE_A], filters: {}, dailyCap: 30, runCap: null, holdoutPct: 15, flowId: f.id });
  await queueRun(run.id, "operator");
  if (status === "done") db.rows("reengage_runs")[0].status = "done"; // dry run reviewed, awaiting Confirm LIVE
  assert.equal(db.rows("reengage_runs")[0].status, status);
  return { db, flowId: f.id };
}

for (const status of ["queued", "done"] as const) {
  test(`a flow on girl A's ${status} dry run cannot be moved to girl B with girl B's photo`, async () => {
    const { db, flowId } = await attachedRun(status);
    await assert.rejects(updateFlow(flowId, { name: "A", cloneId: CLONE_B, steps: [photoBStep] }, "operator"), RunValidationError);
    assert.equal(db.rows("mtproto_flows")[0].clone_id, CLONE_A, "stored flow still girl A");
  });
}
