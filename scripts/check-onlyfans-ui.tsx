import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadOnlyFansOverview, paymentLabel } from "../lib/onlyfans/overview";
import type { OnlyFansBackend } from "../lib/onlyfans/backend";
import { accounts } from "../lib/onlyfans-preview/fixtures";
import { agencyOnlyFansRequest } from "../lib/onlyfans/agency-scope";
import { ONLYFANS_CHANNEL } from "../lib/channel-nav";
import type { SalesRead } from "../lib/onlyfans/workspace";

async function main() {
  // Match Next's automatic JSX/CSS-module boundary in this offline renderer.
  (globalThis as unknown as { React: typeof React }).React = React;
  const requireNative = createRequire(import.meta.url);
  requireNative.extensions[".css"] = module => { module.exports = {}; };
  const { default: SalesView } = await import("../components/onlyfans-preview/SalesView");
  const { default: NativeWorkspaceView } = await import("../components/onlyfans-preview/NativeWorkspaceView");
  const now = new Date("2026-10-23T00:00:00Z");
  const account = accounts[0];
  const reads: string[] = [];
  const sales: SalesRead = { schemaVersion: "of-workspace.v2", section: "sales", accountId: account.accountId,
    asOf: now.toISOString(), lastCompleteSyncAt: null, historyRecoveryRequired: true, providerConnectionVerified: false,
    transactions: [], totals: [], openOffers: [], openOfferCount: 0, moreOpenOffers: false, nextCursor: null };
  const backend = { listAccounts: async (scope: unknown) => { assert.deepEqual(scope, { creatorId: null }); reads.push("accounts"); return { ok: true, data: [account] }; },
    getEarnings: async (window: { start: string; end: string }) => { reads.push("earnings"); return { ok: true, data: {
      schemaVersion: "of-earnings.v1", window, asOf: now.toISOString(), accountCount: 1, coveredAccountCount: 0, status: "unavailable", reasons: ["ledger_stale"], currency: "USD", clearedGrossCents: null, clearedNetCents: null, clearedCount: null, pendingCount: null, refundedCount: null, recentLedgerAt: null, fullLedgerAt: null } }; },
    getWorkspace: async (id: string, section: string, cursor: null) => { assert.equal(id, account.accountId); assert.equal(section, "sales"); assert.equal(cursor, null); reads.push("sales"); return { ok: true, data: sales }; },
  } as unknown as OnlyFansBackend;
  const data = await loadOnlyFansOverview(backend, "7d", null, now);
  assert.equal(data.window.start, "2026-10-16T00:00:00.000Z");
  assert.equal(data.earnings?.clearedNetCents, null, "Incomplete earnings must not become zero");
  assert.equal(data.sales, sales, "An earnings hold must not erase available account activity");
  assert.equal(reads.length, 3, "One bounded sales page; no per-fan or unbounded history reads");
  const denied = await loadOnlyFansOverview(backend, "30d", "another-account", now);
  assert.equal(denied.activityAccount, null); assert.equal(denied.sales, null); assert.match(denied.salesError!, /not available/);
  assert.equal(reads.filter(read => read === "sales").length, 1, "An unlisted account must never be queried");
  assert.equal(denied.window.start, "2026-09-23T00:00:00.000Z");
  const unavailable = await loadOnlyFansOverview(null, "7d", null, now);
  assert.equal(unavailable.earnings, null); assert(unavailable.accountsError);
  const broken = await loadOnlyFansOverview({ ...backend, listAccounts: async () => { throw new Error("offline"); } }, "7d", null, now);
  assert(broken.accountsError); assert.equal(broken.sales, null);
  assert.equal(paymentLabel("pending"), "Pending"); assert.equal(paymentLabel("cleared"), "Cleared");
  assert.equal(paymentLabel("refunded"), "Refunded"); assert.equal(paymentLabel("new_status"), "new_status");
  assert.equal(ONLYFANS_CHANNEL.href, "/onlyfans/overview");
  assert(ONLYFANS_CHANNEL.nav.some(item => item.href === "/onlyfans/campaigns"));
  assert(ONLYFANS_CHANNEL.nav.some(item => item.href === "/onlyfans/launch"), "Native launch readiness, personality, ledger, memory and account controls remain directly reachable");
  for (const method of ["GET", "HEAD"]) assert(agencyOnlyFansRequest("/onlyfans/overview", method, false, false));
  for (const method of ["POST", "PATCH", "DELETE"]) assert.equal(agencyOnlyFansRequest("/onlyfans/overview", method, false, true), false);
  assert.equal(agencyOnlyFansRequest("/onlyfans/operations", "GET", false, true), true);
  assert.equal(agencyOnlyFansRequest("/onlyfans/overview", "GET", true, true), false);
  const saleMarkup = renderToStaticMarkup(<SalesView creatorName="Scoped creator" data={{...sales,transactions:[{transactionId:"1",fanId:"101",messageId:null,kind:"tip",status:"pending",grossCents:123,netCents:null,currency:"EUR",occurredAt:now.toISOString()}]}} />);
  assert.match(saleMarkup, /EUR 1\.23/); assert.match(saleMarkup, />Pending</); assert.doesNotMatch(saleMarkup, />Paid</);
  const settingsMarkup = renderToStaticMarkup(<NativeWorkspaceView section="settings" account={account} accounts={[account]} creatorId={null} cursor={null} contentConfigured={false} configurationConfigured={false} canManage={false} agency data={{...sales,section:"settings",runtimeEnabled:false,deliveryPolicy:null,configuration:null}} />);
  assert.equal((settingsMarkup.match(/role="tabpanel"/g)||[]).length,3,"Read-only Settings must retain accessible panels for all three tabs");
  assert.doesNotMatch(settingsMarkup,/data-of-configuration-editor/); assert.doesNotMatch(settingsMarkup,/data-of-save-configuration/);
  console.log("PASS OnlyFans UI: bounded, isolated Overview reads; unknown account refusal; partial/unavailable data; rolling periods; preserved payment meanings; read-only page and Operations restrictions.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
