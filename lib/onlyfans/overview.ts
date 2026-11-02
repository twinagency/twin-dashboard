import type { OnlyFansBackend } from "./backend";
import { EARNINGS_REASONS, type EarningsHistory, type NativeEarnings, type ProviderTotal } from "./earnings";
import type { OfAccount } from "../onlyfans-preview/types";
import type { SalesRead } from "./workspace";

export type OverviewPeriod = "7d" | "30d" | "90d" | "all";

/** What the page describes. Resolved only against the accounts the server returned, never against the URL alone. */
export type OverviewSelection =
  | { kind: "all"; accountCount: number }
  | { kind: "creator"; creatorId: string; name: string; handles: string[]; accountIds: string[]; requested: { creatorId: string | null; accountId: string | null } }
  | { kind: "invalid"; reason: string };

export const SCOPE_UNAVAILABLE = "Unavailable for this creator yet";
export const SPLIT_UNAVAILABLE = "Unavailable for a single creator";

export type FigureRow = { id: string; paymentCount: number; grossCents: number; netCents: number | null };
/** Every headline number the Today page shows. null means unavailable, never zero. */
export type OverviewFigures = {
  /** all: whole agency. scoped: the backend applied and echoed the filter. per-account: summed from byAccount rows. unavailable: nothing may be shown. */
  mode: "all" | "scoped" | "per-account" | "unavailable";
  netCents: number | null; grossCents: number | null; paymentCount: number | null;
  pendingNetCents: number | null; pendingGrossCents: number | null;
  clearedNetCents: number | null; clearedCount: number | null; refundedCount: number | null;
  /** Shown instead of a value where a split cannot be derived for the selection. */
  splitNote: string | null;
  /** Where the net/gross came from, for the label under the figures. */
  sourceNote: string | null;
  /** True when net/gross are OnlyFans' own period totals because the payment history is not fully imported. Counts and the pending/cleared split stay unavailable. */
  providerSourced: boolean;
  byAccount: FigureRow[] | null; byKind: FigureRow[] | null;
  history: EarningsHistory | null;
  includedCount: number; completeCount: number | null;
  /** True when only some included accounts have a complete import: the figure is a verified subtotal. */
  subtotal: boolean;
  reason: string | null;
};
export type OverviewData = {
  accounts: OfAccount[]; accountsError: string | null;
  earnings: NativeEarnings | null; earningsError: string | null;
  selection: OverviewSelection; figures: OverviewFigures;
  activityAccount: OfAccount | null; sales: SalesRead | null; salesError: string | null;
  period: OverviewPeriod; window: { start: string; end: string };
};

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));

export function resolveSelection(accounts: OfAccount[], accountsError: string | null, accountId: string | null, creatorId: string | null): OverviewSelection {
  if (!accountId && !creatorId) return { kind: "all", accountCount: accounts.length };
  if (accountsError) return { kind: "invalid", reason: "The selection could not be checked because accounts could not be loaded." };
  const matches = accountId ? accounts.filter(a => a.accountId === accountId && (!creatorId || a.binding.creatorId === creatorId)) : accounts.filter(a => a.binding.creatorId === creatorId);
  if (!matches.length) return { kind: "invalid", reason: accountId ? "That account is not available to this session." : "That creator is not available to this session." };
  return { kind: "creator", creatorId: matches[0].binding.creatorId, name: matches[0].binding.creatorName, handles: matches.map(a => a.binding.handle),
    accountIds: matches.map(a => a.accountId), requested: { creatorId, accountId } };
}

const unavailableFigures = (reason: string, included = 0): OverviewFigures => ({ mode: "unavailable", netCents: null, grossCents: null, paymentCount: null,
  pendingNetCents: null, pendingGrossCents: null, clearedNetCents: null, clearedCount: null, refundedCount: null, splitNote: null, sourceNote: null, providerSourced: false,
  byAccount: null, byKind: null, history: null, includedCount: included, completeCount: null, subtotal: false, reason });

const rows = (list: ({ paymentCount: number; grossCents: number; netCents: number | null } & Record<string, unknown>)[], key: string): FigureRow[] =>
  list.map(r => ({ id: String(r[key]), paymentCount: r.paymentCount, grossCents: r.grossCents, netCents: r.netCents }));

