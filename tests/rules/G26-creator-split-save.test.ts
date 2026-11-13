/**
 * G26: promoted from tests/known-red/W5-app-actions-plus5-creator-split-save.test.ts (rwl/W5-app-actions-plus5).
 * TEST-CHANGE: the red asserted the creator-split Save must reach its handler. G26 keeps the middleware deny instead
 * (the brake) and removes the Save, so this now asserts the opposite: the deny holds and no inert save control is left.
 * Why the deny is the brake, not the bug: the /agency/* branch of middleware.ts returns before any session gate, so a
 * server action allowed on /agency/creator-split would run ANY action id with getDashboardAccess() null, which
 * guardDashboardAction reads as the admin. The Save was also dead below middleware (lib/platform-cut.ts writes
 * through the agency-scoped supabaseAdmin, W5 lib-openrouter-plus6 F1). Reviving an agency-side cut editor means a
 * route handler on the agency POST allowlist plus that lib fix: an owner decision, not a widening done here.
 * Original header below.
 * Known red (W5 app-actions-plus5 F3, half-wired money control; extends W5 lib-openrouter-plus6 F1, not a re-file):
 * the agency "Creator earnings split" Save is a server action (AgencyCreatorCutRowForm.tsx:5,22 -> actions.ts:11)
 * posted to /agency/creator-split. middleware.ts:238-239 runs agencyRequestAllowed for every /agency/* path BEFORE
 * the dev auth skip (:279), and agencyRequestAllowed short-circuits every server action to false
 * (lib/agency-policy.ts:7 `|| serverAction) return false`). So the Save is 403 "Read-only agency portal" for every
 * caller, independently of F1's lib refusal: fixing F1 alone does not revive it.
 * Control: the page GET and an allowlisted form POST pass, a non-allowlisted form POST is refused (holds).
 * If the owner deletes the page/action instead, delete this test with a TEST-CHANGE line.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { agencyRequestAllowed } from "../../lib/agency-policy";

const dir = new URL("../../app/agency/creator-split/", import.meta.url);
const sources = readdirSync(dir).map((f) => readFileSync(new URL(f, dir), "utf8"));

test("control: page GET and allowlisted form POST pass; a non-allowlisted form POST is refused", () => {
  assert.equal(agencyRequestAllowed("/agency/creator-split", "GET", false), true);
  assert.equal(agencyRequestAllowed("/agency/creator-invites/manage", "POST", false), true);
  assert.equal(agencyRequestAllowed("/agency/creator-split", "POST", false), false);
});

test("the brake holds: no server action runs on an /agency/* path", () => {
  for (const path of ["/agency/creator-split", "/agency/creators", "/agency/creator-invites", "/agency/creators/link"]) {
    assert.equal(agencyRequestAllowed(path, "POST", true), false, `server action allowed on ${path}`);
  }
});

test("the creator-split page carries no save control the portal would refuse", () => {
  assert.equal(existsSync(new URL("actions.ts", dir)), false, "app/agency/creator-split/actions.ts still exports a server action");
  for (const src of sources) {
    assert.doesNotMatch(src, /["']use server["']|from\s+["']\.\/actions["']/, "creator-split still wires a server action");
    assert.doesNotMatch(src, /<form|<Button|<button|onClick/, "creator-split still renders a save control");
  }
  const guard = readFileSync(new URL("../../lib/agency-management.ts", import.meta.url), "utf8");
  assert.doesNotMatch(guard, /saveAgencyCreatorCut/, "guardDashboardAction still admits the removed agency cut action");
});
