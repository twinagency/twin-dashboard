// KNOWN RED (W3 ui-onlyfans-preview-4, findings F14 F16 F17 F18 F19 F20 in docs/review/W3/ui-onlyfans-preview-4.md). Team's Claude owns the fixes.
// F14 components/onlyfans-preview/labels.tsx:47: `sent` (= the provider accepted the request, lib/onlyfans-preview/types.ts:48-49) reads
//     "Delivered" (inv 7: no false success).
// F16 RevenueView.tsx:37: OnlyFans-reported totals (figures.providerSourced, sourceNote "… 1 of 3 accounts") read "Showing recorded
//     payments", and the source/subset note is never shown.
// F17 RevenueView.tsx:53: the "All creators" total row shows recorded totals that include accounts not listed above (unmatched), at "100%".
// F18 RevenueView.tsx:46,56: an accounts read failure renders "No creators connected yet." beside the error (an outage reads as empty).
// F19 RevenueView.tsx:51: "Detail" links `accountId: c.accountIds[0]`, which narrows a two-account creator to one account, and drops `period`.
// F20 RequestStateBlock.tsx:57-61,91-97: every `unavailable` state says "Ask your account administrator to finish setup.", also when it
//     comes from a failed refresh after a command (OnlyFansWorkspace.tsx:699).
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close).
// Offline, pure render: react-dom/server renderToStaticMarkup inside the harness's Next contexts; RevenueData is built by the real
// loader (lib/onlyfans/revenue.ts loadOnlyFansRevenue) from earnings bodies the real parser accepts (control test), with a stub backend
// object in place of the HTTP client (accounts cast as in scripts/check-onlyfans-revenue.ts:10).
import { NextShell, close } from "../helpers/w3-preview4-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadOnlyFansRevenue, type RevenueData } from "../../lib/onlyfans/revenue";
import { parseNativeEarnings, type EarningsWindow } from "../../lib/onlyfans/earnings";
import { resolveSelection } from "../../lib/onlyfans/overview";
import type { OnlyFansBackend } from "../../lib/onlyfans/backend";
import type { OfAccount } from "../../lib/onlyfans-preview/types";
import RevenueView from "../../components/onlyfans-preview/RevenueView";
import { DeliveryPill } from "../../components/onlyfans-preview/labels";
import { RequestStateBlock } from "../../components/onlyfans-preview/RequestStateBlock";

after(close);
const NOW = new Date("2026-11-01T00:00:00Z"), AS_OF = "2026-10-31T23:00:00Z";
const html = (element: React.ReactElement) => {
  const box = document.createElement("div");
  box.innerHTML = renderToStaticMarkup(<NextShell pathname="/onlyfans/revenue">{element}</NextShell>);
  return box;
};
const text = (box: HTMLElement) => box.textContent?.replace(/\s+/g, " ") ?? "";
const acct = (accountId: string, creatorId: string, creatorName: string, handle: string) => ({ accountId, binding: { creatorId, creatorName, handle } }) as unknown as OfAccount;

/** A ledger-complete earnings body: a1 has 3 payments / USD 30.00 gross, zz (no account record) has 9 / USD 9.00. */
const ledger = (window: EarningsWindow, byAccount = [{ accountId: "a1", paymentCount: 3, grossCents: 3000, netCents: 2400 }, { accountId: "zz", paymentCount: 9, grossCents: 900, netCents: 700 }]) => {
  const gross = byAccount.reduce((t, r) => t + r.grossCents, 0), net = byAccount.reduce((t, r) => t + r.netCents, 0), count = byAccount.reduce((t, r) => t + r.paymentCount, 0);
  return { schemaVersion: "of-earnings.v1", window, asOf: AS_OF, accountCount: byAccount.length, coveredAccountCount: byAccount.length, status: "current", reasons: [], currency: "USD",
    clearedGrossCents: gross, clearedNetCents: net, clearedCount: count, pendingCount: 0, refundedCount: 0, recentLedgerAt: AS_OF, fullLedgerAt: AS_OF,
    recorded: { grossCents: gross, netCents: net, pendingGrossCents: 0, pendingNetCents: 0, paymentCount: count, lastSuccessfulSyncAt: AS_OF },
    statistics: { byKind: [{ kind: "message", paymentCount: count, grossCents: gross, netCents: net }], byAccount } };
};
/** Ledger not imported yet: OnlyFans' own 30-day total exists for 1 of the 3 accounts. */
const providerOnly = (window: EarningsWindow) => ({ schemaVersion: "of-earnings.v1", window, asOf: AS_OF, accountCount: 3, coveredAccountCount: 0, status: "unavailable",
  reasons: ["ledger_unavailable"], currency: "USD", clearedGrossCents: null, clearedNetCents: null, clearedCount: null, pendingCount: null, refundedCount: null,
  recentLedgerAt: null, fullLedgerAt: null,
  providerTotals: [{ accountId: "a1", period: "30d", grossCents: 5000, netCents: 4000, windowStart: window.start, windowEnd: window.end, fetchedAt: AS_OF }] });

