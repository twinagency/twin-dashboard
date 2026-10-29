import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { loadOnlyFansOverview } from "../lib/onlyfans/overview";
import { parseNativeEarnings } from "../lib/onlyfans/earnings";
import type { OnlyFansBackend } from "../lib/onlyfans/backend";
import { accounts } from "../lib/onlyfans-preview/fixtures";

async function main() {
  (globalThis as unknown as { React: typeof React }).React = React;
  const requireNative = createRequire(import.meta.url);
  requireNative.extensions[".css"] = module => { module.exports = {}; };
  // The client refresh timer needs a mounted app router; a static render has none.
  const Module = requireNative("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const load = Module._load;
  Module._load = (request, ...rest) => request === "next/navigation" ? { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => "/onlyfans/overview", useSearchParams: () => new URLSearchParams() } : load(request, ...rest);
  const { default: OverviewView } = await import("../components/onlyfans-preview/OverviewView");
  const now = new Date("2026-10-23T00:00:00Z");
  const a = accounts[0];
  const b = { ...accounts[0], accountId: "acct-b", binding: { ...accounts[0].binding, creatorId: "creator-b", creatorName: "Bee Creator", handle: "beebee" } };
  const c = { ...accounts[0], accountId: "acct-c", binding: { ...accounts[0].binding, creatorId: "creator-c", creatorName: "Cee Creator", handle: "ceecee" } };
  const list = [a, b, c];
  const row = (id: string, n: number, g: number, net: number) => ({ accountId: id, paymentCount: n, grossCents: g, netCents: net });
  const stats = [row(a.accountId, 2, 1000, 800), row("acct-b", 3, 3000, 2400), row("acct-c", 1, 500, 400)];
  const hist = (cStatus: "complete" | "syncing") => ({ accountCount: 3, completedAccountCount: cStatus === "complete" ? 3 : 2, accounts: [
    { accountId: a.accountId, status: "complete", importedPayments: 2, lastSuccessfulSyncAt: now.toISOString() },
    { accountId: "acct-b", status: "complete", importedPayments: 3, lastSuccessfulSyncAt: now.toISOString() },
    { accountId: "acct-c", status: cStatus, importedPayments: 1, lastSuccessfulSyncAt: cStatus === "complete" ? now.toISOString() : null }] });
  const native = (window: { start: string; end: string }, cStatus: "complete" | "syncing", scope?: string[]) => {
    const rowsIn = scope ? stats.filter(r => scope.includes(r.accountId)) : stats;
    return { schemaVersion: "of-earnings.v1", window, asOf: now.toISOString(), accountCount: 3, coveredAccountCount: 3, status: "unavailable", reasons: ["ledger_stale"], currency: "USD",
      clearedGrossCents: null, clearedNetCents: null, clearedCount: null, pendingCount: null, refundedCount: null, recentLedgerAt: now.toISOString(), fullLedgerAt: null,
      recorded: { grossCents: rowsIn.reduce((t, r) => t + r.grossCents, 0), netCents: rowsIn.reduce((t, r) => t + r.netCents, 0), pendingGrossCents: 0, pendingNetCents: 0, paymentCount: rowsIn.reduce((t, r) => t + r.paymentCount, 0), lastSuccessfulSyncAt: now.toISOString() },
      history: hist(cStatus), statistics: { byKind: [{ kind: "tip", paymentCount: rowsIn.reduce((t, r) => t + r.paymentCount, 0), grossCents: rowsIn.reduce((t, r) => t + r.grossCents, 0), netCents: rowsIn.reduce((t, r) => t + r.netCents, 0) }], byAccount: rowsIn },
      ...(scope ? { scope: { accountIds: scope } } : {}) };
  };
  const make = (mode: "ignores" | "echoes", cStatus: "complete" | "syncing" = "complete") => {
    const calls: unknown[] = [];
    const backend = { listAccounts: async () => ({ ok: true, data: list }),
      getEarnings: async (w: { start: string; end: string }, scope?: { accountIds?: string[] }) => { calls.push(scope ?? null);
        const raw = native(w, cStatus, mode === "echoes" && scope?.accountIds ? scope.accountIds : undefined);
        const parsed = parseNativeEarnings(raw, w, mode === "echoes" ? scope?.accountIds : null); assert(parsed); return { ok: true, data: parsed }; },
      getWorkspace: async (id: string) => ({ ok: true, data: { schemaVersion: "of-workspace.v2", section: "sales", accountId: id, asOf: now.toISOString(), lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, transactions: [], totals: [], openOffers: [], openOfferCount: 0, moreOpenOffers: false, nextCursor: null } }),
    } as unknown as OnlyFansBackend;
    return { backend, calls };
  };
  const html = async (backend: OnlyFansBackend, acct: string | null, creator: string | null = null) =>
    renderToStaticMarkup(<OverviewView data={await loadOnlyFansOverview(backend, "7d", acct, now, creator)} />);

  // All creators: unscoped call, agency totals, label says so.
  const all = make("ignores");
  const allHtml = await html(all.backend, null);
  assert.deepEqual(all.calls, [null]);
  assert.match(allHtml, /All creators · 3 accounts/); assert.match(allHtml, /USD 45\.00/);

  // Backend ignores the filter: figures come from per-account totals, labelled, splits unavailable.
  const ig = make("ignores");
  const igHtml = await html(ig.backend, "acct-b");
  assert.deepEqual(ig.calls, [{ accountIds: ["acct-b"] }]);
  assert.match(igHtml, /Bee Creator · @beebee/); assert.match(igHtml, /USD 24\.00/); assert.match(igHtml, /from per-account totals/);
  assert.doesNotMatch(igHtml, /USD 45\.00|USD 32\.00|Workspace totals/);
  assert.match(igHtml, /Unavailable for a single creator/);
  assert.match(igHtml, /aria-current="true"/);
  assert.match(igHtml, /href="\/onlyfans\/overview\?period=7d"/, "selected chip links back to all creators");

  // Backend echoes the filter: scoped figures used directly.
  const ec = make("echoes");
  const ecHtml = await html(ec.backend, null, "creator-c");
  assert.match(ecHtml, /Cee Creator · @ceecee/); assert.match(ecHtml, /USD 4\.00/); assert.doesNotMatch(ecHtml, /USD 45\.00/);

  // Unauthorized or malformed selection: no earnings read, unavailable state, no agency totals.
  const bad = make("ignores");
  for (const [acct, cr] of [["not-mine", null], [null, "not-a-creator"], ["acct-b", "creator-c"]] as const) {
    const h = await html(bad.backend, acct, cr);
    assert.match(h, /Unavailable for this creator yet/); assert.doesNotMatch(h, /USD 45\.00|USD 24\.00/);
  }
  assert.equal(bad.calls.length, 0, "an invalid selection never reaches the earnings backend");

  // Incomplete import: labelled verified subtotal, never the complete total.
  const inc = make("ignores", "syncing");
  const incData = await loadOnlyFansOverview(inc.backend, "7d", null, now, null);
  assert.equal(incData.figures.subtotal, false);
  const two = await loadOnlyFansOverview({ ...inc.backend, listAccounts: async () => ({ ok: true, data: [b, { ...c, binding: { ...c.binding, creatorId: "creator-b" } }] }) } as OnlyFansBackend, "7d", null, now, "creator-b");
  assert.equal(two.figures.subtotal, true); assert.equal(two.figures.netCents, 2400);
  const twoHtml = renderToStaticMarkup(<OverviewView data={two} />);
  assert.match(twoHtml, /Verified subtotal: 1 of 2 included accounts/); assert.match(twoHtml, /1 of 2 accounts have a complete payment import/);
  const none = await loadOnlyFansOverview(inc.backend, "7d", "acct-c", now);
  assert.equal(none.figures.netCents, null); assert.equal(none.figures.mode, "unavailable");

  // Parser: an echoed scope that differs from the request, or an echo nobody asked for, is rejected.
  const w = { start: "2026-10-16T00:00:00.000Z", end: now.toISOString() };
  assert.equal(parseNativeEarnings(native(w, "complete", ["acct-b"]), w, ["acct-c"]), null);
  assert.equal(parseNativeEarnings(native(w, "complete", ["acct-b"]), w, null), null);
  assert(parseNativeEarnings(native(w, "complete"), w, ["acct-b"]), "a backend that ignores the filter is still accepted");
  console.log("PASS OnlyFans scoped earnings: scope sent and echoed, per-account fallback labelled, invalid selection unavailable, subtotal labelled, no agency totals under a creator.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
