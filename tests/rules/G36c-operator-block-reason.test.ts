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
import { catalogueEligible } from "../../lib/catalogue-core";
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
  // r1 F2: the unblock clears the stamp, so a later reason-less block (e.g. the bot's, reason written second) is not
  // read as this operator block.
  assert.equal(row.blocked_reason, null, "the operator stamp survived the unblock");
  assert.equal(row.blocked_at, null);
  assert.equal(catalogueEligible(row), true, "the catalogue gate (blocked_at) still locks out an unblocked fan");
  row.blocked = true; // a later reason-less block lands
  assert.match(await submit(manager, "false"), /^rejected/, "agency manager lifted a later reason-less block via a stale operator stamp");
  assert.equal(row.blocked, true);
});

// r1 F3 (decision: stamp only for an agency caller). Admin and AI-assistant blocks stay reason-less: admin-only to lift.
test("an admin block records no reason, so an agency manager cannot lift it", async () => {
  row = fan();
  assert.equal(await submit(null, "true"), "resolved");
  assert.equal(row.blocked, true);
  assert.equal(row.blocked_reason, null, "an admin block was stamped operator");
  assert.match(await submit(manager, "false"), /^rejected/, "agency manager lifted an admin block");
  assert.equal(row.blocked, true);
});

test("admin unblock clears an operator stamp but never a safety reason", async () => {
  row = fan({ blocked: true, blocked_reason: "operator", blocked_at: "2026-11-01T00:00:00Z" });
  assert.equal(await submit(null, "false"), "resolved");
  assert.deepEqual([row.blocked, row.blocked_reason, row.blocked_at], [false, null, null]);
  row = fan({ blocked: true, blocked_reason: "minor", minor_flagged_at: "2026-11-01T00:00:00Z", blocked_at: "2026-11-01T00:00:00Z" });
  assert.equal(await submit(null, "false"), "resolved");
  assert.deepEqual([row.blocked, row.blocked_reason, row.minor_flagged_at], [false, "minor", "2026-11-01T00:00:00Z"]);
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

// Flash 6: lib/catalogue-core.ts and the bot's browse/catalogue/offer gates read blocked_at, so a lift that leaves it
// set keeps the fan locked out. The minor gate is minor_flagged_at || reason "minor" (twin-bot src/safety.ts
// isMinorGated), never blocked_at, and us_location is the block itself; a "minor" reason keeps blocked_at anyway.
for (const [label, over, eligible] of [
  ["a reason-less (legacy or admin) block", {}, true],
  ["a us_location block", { blocked_reason: "us_location" }, true],
  ["a minor-flagged block", { blocked_reason: "minor", minor_flagged_at: "2026-11-01T00:00:00Z" }, false],
  ["a minor reason with no flag", { blocked_reason: "minor" }, false],
] as const) {
  test(`admin unblock of ${label}: the catalogue gate ${eligible ? "opens" : "stays shut"}`, async () => {
    row = fan({ blocked: true, blocked_at: "2026-11-01T00:00:00Z", ...over });
    assert.equal(await submit(null, "false"), "resolved");
    assert.equal(row.blocked, false);
    assert.equal(row.blocked_reason, over.blocked_reason ?? null, "a safety reason was cleared");
    assert.equal(catalogueEligible(row), eligible, `blocked_at ${JSON.stringify(row.blocked_at)}`);
  });
}

// TEST-CHANGE (r1 F1/F2): the admitted stamp is now one statement {blocked:true, blocked_reason, blocked_at} with a
// blocked=eq.false filter (was a separate {blocked_reason, blocked_at} PATCH), plus the unblock clear; the old
// stamp-only body is now refused.
test("the agency write scope admits only the exact conditional stamp and clear, no other block reason write", async () => {
  const at = "2026-11-13T00:00:00Z";
  const url = (q: string) => new URL(`${process.env.SUPABASE_URL}/rest/v1/users?id=eq.${FAN}${q}`);
  const stampQ = "&blocked=eq.false&or=(blocked_reason.is.null,blocked_reason.eq.operator)&minor_flagged_at=is.null";
  const clearQ = "&blocked_reason=eq.operator&minor_flagged_at=is.null";
  const stamp = { blocked: true, blocked_reason: "operator", blocked_at: at };
  const clear = { blocked: false, blocked_reason: null, blocked_at: null };
  await scopeAgencyWrite(url(stampQ), "PATCH", stamp, manager);
  await scopeAgencyWrite(url(clearQ), "PATCH", clear, manager);
  for (const [label, q, body] of [
    ["a safety reason", stampQ, { ...stamp, blocked_reason: "minor" }],
    ["the stamp on an unblock body", stampQ, { ...stamp, blocked: false }],
    ["the stamp without blocked", stampQ, { blocked_reason: "operator", blocked_at: at }],
    ["the stamp with an extra column", stampQ, { ...stamp, paused: true }],
    ["the stamp on an already-blocked row (no blocked=eq.false)", "&or=(blocked_reason.is.null,blocked_reason.eq.operator)&minor_flagged_at=is.null", stamp],
    ["the stamp without the reason condition", "&blocked=eq.false&minor_flagged_at=is.null", stamp],
    ["the stamp without the minor condition", "&blocked=eq.false&or=(blocked_reason.is.null,blocked_reason.eq.operator)", stamp],
    ["a non-string blocked_at", stampQ, { ...stamp, blocked_at: null }],
    ["clearing the reason while blocking", clearQ, { ...clear, blocked: true }],
    ["clearing a reason that is not operator", "&minor_flagged_at=is.null", clear],
    ["clearing without the minor condition", "&blocked_reason=eq.operator", clear],
    ["clearing the reason alone", clearQ, { blocked_reason: null }],
    ["blocked_at alone", stampQ, { blocked_at: at }],
    // Flash F-major: both shapes the two-statement r0 admitted.
    ["a standalone stamp on an already-blocked reason-less row", "", { blocked_reason: "operator", blocked_at: at }],
    ["blocked:false combined with the stamp", "&or=(blocked_reason.is.null,blocked_reason.eq.operator)&minor_flagged_at=is.null", { blocked: false, blocked_reason: "operator", blocked_at: at }],
    // r1 delta: a plain unblock carries no reason key, so it must still be the exact operator clear.
    ["a plain unblock", "", { blocked: false }],
    ["a plain unblock with another column", "", { blocked: false, paused: false }],
    ["a plain unblock with the clear filters", clearQ, { blocked: false }],
  ] as const) {
    await assert.rejects(scopeAgencyWrite(url(q), "PATCH", body, manager), /operator block reason/, label);
  }
});
