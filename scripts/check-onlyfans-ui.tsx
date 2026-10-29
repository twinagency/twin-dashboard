import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadOnlyFansOverview, paymentLabel } from "../lib/onlyfans/overview";
import type { OnlyFansBackend } from "../lib/onlyfans/backend";
import { accounts, conversationDetails } from "../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../lib/onlyfans-preview/fixture-data-source";
import { agencyOnlyFansRequest } from "../lib/onlyfans/agency-scope";
import { ONLYFANS_CHANNEL } from "../lib/channel-nav";
import type { SalesRead } from "../lib/onlyfans/workspace";
import { checkFanMemoryCategories } from "./check-onlyfans-fan-memory";

import { onlyFansMessageText } from "../lib/onlyfans/message-display";
async function main() {
  await checkFanMemoryCategories();
  assert.equal(onlyFansMessageText("<p>Hello &amp; welcome</p><p>Line two<br>Last line &#128075;</p>"), "Hello & welcome\nLine two\nLast line \u{1f44b}");
  assert.equal(onlyFansMessageText("I <3 you & 2 < 3"), "I <3 you & 2 < 3");
  assert.equal(onlyFansMessageText("<p>hello<script>alert(1)</script><strong> friend</strong></p>"), "hello friend");
  assert.equal(onlyFansMessageText("<p>&lt;img src=x onerror=alert(1)&gt;</p>"), "<img src=x onerror=alert(1)>");
  assert.equal(onlyFansMessageText("<p>&#xD800; &#999999999; &unknown;</p>"), "&#xD800; &#999999999; &unknown;");

  // Match Next's automatic JSX/CSS-module boundary in this offline renderer.
  (globalThis as unknown as { React: typeof React }).React = React;
  const requireNative = createRequire(import.meta.url);
  requireNative.extensions[".css"] = module => { module.exports = {}; };
  const { default: SalesView } = await import("../components/onlyfans-preview/SalesView");
  const { default: NativeWorkspaceView } = await import("../components/onlyfans-preview/NativeWorkspaceView");
  const { default: InboxView } = await import("../components/onlyfans-preview/InboxView");
  const originalDetail = Object.values(conversationDetails).find(detail => detail.ownedMedia.length > 0)!;
  assert(originalDetail, "A purchase-linked media fixture is required");
  const bundledDetail = { ...originalDetail, messages: [], ownedMedia: [1, 2, 3].map(index => ({
    ...originalDetail.ownedMedia[0], mediaId: "bundle-asset-" + index, label: "Bundle item " + index,
    purchasedAt: "2026-10-26T10:00:00Z", price: { currency: "USD", minorUnits: 1000 },
  })) };
  const fixtureAccount = accounts.find(account => account.accountId === bundledDetail.accountId)!;
  const inboxMarkup = renderToStaticMarkup(<InboxView
    accountsState={{ status: "ready", data: [fixtureAccount] }} activeAccount={fixtureAccount} activeAccountId={fixtureAccount.accountId}
    onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [bundledDetail.summary], nextCursor: null } }}
    selectedConversationId={bundledDetail.conversationId} onSelectConversation={() => {}}
    detailState={{ status: "ready", data: bundledDetail }} viewer={operatorViewer()} onCommand={() => {}}
    commandResult={null} nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome={false}
  />);
  assert.match(inboxMarkup, /Financial evidence unavailable\./,
    "Asset-level bundle prices cannot establish a fan's canonical spend");
  assert.match(inboxMarkup, /Known owned items: 3/, "Owned items stay visible as a known count");
  assert.match(inboxMarkup, /Ownership not fully verified, payment history incomplete/, "Missing financials must not read as authoritative ownership");
  assert.doesNotMatch(inboxMarkup, /<strong>3<\/strong><span>Owned media items<\/span>/, "No authoritative owned count without complete coverage");
  assert.doesNotMatch(inboxMarkup, /<strong>0<\/strong><span>Owned media items/);
  const incomplete = renderToStaticMarkup(<InboxView
    accountsState={{ status: "ready", data: [fixtureAccount] }} activeAccount={fixtureAccount} activeAccountId={fixtureAccount.accountId}
    onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [bundledDetail.summary], nextCursor: null } }}
    selectedConversationId={bundledDetail.conversationId} onSelectConversation={() => {}}
    detailState={{ status: "ready", data: { ...bundledDetail, ownedMedia: [], financials: { version: "of-fan-financials.v1", totals: [], coverageComplete: false, coverageAt: null, commerceHeld: false } } }} viewer={operatorViewer()} onCommand={() => {}}
    commandResult={null} nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome={false}
  />);
  assert.match(incomplete, /Known owned items: 0/); assert.match(incomplete, /Ownership not fully verified/);
  const complete = renderToStaticMarkup(<InboxView
    accountsState={{ status: "ready", data: [fixtureAccount] }} activeAccount={fixtureAccount} activeAccountId={fixtureAccount.accountId}
    onSelectAccount={() => {}} conversations={{ status: "ready", data: { items: [bundledDetail.summary], nextCursor: null } }}
    selectedConversationId={bundledDetail.conversationId} onSelectConversation={() => {}}
    detailState={{ status: "ready", data: { ...bundledDetail, financials: { version: "of-fan-financials.v1", totals: [], coverageComplete: true, coverageAt: "2026-10-28T00:00:00Z", commerceHeld: false } } }} viewer={operatorViewer()} onCommand={() => {}}
    commandResult={null} nextCursor={null} loadingMore={false} onLoadMore={() => {}} showPreviewChrome={false}
  />);
  assert.match(complete, /<strong>3<\/strong><span>Owned media items<\/span>/, "A complete scan shows the authoritative count");
  assert.doesNotMatch(complete, /Ownership not fully verified/);
  // Dossier order: identity, reply control, facts, notes, spend and ownership, then collapsed history.
  const order = ["Fan profile", "data-of-relationship", "Reply control", "Key facts and preferences", ">Notes<", "Spend and ownership", "Edit fan notes and facts", "History and sync details"].map(label => inboxMarkup.indexOf(label));
  assert(order.every(index => index >= 0), "Every dossier section renders: " + order.join(","));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Dossier sections follow the agreed order");
  const historyTag = inboxMarkup.match(/<details class="of-history-details"[^>]*>/)?.[0] ?? "";
  assert(historyTag && !/\sopen(=|\s|>)/.test(historyTag), "History and sync details start collapsed");
  assert.doesNotMatch(inboxMarkup, /Archive messages|Archive pages|Retrying \/ deferred|Stored messages/, "Diagnostics never sit in the open dossier");
  assert.match(inboxMarkup, /of-fan-sidebar flex min-w-0 flex-col/, "Sidebar column can shrink below its content");
  const css = readFileSync(new URL("../components/onlyfans-preview/InboxView.module.css", import.meta.url), "utf8");
  assert.match(css, /of-fan-sidebar\) \{ overflow-wrap:anywhere/, "Long ids and values wrap instead of overflowing");
  assert.match(css, /clamp\(320px,26vw,380px\)/, "Deliberate fan panel width");
  assert.match(css, /of-fan-sidebar > \*\)[^{]*\{ min-width:0/, "Sidebar children have min-width:0");
  const { MemoryDiagnostics, memoryState, MemoryStateView } = await import("../components/onlyfans-launch/memory/BMemoryPanel");
  const progress = { schemaVersion: "of-history-memory-progress.v1", algorithm: "a", storedMessages: 20, processedCurrentMessages: 20, pendingMessages: 0, storedMemoryComplete: true, providerHistoryComplete: null, revision: 1, oldestStoredAt: null, newestStoredAt: null, lastProcessedAt: "2026-10-28T00:00:00Z" } as never;
  const recovery = { schemaVersion: "of-history-recovery.v1", accountId: "a", fanId: "1", status: "incomplete", discoveryComplete: false, conversationsDiscovered: 3, conversationsComplete: 1, conversationsRetrying: 1, conversationsDeferredForLiveInput: 0, pagesCommitted: 4, messagesObserved: 0, messagesAdded: 0, totalMessages: null, percentComplete: null, recentRecoveryNeeded: true } as never;
  const diagnostics = renderToStaticMarkup(<MemoryDiagnostics progress={progress} recovery={recovery} />);
  for (const label of ["Archive messages", "Archive pages", "Retrying / deferred", "Stored messages"]) assert.match(diagnostics, new RegExp(label.replace("/", "\\/")));
  const memory = { facts: {}, summaries: {}, overrides: {}, interactions: [] } as never;
  assert.equal(memoryState({ ...(progress as object), processedCurrentMessages: 0, pendingMessages: 20, storedMemoryComplete: false, lastProcessedAt: null } as never, recovery, memory).key, "not_processed");
  assert.equal(memoryState({ ...(progress as object), processedCurrentMessages: 10, pendingMessages: 10, storedMemoryComplete: false } as never, recovery, memory).key, "partial");
  assert.equal(memoryState(progress, recovery, memory).key, "partial", "Incomplete provider history stays partial");
  assert.equal(memoryState(progress, { ...(recovery as object), status: "complete" } as never, memory).key, "no_facts");
  assert.equal(memoryState(progress, { ...(recovery as object), status: "complete" } as never, { ...(memory as object), facts: { home_city: { value: "Oslo", source: "history" } } } as never).key, "current");
  assert.match(renderToStaticMarkup(<MemoryStateView state={memoryState(progress, recovery, memory)} />), /Not reported/);
  assert.doesNotMatch(inboxMarkup, /Recorded purchases|Recent purchases|USD 30\.00/,
    "Three owned assets from one bundle must never be presented as three financial transactions");
  assert.equal((inboxMarkup.match(/Bundle item [123]/g) || []).length, 3, "All owned media stay visible");
  assert.doesNotMatch(inboxMarkup, /USD 10\.00/, "A bundle price must not be repeated as each asset's purchase price");
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

