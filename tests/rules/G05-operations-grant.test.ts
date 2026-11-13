/**
 * Regression guard (G05, Flash R1 F7; REVIEW invariant 7 "Isolation", tenant isolation). app/onlyfans/operations/page.tsx reads the
 * account list through readAccounts (lib/onlyfans/reads.ts), which holds the agency grant: a `?creator=` outside the grant is denied
 * before the backend is asked, and an account the backend answers for a creator outside the grant is refused, never rendered.
 * Drives the REAL page through tests/rules/controls-page.child.ts ("operations-grant") as CHAT_AGENCY (granted one clone) over the fake
 * wire in tests/rules/controls-wire.ts. Control: the granted creator renders the account's operations.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

const run = () => controlsChild("operations-grant");

test("control: an agency asking for its granted creator sees that account's operations", () => {
  const r = run().granted;
  assert.equal(r.view, true, r.text);
  assert.equal(r.accountReads.length, 1);
});

test("F7: an agency asking for a creator outside its grant is denied with no backend account read", () => {
  const r = run()["creator outside grant"];
  assert.equal(r.view, false);
  assert.deepEqual(r.accountReads, [], "the out-of-grant creator reached the backend");
  assert.match(r.text, /not available to this session/);
});

test("F7: an account the backend answers for a creator outside the grant is not rendered", () => {
  const r = run()["account of another creator"];
  assert.equal(r.view, false, "a misrouted account was rendered");
});
