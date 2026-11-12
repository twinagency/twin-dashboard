// KNOWN RED (W3 lib-onlyfans-3, findings L9-24..L9-31; docs/review/W3/lib-onlyfans-3.md). Money figures and attachment projection.
// L9-24 lib/onlyfans/manual-media.ts:19 — manualPriceCents("0") is 0. On the paid path (InboxView.tsx:422 mediaPaid ? price : 0) a
//       typed "0" becomes a free unlock that validManualMedia accepts and a sent card cannot be repriced (inv 7 Money, manual 300..20000).
// L9-25 lib/onlyfans/overview.ts:65-75,90-99 — a provider total for 1 of 3 accounts is shown as the agency figure with subtotal:false.
// L9-26 lib/onlyfans/revenue.ts:57,63 — listAccounts fails, earnings succeed: creators [] reads "No creators connected yet."
// L9-27 revenue.ts:62 + overview.ts:87-88 — earnings rows for accounts the viewer was not given still sum into the headline gross.
// L9-28 revenue.ts:33-40 — a held/syncing account with no byAccount row is rolled up as $0, not unavailable (figures.history ignored).
// L9-29 revenue.ts:54-56 — no backend gives figures.mode "all" where loadOnlyFansOverview(null) gives "unavailable".
// L9-30 overview.ts:139-140 — a selected creator whose earnings were not scope-echoed keeps the agency-wide earnings object
//       (agency lastSuccessfulSyncAt shown as the creator's), contradicting the comment "Agency-wide data is never kept under a creator label".
// L9-31 lib/onlyfans/message-attachments.ts:3-17 — the parser returns the raw object, so an extra media key (a signed CDN url) reaches
//       the browser although manual-media.ts:1 promises "no source URLs" (inv 6).
// Team's Claude owns the fix. Not wired into npm scripts. Run: node --import tsx --test <this file>.
// Offline: a fake OnlyFansBackend object (the loaders' injected seam), earnings built to pass parseNativeEarnings.
import assert from "node:assert/strict";
import test from "node:test";
import { manualPriceCents } from "../../lib/onlyfans/manual-media";
import { computeFigures, loadOnlyFansOverview } from "../../lib/onlyfans/overview";
import { loadOnlyFansRevenue } from "../../lib/onlyfans/revenue";
import { parseNativeEarnings, type EarningsWindow, type NativeEarnings } from "../../lib/onlyfans/earnings";
import { parseMessageAttachments } from "../../lib/onlyfans/message-attachments";
import { accounts as fixtureAccounts } from "../../lib/onlyfans-preview/fixtures";
import type { OnlyFansBackend } from "../../lib/onlyfans/backend";
import type { OfAccount } from "../../lib/onlyfans-preview/types";

const NOW = new Date("2026-11-01T00:00:00Z"), stamp = "2026-10-31T12:00:00Z";
const account = (accountId: string, creatorId: string): OfAccount =>
  ({ ...fixtureAccounts[0], accountId, binding: { ...fixtureAccounts[0].binding, creatorId, creatorName: `Creator ${creatorId}`, handle: `h-${accountId}` } });
type Row = { accountId: string; paymentCount: number; grossCents: number; netCents: number | null };
type HistoryStatus = "complete" | "syncing" | "held" | "unavailable";

/** Recorded earnings whose statistics sum to the recorded totals (parseNativeEarnings rules). */
function recordedEarnings(window: EarningsWindow, rows: Row[], options: { accountCount?: number; history?: [string, HistoryStatus][]; held?: boolean } = {}): NativeEarnings {
  const gross = rows.reduce((t, r) => t + r.grossCents, 0), payments = rows.reduce((t, r) => t + r.paymentCount, 0);
  const net = rows.reduce<number | null>((t, r) => t === null || r.netCents === null ? null : t + r.netCents, 0);
  const accountCount = options.accountCount ?? rows.length;
  const history = options.history && { accountCount, completedAccountCount: options.history.filter(([, s]) => s === "complete").length,
    accounts: options.history.map(([accountId, status]) => ({ accountId, status, importedPayments: 0, lastSuccessfulSyncAt: status === "complete" ? stamp : null })) };
  return { schemaVersion: "of-earnings.v1", window, asOf: stamp, accountCount, coveredAccountCount: options.held ? 0 : accountCount,
    status: options.held ? "unavailable" : "current", reasons: options.held ? ["ledger_held"] : [], currency: "USD",
    clearedGrossCents: options.held ? null : gross, clearedNetCents: options.held ? null : net, clearedCount: options.held ? null : payments,
    pendingCount: options.held ? null : 0, refundedCount: options.held ? null : 0, recentLedgerAt: stamp, fullLedgerAt: stamp,
    recorded: { grossCents: gross, netCents: net, pendingGrossCents: 0, pendingNetCents: 0, paymentCount: payments, lastSuccessfulSyncAt: stamp },
    ...(history ? { history } : {}),
    statistics: { byKind: rows.length ? [{ kind: "message", paymentCount: payments, grossCents: gross, netCents: net }] : [], byAccount: rows } } as NativeEarnings;
}

