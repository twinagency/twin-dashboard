import "../support/admin-route-env";
// Regression guard (G17): was KNOWN RED tests/known-red/W4-api-admin-plus1-mtproto-pause.test.ts, fixed in this PR (app/api/admin/v1/mtproto/write/route.ts). Original header below.
/**
 * KNOWN RED (W4 api-admin-plus1 F2, docs/review/W4/api-admin-plus1.md): POST /api/admin/v1/mtproto/write
 * `set_connection_pause` reads `paused = body.paused === true`, so a missing / "true" / 1 value RESUMES a manually
 * paused creator (the unsafe direction, no phrase needed for a manual pause). Drives the real route; PostgREST is
 * faked at the wire (tests/support/admin-wire.ts). Control: paused:true pauses.
 * Turns green when a non-boolean `paused` is a 400 and the row stays paused. That is the prescribed fix shape
 * (typeof boolean, as the sibling actions check): a fix that coerces "true"/1 to true stays red here BY DESIGN,
 * because guessing intent from a malformed value is how the missing case came to mean resume.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, adminRequest, installWire } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/mtproto/write/route";

const manuallyPaused = () => installWire({
  tables: { userbot_connections: [{ clone_id: CLONE_ID, status: "active", paused: true, paused_reason: "operator hold", daily_cap: 30 }] },
});
const send = (body: Record<string, unknown>) => POST(adminRequest("/api/admin/v1/mtproto/write", { json: { action: "set_connection_pause", cloneId: CLONE_ID, ...body } }));

test("control: paused:true writes a pause", async () => {
  const w = installWire({ tables: { userbot_connections: [{ clone_id: CLONE_ID, status: "active", paused: false, paused_reason: null, daily_cap: 30 }] } });
  try {
    const res = await send({ paused: true, reason: "test" });
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    assert.equal(w.tables.userbot_connections[0].paused, true);
    assert.ok(w.rest("userbot_connections", "POST").length > 0, "harness reaches the upsert");
  } finally { w.restore(); }
});

for (const [label, extra] of [["missing", {}], ['"true" (string)', { paused: "true" }], ["1", { paused: 1 }]] as const) {
  test(`F2: paused ${label} is refused (400) and does not resume a manual pause`, async () => {
    const w = manuallyPaused();
    try {
      const res = await send(extra);
      assert.equal(w.tables.userbot_connections[0].paused, true, `paused ${label} resumed the creator`);
      assert.equal(res.status, 400);
    } finally { w.restore(); }
  });
}
