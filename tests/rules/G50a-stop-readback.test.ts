// Regression guard (G50a F10, lib half, W9 lib-mtproto-2): lib/mtproto/global-stop.ts setGlobalStop wrote the flag,
// then its read-back `getGlobalStop()` threw a bare "could not read global stop" with no hint that the write had
// landed; the admin route (app/api/admin/v1/mtproto/write/route.ts) then read the flag a SECOND time, so a read error
// turned a landed STOP into a 500. Now a landed-but-unverified write reports "state unknown", and setGlobalStop returns
// the verified read-back for the route to use. Control: a clean STOP lands.
// Runs in `npm run test:rules`. Offline FakeDb, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import { setGlobalStop } from "../../lib/mtproto/global-stop";
import { GLOBAL_STOP_KEY } from "../../lib/mtproto/types";

test.after(() => __setMtDbForTest(null));
const stored = (db: FakeDb) => db.rows("app_settings").find((r) => r.key === GLOBAL_STOP_KEY)?.value;

test("control: STOP lands", async () => {
  const db = new FakeDb();
  __setMtDbForTest(db);
  await setGlobalStop(true, "operator");
  assert.equal(stored(db), "true");
});

test("F10: setGlobalStop returns the verified read-back so the route does not read the flag twice", async () => {
  __setMtDbForTest(new FakeDb());
  assert.equal(await setGlobalStop(true, "operator"), true);
});

for (const [label, stopped, typed] of [["lift", false, "RESUME"], ["STOP", true, undefined]] as const) {
  test(`F10: ${label} lands but the read-back fails, the error says the state is unknown`, async () => {
    const db = new FakeDb();
    db.seed("app_settings", [{ key: GLOBAL_STOP_KEY, value: stopped ? "false" : "true" }]);
    __setMtDbForTest(db);
    db.fail("app_settings", "select", { message: "read timeout" });
    await assert.rejects(setGlobalStop(stopped, "operator", undefined, typed), /written but could not be read back, state unknown/);
    assert.equal(stored(db), stopped ? "true" : "false", "the write itself landed");
  });
}
