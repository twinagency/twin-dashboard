/**
 * KNOWN RED (W1 lane 5 finding 1, page half of RISKS D6; REVIEW.md invariant 7 "Capability": block a diff that loosens who may
 * `mark_reconciled`). app/onlyfans/operations/page.tsx:26 passes `canAct={ctx.canChat}` to OperationsView, which hands it to
 * EngineUnresolvedPanel; components/onlyfans-preview/EngineUnresolved.tsx:27 shows "Mark reconciled" when
 * `canReconcile(item) && canAct` and :84-85 posts `mark_reconciled`. A chat-only agency user (canChat true, canManage false) gets it.
 * Drives the REAL page function through tests/rules/controls-page.child.ts (identity via the real withDashboardAccess scope, real
 * requireOnlyFansRead + agencyScopedFetch + read backend over a fake wire), then renders the returned element in jsdom; the
 * client panel's browser fetch serves tests/contracts/fixtures/engine-unresolved-live.json (one row declares mark_reconciled).
 * Replaced: next/headers, lib/view-as-banner.ts, the server-only line of plan-c-owner.ts, *.css (see the child header).
 * Turns green when a chat-only session is not offered the reconcile control on this page (page passes the manage capability for
 * reconcile, or per-action capabilities, lane 2 f14). Route half is lane 4 F1 (core-d6-chat-mark-reconciled), cited not repeated.
 * Latent until the backend serves mark_reconciled (lib/onlyfans/engine-operator.ts:6). Team's Claude owns the fix.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

const run = () => controlsChild("operations");

test("control: a manager agency session sees the unresolved rows and the one declared Mark reconciled control", () => {
  const r = run().manager;
  assert.equal(r.panel, true);
  assert.equal(r.rows, 3);
  assert.equal(r.reconcile, 1);
});

test("control: a chat-only agency session still sees the unresolved rows (D6: chat may see requests)", () => {
  const r = run().chat;
  assert.equal(r.panel, true);
  assert.equal(r.rows, 3);
});

test("F1: a chat-only agency session is not offered Mark reconciled on the Operations page", () => {
  const r = run().chat;
  assert.equal(r.reconcile, 0, `chat-only session rendered ${r.reconcile} Mark reconciled control(s); page passed canAct=${String(r.canAct)}`);
});
