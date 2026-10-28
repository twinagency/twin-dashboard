import assert from "node:assert/strict";
import React, { act } from "react";
import { createRequire } from "node:module";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { accounts } from "../lib/onlyfans-preview/fixtures";
import { inboxSyncNotice } from "../lib/onlyfans/inbox-sync";
import { connectionAiStatus } from "../lib/onlyfans-connections/presentation";
import { CONNECTION_SCHEMA, type Connection } from "../lib/onlyfans-connections/contract";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

async function main() {
  const fresh = { asOf: "2026-10-28T11:50:00Z", maxAgeSeconds: 1800, stale: false };
  const stale = { ...fresh, asOf: "2026-10-28T10:00:00Z", stale: true };
  const account = { ...accounts[0], health: "connected" as const, healthReason: null, syncFreshness: fresh };
  assert.equal(inboxSyncNotice(null, stale, stale), null);
  assert.equal(inboxSyncNotice(account, null, null), null, "A fresh selected account must not inherit another account's warning");
  const incomplete = inboxSyncNotice({ ...account, syncFreshness: { ...stale, asOf: null } }, null, null)!;
  assert.equal(incomplete.title, "History sync incomplete.");
  assert.match(incomplete.detail, /complete sync has not been recorded/);
  assert.match(incomplete.detail, new RegExp(account.binding.creatorName));
  const destination = new URL(incomplete.href, "https://dashboard.invalid");
  assert.equal(destination.searchParams.get("account"), account.accountId);
  assert.equal(destination.searchParams.get("creator"), account.binding.creatorId);
  assert.equal(destination.searchParams.get("connection"), "1");
  assert.equal(destination.hash, "#connection-" + encodeURIComponent(account.accountId));
  const old = inboxSyncNotice(account, stale, { ...stale, asOf: "2026-10-28T09:00:00Z" })!;
  assert.equal(old.title, "History may be out of date.");
  assert.equal(old.asOf, "2026-10-28T09:00:00Z");
  const expired = inboxSyncNotice({ ...account, health: "expired_session", healthReason: "Sign in again to resume syncing." }, null, null)!;
  assert.equal(expired.title, "Connection needs attention.");
  assert.match(expired.detail, /Sign in again/);

  const connection: Connection = { accountId: account.accountId, revision: 1, status: "verified", ownerId: "123",
    expiresAt: "2099-10-28T18:00:00Z", verifiedAt: "2026-10-28T11:50:00Z", lastError: null,
    outgoingEnabled: false, policyRevision: 1, usedUnits: 0, limitUnits: 0, mediaEnabled: false, automateNewConversations: false,
    sync: { discoveryStatus: "running", pages: 476, conversationsComplete: 0, conversationsRemaining: 5410,
      pendingMessages: 8, quarantinedMessages: 0, recoveryRequired: true, lastCompleteSyncAt: null },
    runner: { state: "held", reason: "runtime-disabled", stale: false, observedAt: "2026-10-28T11:50:00Z", restarts: 0 }, aiLive: false };
  assert.equal(connectionAiStatus(connection)?.text, "AI replies are switched off for this account.");
  assert.equal(connectionAiStatus({ ...connection, runner: { ...connection.runner!, stale: true } })?.text, "AI not running (status out of date)");

  const dom = new JSDOM("<div id='root'></div>", { url: "https://dashboard.invalid/onlyfans/accounts" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, React, IS_REACT_ACT_ENVIRONMENT: true });
  const requests: { url: string; method: string }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET" });
    return Response.json({ schemaVersion: CONNECTION_SCHEMA, ok: true, connection });
  };
  const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch: async () => {} };
  const { default: ConnectionEditor } = await import("../components/onlyfans-preview/ConnectionEditor");
  const root = createRoot(document.getElementById("root")!);
  await act(async () => { root.render(<AppRouterContext.Provider value={router}><ConnectionEditor accountId={account.accountId} initiallyOpen /></AppRouterContext.Provider>); });
  assert.equal(document.querySelector("[data-of-connection-open]")?.getAttribute("aria-expanded"), "true");
  assert.match(document.querySelector("[data-of-connection-status]")?.textContent ?? "", /Connected/);
  assert.match(document.querySelector("[data-of-sync-progress]")?.textContent ?? "", /5410 remaining/);
  assert.match(document.querySelector("[data-of-ai-live]")?.textContent ?? "", /AI replies are switched off/);
  assert(requests.some(request => request.url.endsWith("/" + encodeURIComponent(account.accountId))));
  assert(requests.every(request => request.method === "GET"), "Opening status must only read, never send or activate replies");
  await act(async () => root.unmount());
  dom.window.close();
  console.log("PASS sync warning: selected account scope, incomplete/stale/expired explanations, exact deep link, automatic status read and readable AI hold.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