function fakeBackend(accounts: OfAccount[] | null, earnings: (window: EarningsWindow, scope?: { accountIds?: readonly string[] }) => NativeEarnings) {
  const seen: { window: EarningsWindow; scope?: { accountIds?: readonly string[] } }[] = [];
  const backend: OnlyFansBackend = {
    label: "fake",
    listAccounts: async () => accounts ? { ok: true, data: accounts } : { ok: false, status: 503, code: "backend_unavailable", error: "Accounts are unavailable." },
    listConversations: async () => ({ ok: true, data: { items: [], nextCursor: null } }),
    getConversation: async () => ({ ok: false, status: 404, code: "backend_404", error: "That record is not available." }),
    getEarnings: async (window, scope) => {
      seen.push({ window, scope });
      const data = earnings(window, scope);
      assert.ok(parseNativeEarnings(data, window, scope?.accountIds ?? null), "fixture: the fake earnings pass the real earnings parser");
      return { ok: true, data };
    },
  };
  return { backend, seen };
}
const row = (accountId: string, grossCents: number, paymentCount = 1): Row => ({ accountId, paymentCount, grossCents, netCents: Math.round(grossCents * 0.8) });

// ---------- L9-24 manual price ----------
test("control: L9-24 manual prices in range parse, below range is refused", () => {
  assert.equal(manualPriceCents("3.00"), 300);
  assert.equal(manualPriceCents("200.00"), 20000);
  assert.equal(manualPriceCents("2.99"), null);
});
for (const typed of ["0", "0.00"]) test(`L9-24: manualPriceCents(${JSON.stringify(typed)}) is not a price`, () => {
  const cents = manualPriceCents(typed);
  assert.equal(cents, null, `money: a typed manual price must be within 300..20000 cents, 0 is a free unlock, not a price; actual ${cents}`);
});

// ---------- L9-25 partial provider sum ----------
const providerWindow = { start: "2026-10-02T00:00:00Z", end: "2026-11-01T00:00:00Z" };
const providerEarnings = (accountIds: string[]): NativeEarnings => ({ schemaVersion: "of-earnings.v1", window: providerWindow, asOf: stamp, accountCount: 3,
  coveredAccountCount: 0, status: "unavailable", reasons: ["ledger_unavailable"], currency: "USD", clearedGrossCents: null, clearedNetCents: null,
  clearedCount: null, pendingCount: null, refundedCount: null, recentLedgerAt: null, fullLedgerAt: null,
  providerTotals: accountIds.map(accountId => ({ accountId, period: "30d" as const, grossCents: 1200, netCents: 1000,
    windowStart: providerWindow.start, windowEnd: providerWindow.end, fetchedAt: stamp })) });
test("control: L9-25 provider totals for every account give the agency total, not a subtotal", () => {
  const earnings = providerEarnings(["a1", "a2", "a3"]);
  assert.ok(parseNativeEarnings(earnings, providerWindow));
  const figures = computeFigures(earnings, null, { kind: "all", accountCount: 3 }, "30d");
  assert.deepEqual({ net: figures.netCents, subtotal: figures.subtotal, provider: figures.providerSourced }, { net: 3000, subtotal: false, provider: true });
});
test("L9-25: a provider total for 1 of 3 accounts is not shown as the agency total", () => {
  const earnings = providerEarnings(["a1"]);
  assert.ok(parseNativeEarnings(earnings, providerWindow), "fixture: valid earnings");
  const figures = computeFigures(earnings, null, { kind: "all", accountCount: 3 }, "30d");
  assert.ok(figures.subtotal === true || figures.netCents === null,
    `a sum over 1 of 3 accounts is a subtotal (or unavailable), never the agency figure; actual netCents ${figures.netCents} subtotal ${figures.subtotal} note ${JSON.stringify(figures.sourceNote)}`);
});