/** Net/gross from OnlyFans' own period totals for the accounts in view, or null when none are stored yet. Pure. */
export function providerFigures(earnings: NativeEarnings | null, period: OverviewPeriod | undefined, accountIds: readonly string[] | null):
  { netCents: number; grossCents: number; note: string } | null {
  if (!earnings || !period || !earnings.providerTotals?.length) return null;
  const mine = earnings.providerTotals.filter(t => t.period === period && (!accountIds || accountIds.includes(t.accountId)));
  const wanted = accountIds ? accountIds.length : earnings.accountCount;
  if (!mine.length || mine.length > wanted) return null;
  const oldest = mine.reduce((a: ProviderTotal, b: ProviderTotal) => Date.parse(b.fetchedAt) < Date.parse(a.fetchedAt) ? b : a);
  const partial = mine.length < wanted ? ` · ${mine.length} of ${wanted} accounts` : "";
  return { netCents: mine.reduce((t, r) => t + r.netCents, 0), grossCents: mine.reduce((t, r) => t + r.grossCents, 0),
    note: `OnlyFans-reported, as of ${recordedTime(oldest.fetchedAt)} UTC${partial}` };
}

/** Pure: the same code serves the page and the checks. */
export function computeFigures(earnings: NativeEarnings | null, error: string | null, selection: OverviewSelection, period?: OverviewPeriod): OverviewFigures {
  if (selection.kind === "invalid") return unavailableFigures(selection.reason);
  const current = earnings?.status === "current" ? earnings : null;
  const recorded = earnings?.recorded;
  const reasonText = earnings?.reasons.map(r => EARNINGS_REASONS[r]).join(" ") || error;
  const stats = earnings?.statistics;
  if (selection.kind === "all" || (earnings && earnings.scope)) {
    const ids = selection.kind === "creator" ? selection.accountIds : null;
    const history = earnings?.history ?? null;
    const ledgerNet = recorded ? recorded.netCents : current?.clearedNetCents ?? null;
    const ledgerGross = recorded ? recorded.grossCents : current?.clearedGrossCents ?? null;
    // The payment ledger is exact, so it wins whenever it is complete. Until then, show OnlyFans' own totals instead of "Unavailable".
    const provider = ledgerNet === null && ledgerGross === null ? providerFigures(earnings, period, ids) : null;
    return { mode: ids ? "scoped" : "all",
      netCents: provider ? provider.netCents : ledgerNet, grossCents: provider ? provider.grossCents : ledgerGross,
      paymentCount: recorded ? recorded.paymentCount : current?.clearedCount ?? null,
      pendingNetCents: recorded?.pendingNetCents ?? null, pendingGrossCents: recorded?.pendingGrossCents ?? null,
      clearedNetCents: current?.clearedNetCents ?? null, clearedCount: current?.clearedCount ?? null, refundedCount: current?.refundedCount ?? null,
      splitNote: null, sourceNote: provider ? provider.note : null, providerSourced: !!provider,
      byAccount: stats ? rows(stats.byAccount, "accountId") : null, byKind: stats ? rows(stats.byKind, "kind") : null,
      history, includedCount: history?.accountCount ?? earnings?.accountCount ?? (ids?.length ?? 0), completeCount: history?.completedAccountCount ?? null,
      subtotal: false, reason: reasonText || null };
  }
  // A creator is selected but the backend did not echo the filter: its answer is agency-wide and may not be labelled with a creator.
  const ids = selection.accountIds;
  if (!earnings || !earnings.recorded || !stats || !earnings.history) return unavailableFigures(error ?? SCOPE_UNAVAILABLE, ids.length);
  const entries = ids.map(id => earnings.history!.accounts.find(a => a.accountId === id) ?? { accountId: id, status: "unavailable" as const, importedPayments: 0, lastSuccessfulSyncAt: null });
  const complete = entries.filter(e => e.status === "complete").map(e => e.accountId);
  if (!complete.length) return { ...unavailableFigures("No payment import is complete for this selection yet.", ids.length), completeCount: 0,
    history: { accountCount: ids.length, completedAccountCount: 0, accounts: entries } };
  const mine = stats.byAccount.filter(r => complete.includes(r.accountId));
  const net = mine.some(r => r.netCents === null) ? null : mine.reduce((t, r) => t + (r.netCents as number), 0);
  return { mode: "per-account", netCents: net, grossCents: mine.reduce((t, r) => t + r.grossCents, 0), paymentCount: mine.reduce((t, r) => t + r.paymentCount, 0),
    pendingNetCents: null, pendingGrossCents: null, clearedNetCents: null, clearedCount: null, refundedCount: null,
    splitNote: SPLIT_UNAVAILABLE, sourceNote: "from per-account totals", providerSourced: false,
    byAccount: rows(stats.byAccount.filter(r => ids.includes(r.accountId)), "accountId"), byKind: null,
    history: { accountCount: ids.length, completedAccountCount: complete.length, accounts: entries },
    includedCount: ids.length, completeCount: complete.length, subtotal: complete.length < ids.length,
    reason: reasonText || null };
}

