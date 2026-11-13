import "../support/admin-route-env";
// G36c (batch review 3): setBlocked(true) wrote only `blocked`, while a non-admin unblock needs blocked_reason
// "operator" (G36). So every dashboard-made block was admin-only to unblock: agency managers had a block switch with
// no way back (dead switch). A dashboard block now records reason "operator" + blocked_at, but only on a fan it
// actually flipped, and never over a safety reason or a minor flag: a legacy reason-less block stays admin-only.
// The block write lands first and its failure rejects.
// Harness: tests/support/admin-wire.ts (real actions, real supabase-js and agency fetch scoping, PostgREST faked at
// the wire with eq/is/in/or/and filters on GET and PATCH, so a conditional update that no longer matches writes nothing).
import assert from "node:assert/strict";
import test from "node:test";
import { inNextRoute, installWire } from "../support/admin-wire";
import { setBlocked } from "../../app/users/actions";
import { scopeAgencyWrite } from "../../lib/agency-write";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { TOP_ONLYFANS_AGENCY } from "../../lib/partner-portals";

const CLONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAN = "11111111-1111-4111-8111-111111111111";
const manager = { ...TOP_ONLYFANS_AGENCY, cloneIds: [CLONE], canManage: true };
type Row = Record<string, unknown>;
const fan = (over: Row = {}): Row => ({
  id: FAN, clone_id: CLONE, telegram_id: 4242, paused: false,
  blocked: false, blocked_reason: null, blocked_at: null, minor_flagged_at: null, ...over,
});

let row: Row;
let failBlockWrite = false;
// One wire per test file; `row` is the users table's only row (reassigned per test, so the store is reseeded).
const wire = installWire({
  override: (c) => failBlockWrite && c.method === "PATCH" && c.table === "users" && typeof c.body === "object" && c.body !== null && "blocked" in c.body
    ? new Response(JSON.stringify({ message: "block write failed", code: "XX000" }), { status: 500, headers: { "content-type": "application/json" } })
    : undefined,
});
test.after(() => wire.restore());

async function submit(who: typeof manager | null, blocked: "true" | "false") {
  wire.tables.users = [row];
  const fd = new FormData();
  fd.set("userId", FAN);
  fd.set("blocked", blocked);
  return inNextRoute("/users", () => withDashboardAccess(who, () => setBlocked(fd))).then(() => "resolved", (e: Error) => `rejected: ${e.message}`);
}

test("agency manager blocks a fan, then unblocks him (the dashboard block is an operator block)", async () => {
  row = fan();
  assert.equal(await submit(manager, "true"), "resolved");
  assert.equal(row.blocked, true);
  assert.equal(row.blocked_reason, "operator", "a dashboard block must record reason operator");
  assert.ok(typeof row.blocked_at === "string" && !Number.isNaN(Date.parse(row.blocked_at)), "blocked_at recorded");
  assert.equal(await submit(manager, "false"), "resolved", "agency manager could not lift his own block");
  assert.equal(row.blocked, false);
});

for (const [label, over] of [
  ["a minor-flagged fan", { blocked_reason: "minor", minor_flagged_at: "2026-11-01T00:00:00Z" }],
  ["a minor-flagged fan with no recorded reason", { minor_flagged_at: "2026-11-01T00:00:00Z" }],
  ["a us_location fan", { blocked_reason: "us_location" }],
] as const) {
  for (const already of [false, true]) {
    test(`blocking ${label} (${already ? "already blocked, stale form" : "admin had lifted the block"}) keeps the safety reason and stays admin-only`, async () => {
      row = fan({ ...over, blocked: already, blocked_at: already ? "2026-11-01T00:00:00Z" : null });
      assert.equal(await submit(manager, "true"), "resolved");
      assert.equal(row.blocked, true);
      assert.equal(row.blocked_reason, over.blocked_reason ?? null, "a safety reason was overwritten");
      assert.equal(row.minor_flagged_at, over.minor_flagged_at ?? null);
      assert.match(await submit(manager, "false"), /^rejected/, "agency manager lifted a safety block");
      assert.equal(row.blocked, true);
    });
  }
}

test("a stale block of a legacy reason-less block leaves it reason-less, so still admin-only", async () => {
  row = fan({ blocked: true });
  assert.equal(await submit(manager, "true"), "resolved");
  assert.equal(row.blocked_reason, null, "a legacy block was turned into an agency-liftable operator block");
  assert.match(await submit(manager, "false"), /^rejected/);
  assert.equal(row.blocked, true);
});

test("a failed block write rejects, never reports success", async () => {
  row = fan();
  failBlockWrite = true;
  try {
    assert.match(await submit(null, "true"), /^rejected/);
    assert.match(await submit(manager, "true"), /^rejected/);
  } finally { failBlockWrite = false; }
  assert.equal(row.blocked, false);
});

test("the agency write scope admits only the conditional operator stamp, no other block reason write", async () => {
  const at = "2026-11-13T00:00:00Z";
  const url = (q: string) => new URL(`${process.env.SUPABASE_URL}/rest/v1/users?id=eq.${FAN}${q}`);
  const guarded = "&or=(blocked_reason.is.null,blocked_reason.eq.operator)&minor_flagged_at=is.null";
  await scopeAgencyWrite(url(guarded), "PATCH", { blocked_reason: "operator", blocked_at: at }, manager);
  for (const [label, q, body] of [
    ["a safety reason", guarded, { blocked_reason: "minor", blocked_at: at }],
    ["clearing the reason", guarded, { blocked_reason: null, blocked_at: null }],
    ["the stamp without the reason condition", "&minor_flagged_at=is.null", { blocked_reason: "operator", blocked_at: at }],
    ["the stamp without the minor condition", "&or=(blocked_reason.is.null,blocked_reason.eq.operator)", { blocked_reason: "operator", blocked_at: at }],
    ["blocked_at alone", guarded, { blocked_at: at }],
  ] as const) {
    await assert.rejects(scopeAgencyWrite(url(q), "PATCH", body, manager), /operator block reason/, label);
  }
});
