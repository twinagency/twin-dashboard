/**
 * Rule (CLAUDE.md "Twin public API"; REVIEW.md inv 4): a key's scope comes from its row and every ambiguous row narrows
 * or is refused. Only the exact string "fleet" (with no clone_id) is a fleet key; a fleet row naming a clone, a clone
 * row without a clone, and any other scope spelling (case, whitespace, unknown) are refused outright; a legacy null
 * scope with a clone_id is that one clone. Pure: lib/api-tenant.ts tenantFromRow, no database.
 * Overlaps scripts/check-public-api.ts G4-G6 (npm run test:public) on purpose: this copy runs in init.sh's rules suite
 * and pins REFUSAL (null), where G5 only pins "not fleet". W4 lib-api-public-v2-plus6 characterization (C1),
 * mutation-proven: tests/rules/mutations/W4-lib-api-public-v2-plus6/c1-*.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { tenantFromRow } from "../../lib/api-tenant";

const CLONE = "11111111-1111-4111-8111-111111111111";
const row = (scope: unknown, clone_id: unknown) => tenantFromRow({ id: "key-1", clone_id, scope, label: "fake test key" });

test("exact 'fleet' with no clone is a fleet tenant with no clone id", () => {
  assert.deepEqual(row("fleet", null), { keyId: "key-1", cloneId: null, scope: "fleet", label: "fake test key" });
});

test("'clone' with a clone id, and a legacy null scope with a clone id, are that one clone", () => {
  assert.deepEqual(row("clone", CLONE), { keyId: "key-1", cloneId: CLONE, scope: "clone", label: "fake test key" });
  assert.deepEqual(row(null, CLONE), { keyId: "key-1", cloneId: CLONE, scope: "clone", label: "fake test key" });
});

test("any other spelling of fleet is refused, with or without a clone id", () => {
  for (const scope of ["Fleet", "FLEET", " fleet", "fleet ", "fleet\n", "fleets"]) {
    assert.equal(row(scope, null), null, `scope ${JSON.stringify(scope)} without a clone`);
    assert.equal(row(scope, CLONE), null, `scope ${JSON.stringify(scope)} with a clone`);
  }
});

test("a fleet row naming a clone, and a clone row with no clone, are refused", () => {
  assert.equal(row("fleet", CLONE), null);
  assert.equal(row("clone", null), null);
  assert.equal(row(null, null), null);
  assert.equal(row(undefined, null), null);
});

test("an unknown scope is refused, never guessed", () => {
  for (const scope of ["admin", "", "0", "agency", "Clone"]) {
    assert.equal(row(scope, CLONE), null, `scope ${JSON.stringify(scope)}`);
  }
});
