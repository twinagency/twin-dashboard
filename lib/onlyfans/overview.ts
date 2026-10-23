import type { OnlyFansBackend } from "./backend";
import type { NativeEarnings } from "./earnings";
import type { OfAccount } from "../onlyfans-preview/types";
import type { SalesRead } from "./workspace";

export type OverviewPeriod = "7d" | "30d";
export type OverviewData = {
  accounts: OfAccount[]; accountsError: string | null;
  earnings: NativeEarnings | null; earningsError: string | null;
  activityAccount: OfAccount | null; sales: SalesRead | null; salesError: string | null;
  period: OverviewPeriod; window: { start: string; end: string };
};

/** Bounded read composition. Totals remain workspace-wide; activity is one named account. */
export async function loadOnlyFansOverview(backend: OnlyFansBackend | null, period: OverviewPeriod,
  accountId: string | null, now = new Date()): Promise<OverviewData> {
  const window = { start: new Date(now.getTime() - (period === "30d" ? 30 : 7) * 86400000).toISOString(), end: now.toISOString() };
  const data: OverviewData = { accounts: [], accountsError: null, earnings: null, earningsError: null,
    activityAccount: null, sales: null, salesError: null, period, window };
  if (!backend) return { ...data, accountsError: "The OnlyFans account service is unavailable.", earningsError: "Earnings are not configured.", salesError: "Sales are unavailable." };
  await Promise.all([
    (async () => { try { const read = await backend.listAccounts({ creatorId: null });
      if (read.ok) data.accounts = read.data; else data.accountsError = read.error;
    } catch { data.accountsError = "Accounts could not be refreshed."; } })(),
    (async () => { try { const read = await backend.getEarnings?.(window);
      if (read?.ok) data.earnings = read.data; else data.earningsError = read && !read.ok ? read.error : "Earnings are not configured for this workspace.";
    } catch { data.earningsError = "Earnings could not be refreshed."; } })(),
  ]);
  data.activityAccount = (accountId ? data.accounts.find(account => account.accountId === accountId) : data.accounts[0]) ?? null;
  if (!data.activityAccount) { data.salesError = accountId ? "That account is not available to this session." : "Connect an account to see its recent sales."; return data; }
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
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date) : value;
}
