import assert from "node:assert/strict";
import { parseNativeEarnings } from "../lib/onlyfans/earnings";
import { computeFigures, providerFigures, resolveSelection } from "../lib/onlyfans/overview";
import type { NativeEarnings } from "../lib/onlyfans/earnings";

const window = { start: "2026-10-03T00:00:00.000Z", end: "2026-11-01T01:00:00.000Z" };
const total = (accountId: string, period: string, gross: number, net: number, fetchedAt = "2026-11-01T00:50:00.000Z") =>
  ({ accountId, period, grossCents: gross, netCents: net, windowStart: window.start, windowEnd: window.end, fetchedAt });
// The payment history is still importing: no ledger figures, only the provider totals.
const syncing = (providerTotals: unknown, accountCount = 2) => ({ schemaVersion: "of-earnings.v1", window, asOf: window.end, accountCount, coveredAccountCount: 0,
  status: "unavailable", reasons: ["ledger_unavailable"], currency: "USD", clearedGrossCents: null, clearedNetCents: null, clearedCount: null, pendingCount: null,
  refundedCount: null, recentLedgerAt: null, fullLedgerAt: null, recorded: null, statistics: null,
  history: { accountCount, completedAccountCount: 0, accounts: Array.from({ length: accountCount }, (_, i) => ({ accountId: "of-" + (i + 1), status: "syncing", importedPayments: 5, lastSuccessfulSyncAt: null })) },
  ...(providerTotals === undefined ? {} : { providerTotals }) });
const all = [total("of-1", "30d", 341560, 273237), total("of-2", "30d", 10000, 8000), total("of-1", "7d", 48711, 38967), total("of-2", "7d", 5000, 4000)];

// Old backend (no field) still parses and shows Unavailable, exactly as before.
const legacy = parseNativeEarnings(syncing(undefined), window) as NativeEarnings;
assert(legacy);
assert.equal(computeFigures(legacy, null, { kind: "all", accountCount: 2 }, "30d").netCents, null);

const earnings = parseNativeEarnings(syncing(all), window) as NativeEarnings;
assert(earnings && earnings.providerTotals?.length === 4);
const fleet = computeFigures(earnings, null, { kind: "all", accountCount: 2 }, "30d");
assert.equal(fleet.netCents, 281237); assert.equal(fleet.grossCents, 351560);
assert.equal(fleet.providerSourced, true);
assert.match(fleet.sourceNote ?? "", /OnlyFans-reported, as of 1 Nov 2026, 00:50 UTC$/);
// Counts and the pending/cleared split are not provider data and must stay unavailable, never zero.
assert.equal(fleet.paymentCount, null); assert.equal(fleet.pendingNetCents, null); assert.equal(fleet.clearedNetCents, null);
assert.equal(computeFigures(earnings, null, { kind: "all", accountCount: 2 }, "7d").netCents, 42967);
// A period with nothing stored yet is Unavailable, not zero.
assert.equal(computeFigures(earnings, null, { kind: "all", accountCount: 2 }, "90d").netCents, null);
assert.equal(computeFigures(earnings, null, { kind: "all", accountCount: 2 }).netCents, null);
// Partial coverage is labelled, and one account's totals are never presented as the whole fleet silently.
const partial = parseNativeEarnings(syncing([total("of-1", "30d", 341560, 273237)]), window) as NativeEarnings;
const sub = computeFigures(partial, null, { kind: "all", accountCount: 2 }, "30d");
assert.equal(sub.netCents, 273237); assert.match(sub.sourceNote ?? "", /1 of 2 accounts/);
// The oldest refresh time is what is shown.
const aged = parseNativeEarnings(syncing([total("of-1", "30d", 100, 80, "2026-11-01T00:10:00.000Z"), total("of-2", "30d", 100, 80)]), window) as NativeEarnings;
assert.match(providerFigures(aged, "30d", null)!.note, /00:10 UTC/);
// A complete ledger always wins over provider totals.
const ledger = { ...syncing(all), status: "current", reasons: [], coveredAccountCount: 2, clearedGrossCents: 999, clearedNetCents: 888, clearedCount: 3, pendingCount: 0, refundedCount: 0,
  recentLedgerAt: window.end, fullLedgerAt: window.end, recorded: { grossCents: 999, netCents: 888, pendingGrossCents: 0, pendingNetCents: 0, paymentCount: 3, lastSuccessfulSyncAt: window.end } };
const exact = computeFigures(parseNativeEarnings(ledger, window), null, { kind: "all", accountCount: 2 }, "30d");
assert.equal(exact.netCents, 888); assert.equal(exact.providerSourced, false);
// Scoped to one creator: only that creator's accounts are summed.
const accounts = [{ accountId: "of-1", binding: { creatorId: "c1", creatorName: "A", handle: "a" } }] as never;
const scopedSelection = resolveSelection(accounts, null, null, "c1");
const scoped = computeFigures({ ...earnings, scope: { accountIds: ["of-1"] } } as NativeEarnings, null, scopedSelection, "30d");
assert.equal(scoped.netCents, 273237);
// Malformed provider data is refused: the whole earnings read fails closed rather than showing a wrong number.
for (const bad of [[{ ...all[0], netCents: 999999 }], [all[0], all[0]], [{ ...all[0], period: "1y" }], [{ ...all[0], grossCents: -1 }], [{ ...all[0], accountId: "../x" }], [{ ...all[0], extra: 1 }], "nope"]) {
  assert.equal(parseNativeEarnings(syncing(bad), window), null);
}
console.log("PASS provider totals: parse, fallback labelling, ledger precedence, scope, partial coverage, malformed refusal.");