// ---------- L9-26..29 revenue ----------
test("control: L9-26/27 revenue rolls up a creator whose account and earnings both load", async () => {
  const { backend } = fakeBackend([account("a1", "c1")], window => recordedEarnings(window, [row("a1", 1000)]));
  const data = await loadOnlyFansRevenue(backend, "30d", NOW);
  assert.deepEqual({ gross: data.figures.grossCents, creators: data.creators?.map(c => [c.creatorId, c.grossCents]) }, { gross: 1000, creators: [["c1", 1000]] });
});
test("L9-26: accounts failing while earnings load gives no creator table, not an empty one", async () => {
  const { backend } = fakeBackend(null, window => recordedEarnings(window, [row("a1", 1000)]));
  const data = await loadOnlyFansRevenue(backend, "30d", NOW);
  assert.ok(data.accountsError, "fixture: the account read failed");
  assert.equal(data.creators, null, `an unread account list must leave creators unavailable (null), not "No creators connected yet."; actual creators ${JSON.stringify(data.creators)}`);
});
test("L9-27: earnings for an account the viewer was not given do not enter the headline gross", async () => {
  const { backend } = fakeBackend([account("a1", "c1")], window => recordedEarnings(window, [row("a1", 1000), row("zz", 5000)]));
  const data = await loadOnlyFansRevenue(backend, "30d", NOW);
  assert.ok(data.figures.grossCents === null || data.figures.grossCents === 1000,
    `isolation: the headline may only sum listed accounts (a1 = 1000) or be unavailable; actual gross ${data.figures.grossCents} (unmatched ${JSON.stringify(data.unmatched.map(r => r.id))})`);
});
test("control: L9-28 a complete account with no payments in the window rolls up as zero", async () => {
  const { backend } = fakeBackend([account("a1", "c1")], window => recordedEarnings(window, [], { accountCount: 1, history: [["a1", "complete"]] }));
  const data = await loadOnlyFansRevenue(backend, "30d", NOW);
  assert.equal(data.creators?.[0]?.grossCents, 0);
});
// held: the whole ledger is held too; syncing: the earnings read is current and only the history row says syncing.
for (const status of ["held", "syncing"] as const) test(`L9-28: a ${status} account with no payment row is not rolled up as $0`, async () => {
  const { backend } = fakeBackend([account("a1", "c1")], window => recordedEarnings(window, [], { accountCount: 1, history: [["a1", status]], held: status === "held" }));
  const data = await loadOnlyFansRevenue(backend, "30d", NOW);
  const gross = data.creators === null ? null : data.creators[0]?.grossCents;
  assert.notEqual(gross, 0, `a creator whose payment import is ${status} has unknown revenue, never $0; actual creator gross ${gross} (history ${JSON.stringify(data.figures.history?.accounts)})`);
});
test("control: L9-29 no backend leaves every revenue figure unavailable and the overview mode unavailable", async () => {
  const data = await loadOnlyFansRevenue(null, "30d", NOW);
  assert.deepEqual({ net: data.figures.netCents, gross: data.figures.grossCents, creators: data.creators }, { net: null, gross: null, creators: null });
  assert.equal((await loadOnlyFansOverview(null, "30d", null, NOW)).figures.mode, "unavailable");
});
test("L9-29: no backend gives revenue figures mode unavailable, matching the overview", async () => {
  const mode = (await loadOnlyFansRevenue(null, "30d", NOW)).figures.mode;
  assert.equal(mode, "unavailable", `with no backend nothing may be labelled agency-wide; overview says "unavailable"; actual revenue mode ${JSON.stringify(mode)}`);
});

// ---------- L9-30 overview creator without scope echo ----------
const twoCreators = () => fakeBackend([account("a1", "c1"), account("a2", "c2")],
  window => recordedEarnings(window, [row("a1", 1000), row("a2", 5000)], { history: [["a1", "complete"], ["a2", "complete"]] }));
test("control: L9-30 a creator selection without a scope echo is summed per account", async () => {
  const { backend, seen } = twoCreators();
  const data = await loadOnlyFansOverview(backend, "30d", null, NOW, "c1");
  assert.deepEqual(seen.map(s => s.scope?.accountIds), [["a1"]], "fixture: the filter was asked for");
  assert.deepEqual({ mode: data.figures.mode, gross: data.figures.grossCents }, { mode: "per-account", gross: 1000 });
});
test("L9-30: a creator selection without a scope echo does not keep the agency-wide earnings", async () => {
  const { backend } = twoCreators();
  const data = await loadOnlyFansOverview(backend, "30d", null, NOW, "c1");
  const kept = data.earnings;
  assert.ok(kept === null || (kept.accountCount === 1 && !JSON.stringify(kept).includes("\"a2\"")),
    `agency-wide data is never kept under a creator label; actual earnings accountCount ${kept?.accountCount} recorded gross ${kept?.recorded?.grossCents} byAccount ${JSON.stringify(kept?.statistics?.byAccount.map(r => r.accountId))}`);
});

// ---------- L9-31 attachments ----------
const attachments = { count: 1, media: [{ mediaId: "1", kind: "photo" }], price: { currency: "USD", minorUnits: 0 }, purchaseStatus: "not_applicable" };
test("control: L9-31 plain attachments parse", () => {
  assert.ok(parseMessageAttachments(attachments));
  assert.ok(parseMessageAttachments({ ...attachments, media: [{ mediaId: "1", kind: "photo", source: "message" }] }));
});
test("L9-31: an extra media url is not carried to the browser", () => {
  const parsed = parseMessageAttachments({ ...attachments, media: [{ mediaId: "1", kind: "photo", url: "https://cdn.invalid/x?sig=synthetic" }] });
  const sent = JSON.stringify(parsed);
  assert.ok(parsed === null || !sent.includes("cdn.invalid"), `inv 6: attachments are projected by allowlist, no source URLs; actual ${sent}`);
});
