/**
 * G27: promoted from tests/known-red/W5-app-clones-* (fix-sweep) as a regression guard.
 * Known red (W5 app-clones F1, data-risk / false success): the missing-column retry in updateClone/createCloneRow
 * (app/clones/actions.ts:1153-1159, 1104-1110) strips ALL ~150 OPTIONAL_COLUMNS (withoutPersonaFactColumns, :1003-1007)
 * when PostgREST names ONE missing column, then returns normally. So one unapplied migration (e.g. account_phone, 170)
 * silently drops every other optional edit in the same save: here the operator re-arms price_guard_mode=block and the
 * retry PATCH no longer carries it, while the action reports no error.
 * Control: the first PATCH carries the full row incl. the operator's edits (holds).
 * Turns green when the save either refuses (throws, no second PATCH) or retries keeping EVERY column except the one
 * PostgREST named. (The "saved, X not persisted" notice the finding asks for is UI and not asserted here.)
 * Fakes only at the wire (tests/rules/G27-harness.ts); identity = admin via withDashboardAccess(null).
 */
import { startFakePostgrest } from "./G27-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { updateClone } from "../../app/clones/actions";

const CLONE = "cccccccc-1111-4111-8111-111111111111";
let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

const missing = { status: 400, body: { code: "PGRST204", message: "Could not find the 'account_phone' column of 'clones' in the schema cache" } };

async function saveWithOneMissingColumn() {
  pg.reset();
  let first = true;
  pg.respond((c) => {
    if (c.method === "PATCH" && c.path.endsWith("/clones")) {
      if (first) { first = false; return missing; }
      return { status: 204, body: null };
    }
    return undefined;
  });
  const fd = new FormData();
  fd.set("name", "Test Clone");
  fd.set("price_guard_mode", "block");
  fd.set("account_phone", "+10000000000");
  // compileClone/revalidatePath run after the write; the wire bodies are what is asserted.
  let threw: unknown;
  await withDashboardAccess(null, () => updateClone(CLONE, fd)).catch((e) => { threw = e; });
  return { threw, bodies: pg.calls.filter((c) => c.method === "PATCH" && c.path.endsWith("/clones")).map((c) => c.body) };
}

test("control: the first PATCH carries the operator's edits", async () => {
  const { bodies } = await saveWithOneMissingColumn();
  assert.ok(bodies.length >= 1, "updateClone never reached the PATCH");
  assert.equal(bodies[0].account_phone, "+10000000000");
  assert.equal(bodies[0].price_guard_mode, "block");
});

test("one missing column: refuse the save, or retry keeping every other column", async () => {
  const { threw, bodies } = await saveWithOneMissingColumn();
  if (bodies.length === 1) { assert.ok(threw, "no retry and no error: silent drop"); return; }
  const lost = Object.keys(bodies[0]).filter((k) => k !== "account_phone" && k !== "updated_at"
    && JSON.stringify(bodies[1][k]) !== JSON.stringify(bodies[0][k]));
  assert.deepEqual(lost, [], `retry PATCH dropped ${lost.length} columns PostgREST did not name (e.g. ${lost.slice(0, 5).join(", ")})`);
});
