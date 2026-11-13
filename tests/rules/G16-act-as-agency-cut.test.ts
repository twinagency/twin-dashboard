import "../support/admin-route-env";
// Regression guard (G16): promoted from known-red tests/known-red/W4-api-admin-plus1-act-as-agency-cut.test.ts as a regression guard. Original header below.
/**
 * KNOWN RED (W4 api-admin-plus1 F6, docs/review/W4/api-admin-plus1.md): GET /api/admin/v1/act-as/revenue with
 * `x-twin-act-as: agency:<id>` sums publicRevenue() per clone, which nets in "creator" mode (platform cut AND the
 * agency-creator cut, stacked). An agency's view is "agency" mode, platform cut only (lib/api-public.ts
 * publicFleetRevenue, lib/revenue-projection.ts net()), over the agency's own clones only. Drives the real route and
 * the real getAnalytics; PostgREST faked at the wire (tests/support/admin-wire.ts). Fixture: one 1000-star sale on
 * the agency's clone, platform cut 20%, agency-creator cut 50% (agency view 800, creator view 400), plus a second
 * clone the agency does NOT own with its own 500-star sale, which must not appear.
 * Control: acting as the clone shows the creator net (400). Turns green on agency-mode netting limited to the
 * agency's clones, or on a 4xx refusal.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_ID, CLONE_ID, actAsWire, adminRequest, callJson, installWire } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/act-as/revenue/route";

async function actAs(header: string) {
  const w = installWire(actAsWire({ platformCutPct: 20, agencyCreatorCutPct: 50, otherClone: true }));
  try {
    return await callJson(GET, adminRequest("/api/admin/v1/act-as/revenue?period=1M", { headers: { "x-twin-act-as": header } }));
  } finally { w.restore(); }
}

test("control: acting as the clone shows the creator net, both cuts stacked (1000 -> 400)", async () => {
  const { status, body } = await actAs(`clone:${CLONE_ID}`);
  assert.equal(status, 200, JSON.stringify(body).slice(0, 400));
  assert.equal(body.revenue.totals.revenueStars, 400);
});

// Deleting the agency branch until an agency key scope exists is an accepted fix (the finding's YAGNI option): a 4xx passes.
test("F6: acting as the agency shows the agency net over its own clones only (1000 -> 800), or is refused", async () => {
  const { status, body } = await actAs(`agency:${AGENCY_ID}`);
  if (status >= 400 && status < 500) return;
  assert.equal(status, 200, JSON.stringify(body).slice(0, 400));
  assert.equal(body.revenue.totals.revenueStars, 800, "agency act-as netted the agency-creator cut too (creator mode), or counted a clone it does not own");
  const ids = (body.revenue.models ?? []).map((m: { id: string }) => m.id);
  assert.deepEqual(ids, [CLONE_ID], "models[] must list exactly the agency's clones");
});
