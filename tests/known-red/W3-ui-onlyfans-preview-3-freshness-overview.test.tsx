// KNOWN RED (W3 ui-onlyfans-preview-3, findings F22 F23 F24; docs/review/W3/ui-onlyfans-preview-3.md):
// F22 components/onlyfans-preview/PreviewChrome.tsx:65-70 — FreshnessLine trusts the `stale` flag only and ignores `maxAgeSeconds`
//     (lib/onlyfans-preview/types.ts:64 "a cached value cannot read as current"): data 2 h old with a 120 s limit reads "Updated 2h ago"
//     in fresh style, and `asOf: null` reads "Updated not yet verified".
// F23 components/onlyfans-preview/OverviewView.tsx:97 vs :58 — an import entry with status "unavailable" (made by
//     lib/onlyfans/overview.ts computeFigures, via the real loadOnlyFansOverview, for a creator the agency-wide history does not list) reads "importing" in the history panel
//     while Needs attention says "Payment import is unavailable."
// F24 OverviewView.tsx:87 — with one creator selected, the all-clear claims "Every creator is connected and payment imports are
//     complete." although only that creator's accounts were checked.
// Team's Claude owns the fixes. Not wired into npm scripts; init.sh reports it.
// Offline: react-dom/server renderToStaticMarkup inside the real Next router contexts (no effects run), parsed in jsdom; no fetch.
import { NextShell } from "../helpers/w3-preview3-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FreshnessLine } from "../../components/onlyfans-preview/PreviewChrome";
import OverviewView from "../../components/onlyfans-preview/OverviewView";
import { accounts } from "../../lib/onlyfans-preview/fixtures";
import { loadOnlyFansOverview, type OverviewData } from "../../lib/onlyfans/overview";
import type { OnlyFansBackend } from "../../lib/onlyfans/backend";
import type { EarningsHistory, NativeEarnings } from "../../lib/onlyfans/earnings";
import type { Freshness, OfAccount } from "../../lib/onlyfans-preview/types";

const render = (element: React.ReactElement) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<NextShell pathname="/onlyfans/overview">{element}</NextShell>);
  return host;
};
const line = (freshness: Freshness) => render(<FreshnessLine freshness={freshness} />).querySelector<HTMLElement>("[data-of-freshness]")!;

test("control: a line flagged stale renders stale", () => {
  const el = line({ asOf: new Date(Date.now() - 2 * 3600_000).toISOString(), maxAgeSeconds: 120, stale: true });
  assert.equal(el.getAttribute("data-of-freshness"), "stale");
  assert.match(el.textContent ?? "", /out of date/);
});

test("F22: data older than its maxAgeSeconds reads stale even when the flag says fresh", () => {
  const el = line({ asOf: new Date(Date.now() - 2 * 3600_000).toISOString(), maxAgeSeconds: 120, stale: false });
  assert.equal(el.getAttribute("data-of-freshness"), "stale",
    `a value past its maxAgeSeconds must not read as current (rendered "${el.textContent}")`);
});

test("F22: a value never verified does not read \"Updated\"", () => {
  const el = line({ asOf: null, maxAgeSeconds: 60, stale: false });
  assert.doesNotMatch(el.textContent ?? "", /^Updated/, "a value with no asOf was never verified and must not read as updated");
});

const fresh = (): Freshness => ({ asOf: new Date().toISOString(), maxAgeSeconds: 600, stale: false });
const ava: OfAccount = { ...accounts[0], health: "connected", syncFreshness: fresh() };
const bea: OfAccount = { ...accounts[0], accountId: "of-acc-bea-009", health: "connected", syncFreshness: fresh(),
  binding: { ...accounts[0].binding, bindingId: "ofb-0009", creatorId: "creator-bea-0009", creatorName: "Bea Lane", handle: "bealane" } };
