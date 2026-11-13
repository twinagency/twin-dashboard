// G36 r1 regression guard (Flash blocker, #409). The /ai fan write tools (app/api/ai-assistant/write-tools.ts) must
// not coerce: setFanCredits accepted any integer (1e30, 1000001) and handed it to setCredits, which then threw, so
// the refusal surfaced as a thrown write ("outcome unknown") instead of a clean ok:false; setFanBlocked read anything
// but `true` (a string "true"/"false", null, 0) as UNBLOCK. Now: credits must be a safe integer 0..MAX_FAN_CREDITS
// (lib/fan-credits.ts) and blocked a real boolean, else ok:false with nothing written and nothing logged.
// Controls: credits 1000000 and blocked:false on an existing fan are ok:true, one PATCH, one audit row.
// Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G36-ai-fan-tools.test.ts
// DECLARED BYPASS: Next workAsyncStorage fake store (see G18-harness header); PostgREST faked on 127.0.0.1.
import { CLONE, FAN_ID, inWorkStore, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.seed("users", [{ id: FAN_ID, clone_id: CLONE.id, name: "Sam", telegram_id: 1001, message_credits: 3, blocked: true, blocked_reason: "operator", minor_flagged_at: null, is_active: true }]);
});
const run = async (tool: string, args: Record<string, unknown>): Promise<any> => {
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  try { return await inWorkStore(() => executeWriteTool(tool, args)); } catch (e) { return { thrown: e instanceof Error ? e.message : String(e) }; }
};
const fan = () => pg.rows("users").find(r => r.id === FAN_ID);

test("control: setFanCredits 1000000 is ok:true and writes it", async () => {
  const r = await run("setFanCredits", { userId: FAN_ID, credits: 1_000_000 });
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.equal(fan()?.message_credits, 1_000_000);
  assert.equal(pg.writes("POST", "system_logs").length, 1);
});

for (const credits of [1e30, 1_000_001, -3, 2.5, "7", "1e3", null, false, ""]) {
  test(`setFanCredits credits=${JSON.stringify(credits)} is a clean refusal, nothing written`, async () => {
    const r = await run("setFanCredits", { userId: FAN_ID, credits });
    assert.equal(r?.thrown, undefined, `credits=${JSON.stringify(credits)} threw (audited as outcome unknown): ${r?.thrown}`);
    assert.equal(r?.ok, false, JSON.stringify(r));
    assert.equal(pg.writes("PATCH", "users").length, 0);
    assert.equal(pg.writes("POST", "system_logs").length, 0);
    assert.equal(fan()?.message_credits, 3);
  });
}

test("control: setFanBlocked blocked:false unblocks (admin)", async () => {
  const r = await run("setFanBlocked", { userId: FAN_ID, blocked: false });
  assert.equal(r?.ok, true, JSON.stringify(r));
  assert.equal(fan()?.blocked, false);
});

for (const blocked of ["false", "true", null, 0, 1, undefined]) {
  test(`setFanBlocked blocked=${JSON.stringify(blocked)} is refused, never read as unblock`, async () => {
    const r = await run("setFanBlocked", { userId: FAN_ID, blocked });
    assert.equal(r?.thrown, undefined, String(r?.thrown));
    assert.equal(r?.ok, false, `blocked=${JSON.stringify(blocked)} returned ${JSON.stringify(r)}, fan blocked=${fan()?.blocked}`);
    assert.equal(pg.writes("PATCH", "users").length, 0);
    assert.equal(fan()?.blocked, true);
  });
}
