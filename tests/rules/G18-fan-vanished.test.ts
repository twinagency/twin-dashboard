/**
 * Rule (G18 rwl R1 F8, deepseek; not from the known-red corpus): the fan write tools pre-read the fan, but the fan
 * actions (app/users/actions.ts) update by id and report no row count. A fan deleted between the pre-read and the
 * update must not come back ok:true with a success system_logs row for a write that matched nothing.
 * The fake PostgREST store drops the fan row when the PATCH arrives, so the PATCH matches 0 rows as in Postgres.
 * Control: the fan still exists → ok:true and one audit row.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-fan-vanished.test.ts
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, FAN_ID, inWorkStore, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const TOOLS: [string, Record<string, unknown>][] = [
  ["setFanBlocked", { userId: FAN_ID, blocked: true }],
  ["setFanActive", { userId: FAN_ID, active: false }],
  ["setFanCredits", { userId: FAN_ID, credits: 10 }],
  ["resetFanCounters", { userId: FAN_ID }],
];
let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("users", [{ id: FAN_ID, clone_id: CLONE.id, name: "Sam", message_credits: 3, blocked: false, is_active: true }]);
});
const run = async (tool: string, args: Record<string, unknown>) => {
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  return (await inWorkStore(() => executeWriteTool(tool, args))) as any;
};

test("control: the fan still exists → ok:true and one audit row", async () => {
  const r = await run("setFanBlocked", { userId: FAN_ID, blocked: true });
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.equal(pg.writes("POST", "system_logs").length, 1);
});

for (const [tool, args] of TOOLS) {
  test(`F8: ${tool} on a fan deleted before the update is not ok:true and logs no success`, async () => {
    pg.respond((c) => {
      if (c.table === "users" && c.method === "PATCH") pg.rows("users").length = 0; // deleted between pre-read and update
      return undefined;
    });
    const r = await run(tool, args);
    assert.equal(pg.writes("PATCH", "users").length, 1, "fixture: the update was sent");
    assert.notEqual(r?.ok, true, `${tool} reported a zero-row write as success: ${JSON.stringify(r)}`);
    assert.equal(pg.writes("POST", "system_logs").length, 0, `${tool} logged a success for a zero-row write`);
  });
}