const span = { start: "2026-11-05T00:00:00.000Z", end: "2026-11-12T00:00:00.000Z" };
const earnings = (history: EarningsHistory, scope: string[] | null): NativeEarnings => ({ schemaVersion: "of-earnings.v1", window: span, asOf: span.end,
  accountCount: 2, coveredAccountCount: 2, status: "current", reasons: [], currency: "USD", clearedGrossCents: 2000, clearedNetCents: 1600, clearedCount: 2,
  pendingCount: 0, refundedCount: 0, recentLedgerAt: span.end, fullLedgerAt: span.end,
  recorded: { grossCents: 2000, netCents: 1600, pendingGrossCents: 0, pendingNetCents: 0, paymentCount: 2, lastSuccessfulSyncAt: span.end },
  history, statistics: { byKind: [], byAccount: [ava, bea].map(a => ({ accountId: a.accountId, paymentCount: 1, grossCents: 1000, netCents: 800 })) },
  ...(scope ? { scope: { accountIds: scope } } : {}) });
const entry = (account: OfAccount, status: EarningsHistory["accounts"][number]["status"]) =>
  ({ accountId: account.accountId, status, importedPayments: 3, lastSuccessfulSyncAt: span.end });
/**
 * The page's real loader (lib/onlyfans/overview.ts loadOnlyFansOverview, incl. its :140 creator-scope rule) over a fake backend:
 * listAccounts answers both creators, getEarnings answers `data` whatever scope it was asked for (the test decides whether the scope is
 * echoed), getWorkspace refuses sales (the page shows its sales error, not part of these checks).
 */
async function overview(selectedAccount: string | null, data: NativeEarnings): Promise<OverviewData> {
  const backend = { label: "fake",
    listAccounts: async () => ({ ok: true as const, data: [ava, bea] }),
    getEarnings: async () => ({ ok: true as const, data }),
    getWorkspace: async () => ({ ok: false as const, status: 503 as const, code: "backend_unavailable", error: "Recent sales are unavailable." }),
  } as unknown as OnlyFansBackend;
  return loadOnlyFansOverview(backend, "7d", selectedAccount, new Date(span.end));
}
const historyLine = (host: HTMLElement) => host.querySelector('[aria-label="Payment history import"] p')?.textContent ?? "";
const needsAttention = (host: HTMLElement) => host.querySelector('[aria-label="Needs attention"]')?.textContent ?? "";

test("control: an import still running reads importing in the history panel", async () => {
  const host = render(<OverviewView data={await overview(null, earnings({ accountCount: 2, completedAccountCount: 1, accounts: [entry(ava, "syncing"), entry(bea, "complete")] }, null))} />);
  assert.match(historyLine(host), /Ava Hart: importing/);
  assert.match(needsAttention(host), /Payment import is still running\./);
});

test("F23: an unavailable payment import does not read \"importing\" in the history panel", async () => {
  // Creator selected, backend did not echo the filter, its history lists only Bea: computeFigures marks Ava "unavailable".
  const data = await overview(ava.accountId, earnings({ accountCount: 1, completedAccountCount: 1, accounts: [entry(bea, "complete")] }, null));
  assert.equal(data.figures.history?.accounts[0]?.status, "unavailable", "fixture: the real loader's figures mark the import unavailable");
  const host = render(<OverviewView data={data} />);
  assert.match(needsAttention(host), /Payment import is unavailable\./, "fixture: Needs attention says unavailable");
  assert.doesNotMatch(historyLine(host), /importing/i, `an unavailable import must not read as in progress (history panel "${historyLine(host)}")`);
});

const allComplete = { accountCount: 2, completedAccountCount: 2, accounts: [entry(ava, "complete"), entry(bea, "complete")] };

test("control: with all creators in view and every check clear, the all-clear names every creator", async () => {
  const host = render(<OverviewView data={await overview(null, earnings(allComplete, null))} />);
  assert.match(needsAttention(host), /All clear\. Every creator is connected and payment imports are complete\./);
});

test("F24: with one creator selected, the all-clear does not claim every creator", async () => {
  const scoped = { accountCount: 1, completedAccountCount: 1, accounts: [entry(ava, "complete")] };
  const data = await overview(ava.accountId, earnings(scoped, [ava.accountId]));
  assert.equal(data.selection.kind, "creator", "fixture: one creator selected");
  const text = needsAttention(render(<OverviewView data={data} />));
  assert.match(text, /All clear/, "fixture: every check for the selection is clear");
  assert.doesNotMatch(text, /Every creator/, "a creator-scoped check must not claim every creator is connected");
});
