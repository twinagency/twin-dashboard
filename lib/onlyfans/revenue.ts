import type { OnlyFansBackend } from "./backend";
import { computeFigures, resolveSelection, type FigureRow, type OverviewFigures, type OverviewPeriod } from "./overview";
import type { NativeEarnings } from "./earnings";
import type { OfAccount } from "../onlyfans-preview/types";

/** One creator's revenue, summed over all of that creator's OnlyFans accounts. */
export type CreatorRevenueRow = {
  creatorId: string; name: string; handles: string[]; accountIds: string[];
  paymentCount: number; grossCents: number;
  /** null when any included payment has no recorded net: never shown as zero. */
  netCents: number | null;
  /** Share of fleet gross, 0..1. null when the fleet total is zero. */
  share: number | null;
};
export type RevenueData = {
  accounts: OfAccount[]; accountsError: string | null;
  earnings: NativeEarnings | null; earningsError: string | null;
  figures: OverviewFigures; creators: CreatorRevenueRow[] | null;
  /** Accounts that have earnings rows but no matching account record (should be empty). */
  unmatched: FigureRow[];
  period: OverviewPeriod; window: { start: string; end: string };
};

const DAY = 86400000;
export const REVENUE_PERIODS: OverviewPeriod[] = ["7d", "30d", "90d", "all"];

/** Pure: per-account rows from the earnings statistics, grouped by creator, highest gross first. Creators with no payments in the window still appear with zero payments. */
export function rollUpCreators(accounts: OfAccount[], byAccount: FigureRow[] | null): { creators: CreatorRevenueRow[] | null; unmatched: FigureRow[] } {
  if (!byAccount) return { creators: null, unmatched: [] };
  const known = new Set(accounts.map(a => a.accountId));
  const groups = new Map<string, CreatorRevenueRow>();
  for (const account of accounts) {
    const id = account.binding.creatorId;
    const g = groups.get(id) ?? { creatorId: id, name: account.binding.creatorName, handles: [], accountIds: [], paymentCount: 0, grossCents: 0, netCents: 0, share: null };
    g.handles.push(account.binding.handle); g.accountIds.push(account.accountId);
    const row = byAccount.find(r => r.id === account.accountId);
    if (row) {
      g.paymentCount += row.paymentCount; g.grossCents += row.grossCents;
      g.netCents = g.netCents === null || row.netCents === null ? null : g.netCents + row.netCents;
    }
    groups.set(id, g);
  }
  const creators = [...groups.values()];
  const total = creators.reduce((t, c) => t + c.grossCents, 0);
  for (const c of creators) c.share = total > 0 ? c.grossCents / total : null;
  creators.sort((a, b) => b.grossCents - a.grossCents || a.name.localeCompare(b.name));
  return { creators, unmatched: byAccount.filter(r => !known.has(r.id)) };
}

/** Lean agency-wide read: accounts and one earnings call. No sales page, no per-creator selection. */
export async function loadOnlyFansRevenue(backend: OnlyFansBackend | null, period: OverviewPeriod, now = new Date()): Promise<RevenueData> {
  const window = { start: period === "all" ? new Date(0).toISOString() : new Date(now.getTime() - (period === "90d" ? 90 : period === "30d" ? 30 : 7) * DAY).toISOString(), end: now.toISOString() };
  const base = { accounts: [] as OfAccount[], accountsError: null as string | null, earnings: null as NativeEarnings | null, earningsError: null as string | null, period, window };
  const selection = { kind: "all" as const, accountCount: 0 };
  if (!backend) return { ...base, accountsError: "The OnlyFans account service is unavailable.", earningsError: "Earnings are not configured.",
    figures: computeFigures(null, "Earnings are not configured.", selection), creators: null, unmatched: [] };
  try { const read = await backend.listAccounts({ creatorId: null }); if (read.ok) base.accounts = read.data; else base.accountsError = read.error; }
  catch { base.accountsError = "Accounts could not be refreshed."; }
  try { const read = await backend.getEarnings?.(window);
    if (read?.ok) base.earnings = read.data; else base.earningsError = read && !read.ok ? read.error : "Earnings are not configured for this workspace.";
  } catch { base.earningsError = "Earnings could not be refreshed."; }
  const figures = computeFigures(base.earnings, base.earningsError, resolveSelection(base.accounts, base.accountsError, null, null));
  const { creators, unmatched } = rollUpCreators(base.accounts, figures.byAccount);
  return { ...base, figures, creators, unmatched };
}
