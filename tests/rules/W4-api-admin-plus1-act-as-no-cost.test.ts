import "../support/admin-route-env";
/**
 * Rule (CLAUDE.md "Twin public API", REVIEW.md inv 4): our cost and margin never leave the building. The admin
 * act-as revenue route returns the PUBLIC-shaped projection, so no costUsd / profitUsd / margin key appears anywhere
 * in its response, for the clone branch or the agency branch. Drives the real route and the real getAnalytics;
 * PostgREST faked at the wire (tests/support/admin-wire.ts). W4 api-admin-plus1 characterization.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_ID, CLONE_ID, actAsWire, adminRequest, callJson, installWire } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/act-as/revenue/route";

const COST_KEYS = new Set(["costUsd", "profitUsd", "margin", "costAud", "profitAud"]);
function costKeys(v: unknown, path = "$"): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => costKeys(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [...(COST_KEYS.has(k) ? [`${path}.${k}`] : []), ...costKeys(x, `${path}.${k}`)]);
  return [];
}
async function actAs(header: string) {
  const w = installWire(actAsWire({ costRollup: true }));
  try {
    const { status, body } = await callJson(GET, adminRequest("/api/admin/v1/act-as/revenue?period=1M", { headers: { "x-twin-act-as": header } }));
    assert.equal(status, 200, JSON.stringify(body).slice(0, 400));
    assert.equal(body.revenue.totals.revenueStars, 1000, "harness reaches the revenue ledger");
    return body;
  } finally { w.restore(); }
}

test("act-as clone: revenue response carries no cost / profit / margin key anywhere", async () => {
  assert.deepEqual(costKeys(await actAs(`clone:${CLONE_ID}`)), []);
});

test("act-as agency: revenue response carries no cost / profit / margin key anywhere", async () => {
  assert.deepEqual(costKeys(await actAs(`agency:${AGENCY_ID}`)), []);
});
