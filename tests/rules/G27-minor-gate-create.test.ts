/**
 * G27: promoted from tests/known-red/W5-app-clones-* (fix-sweep) as a regression guard.
 * Known red (W5 app-clones F2, safety brake): rowFromForm writes `strict_minor_gate: fd.get("strict_minor_gate") === "true"`
 * (app/clones/actions.ts:347). Only the Configure UI pins it, with a hidden input (components/clone/ConfigSections.tsx:1750).
 * POST /api/admin/v1/clones/create builds its FormData from getCloneDefaults() + the body (route.ts:52-85); neither has
 * strict_minor_gate (lib/clone-default-policy.ts), so createCloneRow inserts an explicit FALSE over the column default
 * true (twin-bot db/migrations/116_strict_minor_gate.sql:27), and the bot reads `r.strict_minor_gate ?? true`
 * (twin-bot src/data/supabase-store.ts:2822): API-created clones run the weaker pre-116 minor gate.
 * The FormData here mirrors what that route builds (defaults are served empty by the fake, so BUILTIN defaults apply).
 * Control: an explicit "true" is stored true (holds).
 * Turns green when the server never derives the brake from the form (literal true, or the key omitted on insert):
 * neither an absent key nor an explicit "false" in the body may store false.
 */
import { startFakePostgrest } from "./G27-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { createCloneRow } from "../../app/clones/actions";

let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

async function create(extra: Record<string, string>) {
  pg.reset();
  pg.respond((c) => {
    if (c.method === "POST" && c.path.endsWith("/clones")) return { status: 201, body: [{ id: "cccccccc-2222-4222-8222-222222222222" }] };
    return undefined;
  });
  const fd = new FormData();
  fd.set("name", "Api Clone");
  fd.set("bot_token", "fake-bot-token-for-tests");
  fd.set("persona_facts", "1"); // the admin create route sets this marker (route.ts:93)
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  await withDashboardAccess(null, () => createCloneRow(fd)).catch(() => undefined);
  const insert = pg.calls.find((c) => c.method === "POST" && c.path.endsWith("/clones"));
  assert.ok(insert, "createCloneRow never reached the insert");
  return Array.isArray(insert.body) ? insert.body[0] : insert.body;
}

test("control: the UI form's pinned strict_minor_gate=true is stored true", async () => {
  const row = await create({ strict_minor_gate: "true" });
  assert.equal(row.strict_minor_gate, true);
});

test("a create without the UI's hidden pin (admin API path) must not disarm the strict minor gate", async () => {
  const row = await create({});
  assert.notEqual(row.strict_minor_gate, false, "createCloneRow inserted strict_minor_gate=false over the column default true");
});

test("an explicit strict_minor_gate=false in the create body (route.ts forwards it) must not disarm the gate", async () => {
  const row = await create({ strict_minor_gate: "false" });
  assert.notEqual(row.strict_minor_gate, false, "createCloneRow stored the caller's strict_minor_gate=false");
});