async function revenue(accounts: OfAccount[] | string, body: (window: EarningsWindow) => unknown): Promise<RevenueData> {
  const backend = {
    listAccounts: async () => typeof accounts === "string" ? { ok: false, error: accounts } : { ok: true, data: accounts },
    getEarnings: async (window: EarningsWindow) => {
      const data = parseNativeEarnings(body(window), window);
      assert.ok(data, "the earnings fixture is accepted by the real parser");
      return { ok: true, data };
    },
  } as unknown as OnlyFansBackend;
  return loadOnlyFansRevenue(backend, "30d", NOW);
}

// ---- F14 ----
test("control: DeliveryPill labels unknown as Outcome unknown", () => {
  assert.equal(text(html(<DeliveryPill outcome="unknown" />)), "Outcome unknown");
});
test("F14: DeliveryPill for sent (provider accepted) does not say Delivered", () => {
  const label = text(html(<DeliveryPill outcome="sent" />));
  assert.doesNotMatch(label, /Delivered/, `"sent" means the provider accepted the request, not that it was delivered (inv 7: no false success); label "${label}"`);
});

// ---- F16 ----
test("control: with no ledger the loader fills OnlyFans-reported totals for 1 of 3 accounts", async () => {
  const data = await revenue([acct("a1", "c1", "Naomi", "naomi"), acct("a2", "c2", "Maile", "maile"), acct("a3", "c3", "Nicky", "nicky")], providerOnly);
  assert.equal(data.figures.providerSourced, true);
  assert.match(data.figures.sourceNote ?? "", /OnlyFans-reported.*1 of 3 accounts/);
  assert.equal(data.figures.netCents, 4000);
  assert.match(text(html(<RevenueView data={data} />)), /USD 40\.00/, "the view shows the provider net");
});
test("F16: OnlyFans-reported totals are not labelled recorded payments, and their source is shown", async () => {
  const data = await revenue([acct("a1", "c1", "Naomi", "naomi"), acct("a2", "c2", "Maile", "maile"), acct("a3", "c3", "Nicky", "nicky")], providerOnly);
  const page = text(html(<RevenueView data={data} />));
  assert.doesNotMatch(page, /Showing recorded payments/, "figures taken from OnlyFans' own totals (providerSourced) are not recorded payments");
  assert.ok(page.includes(data.figures.sourceNote!), `the page names where the totals come from and that they cover 1 of 3 accounts ("${data.figures.sourceNote}")`);
});

// ---- F17 ----
const totalRow = (box: HTMLElement) => box.querySelector("[data-of-revenue-total]");
test("control: an account with revenue but no creator record is reported as not listed", async () => {
  const box = html(<RevenueView data={await revenue([acct("a1", "c1", "Naomi", "naomi")], ledger)} />);
  assert.match(text(box), /1 account has revenue but no matching creator record, so it is not listed above/);
  assert.match(box.querySelector("[data-of-revenue-creator='c1']")?.textContent ?? "", /USD 30\.00/);
});
test("F17: the All creators total equals the rows listed above it", async () => {
  const box = html(<RevenueView data={await revenue([acct("a1", "c1", "Naomi", "naomi")], ledger)} />);
  const total = totalRow(box);
  assert.ok(total, "the total row is shown");
  const cents = (cell: string | null | undefined) => { const m = /^USD (\d[\d,]*)\.(\d\d)$/.exec(cell?.trim() ?? ""); assert.ok(m, `a USD gross cell: "${cell}"`); return Number(m[1].replaceAll(",", "")) * 100 + Number(m[2]); };
  const rows = [...total!.parentElement!.children].slice(0, [...total!.parentElement!.children].indexOf(total!));
  assert.ok(rows.length >= 1, "at least one row is listed above the total");
  const listed = rows.reduce((sum, row) => sum + cents(row.querySelectorAll("td")[2]?.textContent), 0);
  const cells = [...total!.querySelectorAll("td")].map(td => td.textContent);
  assert.equal(cents(cells[2]), listed, `the "All creators" gross is the sum of the Gross cells listed above it (${listed} cents), not a total that includes an account not listed; row: ${cells.join(" | ")}`);
});

