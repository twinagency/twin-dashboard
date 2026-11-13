/**
 * RULE G04 (#389 R2 N1): the named owner is opt-in per route through authorizeOnlyFansRead's `pilotIdentity` option
 * (lib/onlyfans/route.ts), and an uncertain lookup refuses 503 `owner_unavailable` instead of falling back to the session actor,
 * whose hash differs and would break the backend's actor binding on a retry. Drives the REAL requireOnlyFansRead through
 * tests/rules/core-route.child.ts "pilot": only the internal operator who opted in is looked up; a failed lookup is denied 503;
 * a resolved one carries the stable named-owner actor; without the opt-in nothing is looked up; agency and view-as never get one.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { coreRouteChild, NAMED_OWNER } from "./core-fixtures";

const OWNER_ACTOR = `op-session:${createHash("sha256").update(`twin-plan-c-named-owner-v1:${NAMED_OWNER}`).digest("hex")}`;
const r = coreRouteChild("pilot");

test("an operator whose named-owner lookup fails is refused 503, not given the session actor", () => {
  assert.equal(r["operator, lookup fails"].result, "denied:503");
  assert.equal(r["operator, lookup fails"].pilotActor, null);
});

test("an operator who opted in gets the stable named-owner actor, from one lookup", () => {
  assert.deepEqual(r["operator, lookup resolves"], { result: "ctx", pilotActor: OWNER_ACTOR, lookups: 1 });
});

test("without the opt-in the operator is never looked up", () => {
  assert.deepEqual(r["operator, no pilotIdentity"], { result: "ctx", pilotActor: null, lookups: 0 });
});

test("agency identities and view-as never get a named owner", () => {
  for (const name of ["agency session", "agency identity with operator cookie, plan-c-guard options",
    "agency identity with operator cookie, agency options", "view-as"] as const) {
    assert.equal(r[name].pilotActor, null, name);
    assert.equal(r[name].lookups, 0, name);
  }
});