/** Bounded read composition. With no selection totals cover every authorized account; with one, every earnings figure describes it. Activity is one named account and sits outside the period. */
export async function loadOnlyFansOverview(backend: OnlyFansBackend | null, period: OverviewPeriod,
  accountId: string | null, now = new Date(), creatorId: string | null = null): Promise<OverviewData> {
  const window = { start: period === "all" ? new Date(0).toISOString() : new Date(now.getTime() - (period === "90d" ? 90 : period === "30d" ? 30 : 7) * 86400000).toISOString(), end: now.toISOString() };
  const data: OverviewData = { accounts: [], accountsError: null, earnings: null, earningsError: null,
    selection: { kind: "all", accountCount: 0 }, figures: unavailableFigures("Earnings are not configured."),
    activityAccount: null, sales: null, salesError: null, period, window };
  if (!backend) return { ...data, accountsError: "The OnlyFans account service is unavailable.", earningsError: "Earnings are not configured.", salesError: "Sales are unavailable.",
    selection: accountId || creatorId ? { kind: "invalid", reason: "The OnlyFans account service is unavailable." } : data.selection };
  try { const read = await backend.listAccounts({ creatorId: null });
    if (read.ok) data.accounts = read.data; else data.accountsError = read.error;
  } catch { data.accountsError = "Accounts could not be refreshed."; }
  data.selection = resolveSelection(data.accounts, data.accountsError, accountId, creatorId);
  const scopeIds = data.selection.kind === "creator" ? data.selection.accountIds : null;
  if (data.selection.kind !== "invalid") {
    try { const read = scopeIds ? await backend.getEarnings?.(window, { accountIds: scopeIds }) : await backend.getEarnings?.(window);
      if (read?.ok) data.earnings = read.data; else data.earningsError = read && !read.ok ? read.error : "Earnings are not configured for this workspace.";
    } catch { data.earningsError = "Earnings could not be refreshed."; }
  } else data.earningsError = data.selection.reason;
  data.figures = computeFigures(data.earnings, data.earningsError, data.selection, period);
  // Agency-wide data is never kept under a creator label.
  if (data.selection.kind !== "all" && data.figures.mode !== "scoped") data.earnings = data.figures.mode === "per-account" ? data.earnings : null;
  if (data.selection.kind === "invalid") { data.salesError = data.selection.reason; return data; }
  const selection = data.selection;
  data.activityAccount = (selection.kind === "creator" ? data.accounts.find(a => a.accountId === selection.accountIds[0]) : data.accounts[0]) ?? null;
  if (!data.activityAccount) { data.salesError = "Connect an account to see its recent sales."; return data; }
  try { const read = await backend.getWorkspace?.(data.activityAccount.accountId, "sales", null);
    if (read?.ok && read.data.section === "sales" && read.data.accountId === data.activityAccount.accountId) data.sales = read.data;
    else data.salesError = read && !read.ok ? read.error : "Recent sales are unavailable.";
  } catch { data.salesError = "Recent sales could not be refreshed."; }
  return data;
}

export const PAYMENT_LABELS: Record<string, string> = { cleared: "Cleared", pending: "Pending", refunded: "Refunded", chargedback: "Charged back", refund_pending: "Refund pending", failed: "Failed" };
export const paymentLabel = (status: string) => Object.hasOwn(PAYMENT_LABELS, status) ? PAYMENT_LABELS[status] : status;
export function recordedTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date) : value;
}