// ---- F18 ----
test("control: an accounts read failure shows the error alert", async () => {
  const box = html(<RevenueView data={await revenue("Accounts could not be refreshed.", ledger)} />);
  assert.match(box.querySelector("[role=alert]")?.textContent ?? "", /Could not load creators\. Accounts could not be refreshed\./);
});
test("F18: an accounts read failure does not read as an empty agency", async () => {
  const page = text(html(<RevenueView data={await revenue("Accounts could not be refreshed.", ledger)} />));
  assert.doesNotMatch(page, /No creators connected yet/, "when the accounts read failed the page does not claim no creators are connected (an outage is not empty)");
});

// ---- F19 ----
const twoAccounts = [acct("a1", "c1", "Naomi", "naomi"), acct("a2", "c1", "Naomi", "naomi2")];
const both = (window: EarningsWindow) => ledger(window, [{ accountId: "a1", paymentCount: 1, grossCents: 1000, netCents: 800 }, { accountId: "a2", paymentCount: 2, grossCents: 4000, netCents: 3200 }]);
const detailHref = async () => {
  const box = html(<RevenueView data={await revenue(twoAccounts, both)} />);
  const link = [...box.querySelectorAll<HTMLAnchorElement>("[data-of-revenue-creator='c1'] a")].find(a => /Detail/.test(a.textContent ?? ""));
  assert.ok(link, "the creator row has a Detail link");
  return new URL(link.getAttribute("href")!, "https://fixture.invalid");
};
test("control: a creator with two accounts is one row, and an account id narrows the overview to one account", async () => {
  const data = await revenue(twoAccounts, both);
  assert.deepEqual(data.creators?.map(c => [c.creatorId, c.accountIds.length, c.grossCents]), [["c1", 2, 5000]]);
  assert.equal((resolveSelection(twoAccounts, null, "a1", "c1") as { accountIds: string[] }).accountIds.length, 1);
  assert.equal((resolveSelection(twoAccounts, null, null, "c1") as { accountIds: string[] }).accountIds.length, 2);
});
test("F19: Detail for a two-account creator opens the whole creator", async () => {
  const href = await detailHref();
  assert.equal(href.searchParams.get("account"), null, `the row sums both accounts, so its Detail link does not narrow to one of them (${href.pathname}${href.search})`);
});
test("F19: Detail keeps the reporting period", async () => {
  const href = await detailHref();
  assert.equal(href.searchParams.get("period"), "30d", `the Detail link carries the selected period (overview defaults to all time) (${href.pathname}${href.search})`);
});

// ---- F20 ----
const REFRESH_FAILED = "The conversation could not be refreshed. Reload the dashboard to read its current state."; // OnlyFansWorkspace.tsx:699
test("control: an unavailable state renders its message", () => {
  assert.match(text(html(<RequestStateBlock state={{ status: "unavailable", message: REFRESH_FAILED }} label="accounts" render={() => null} />)), /could not be refreshed/);
});
test("F20: an unavailable state from a failed refresh does not tell the operator to finish setup", () => {
  const block = text(html(<RequestStateBlock state={{ status: "unavailable", message: REFRESH_FAILED }} label="accounts" render={() => null} />));
  assert.doesNotMatch(block, /finish setup|No OnlyFans backend is connected/, `a failed refresh is not a missing setup; text: "${block}"`);
});
