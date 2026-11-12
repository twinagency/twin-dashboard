/**
 * Known red (W5 app-clones F4, data loss on re-save): the only `spoil_options` input lives inside SpoilMenuEditor,
 * mounted only while tips are on (components/clone/ConfigSections.tsx:2372, components/clone/editors.tsx:65-71).
 * rowFromForm always writes `spoil_options: parseSpoilOptions(fd)` (app/clones/actions.ts:400), and an absent key
 * parses to []. So saving Configure with tips off overwrites the operator's tip menu with [] (on re-enable V1 shows
 * DEFAULT_SPOIL_OPTIONS, components/clone/useCloneConfig.ts:327).
 * Control: a submitted menu is stored (holds).
 * Turns green when an absent spoil_options key leaves the column out of the update (or the input is always mounted
 * and this test is changed with a TEST-CHANGE line to post it).
 */
import { startFakePostgrest } from "./W5-app-clones-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { updateClone } from "../../app/clones/actions";

const CLONE = "cccccccc-4444-4444-8444-444444444444";
let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

async function save(fields: Record<string, string>) {
  pg.reset();
  pg.respond((c) => (c.method === "PATCH" && c.path.endsWith("/clones") ? { status: 204, body: null } : undefined));
  const fd = new FormData();
  fd.set("name", "Test Clone");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  await withDashboardAccess(null, () => updateClone(CLONE, fd)).catch(() => undefined);
  const patch = pg.calls.find((c) => c.method === "PATCH" && c.path.endsWith("/clones"));
  assert.ok(patch, "updateClone never reached the PATCH");
  return patch.body;
}

test("control: a submitted tip menu is stored", async () => {
  const menu = [{ stars: 250, label: "coffee" }];
  const row = await save({ tips_enabled: "true", spoil_options: JSON.stringify(menu) });
  assert.deepEqual(row.spoil_options, menu);
});

test("a save with tips off (no spoil_options input mounted) leaves the stored tip menu alone", async () => {
  const row = await save({ tips_enabled: "false" });
  assert.equal("spoil_options" in row, false, `PATCH overwrote spoil_options with ${JSON.stringify(row.spoil_options)}`);
});
