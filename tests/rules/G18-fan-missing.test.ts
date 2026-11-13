/**
 * KNOWN RED (W4 F3, docs/review/W4/api-ai-assistant-plus2.md): the assistant's fan write tools
 * (app/api/ai-assistant/write-tools.ts:176-239) report success and write a system_logs row for a fan that
 * does not exist: the pre-read ignores a null row and app/users/actions.ts updates by id without a row count.
 * Control: an existing fan → {ok:true}. Red: a missing fan → not ok:true, and no system_logs row claiming it.
 * The fake PostgREST is the harness's stateful store: in the control the fan row exists, so GET users returns it
 * and PATCH users?id=eq.<fan> matches it (200 [fanRow] when representation is asked for, Content-Range on
 * count=exact). In the red cases the store has no users row, so the PATCH matches nothing, as in Postgres.
 * Fix shapes accepted: refuse on the pre-read, or check the PATCH's row count (representation or count); either
 * keeps the control green.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-fan-missing.test.ts (copied from tests/known-red/W4-api-ai-assistant-plus2-fan-missing.test.ts)
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, FAN_ID, inWorkStore, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => pg.reset());

const TOOLS: [string, Record<string, unknown>][] = [
  ["setFanBlocked", { userId: FAN_ID, blocked: true }],
  ["setFanActive", { userId: FAN_ID, active: false }],
  ["setFanCredits", { userId: FAN_ID, credits: 10 }],
  ["resetFanCounters", { userId: FAN_ID }],
];

async function run(tool: string, args: Record<string, unknown>): Promise<any> {
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  try {
    return await inWorkStore(() => executeWriteTool(tool, args));
  } catch (e) {
    return { thrown: e instanceof Error ? e.message : String(e) };
  }
}

test("control: every fan write tool on an existing fan returns ok:true", async () => {
  for (const [tool, args] of TOOLS) {
    pg.reset();
    pg.seed("users", [{ id: FAN_ID, clone_id: CLONE.id, stated_name: "Sam", name: "Sam", telegram_id: 1001, message_credits: 3, blocked: false, is_active: true }]);
    const r = await run(tool, args);
    assert.equal(r?.ok, true, `${tool}: ${JSON.stringify(r)}`);
    assert.equal(pg.writes("PATCH", "users").length, 1, `${tool}: the write must reach the existing fan row`);
  }
});

for (const [tool, args] of TOOLS) {
  test(`F3: ${tool} on a fan id with no users row does not report success or log it`, async () => {
    // empty store: GET users returns [] (no such fan); PATCH users?id=eq.<fan> matches no row
    const r = await run(tool, args);
    const logs = pg.writes("POST", "system_logs");
    assert.notEqual(r?.ok, true, `${tool} returned ok:true for a missing fan: ${JSON.stringify(r)}`);
    assert.equal(logs.length, 0, `${tool} wrote a system_logs row for a change that never happened`);
  });
}
