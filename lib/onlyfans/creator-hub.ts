import type { OnlyFansBackend } from "./backend";
import { EARNINGS_REASONS, type NativeEarnings } from "./earnings";
import type { OverviewPeriod } from "./overview";
import type { OfAccount } from "../onlyfans-preview/types";
import { accountBlocker, senderBlocker } from "./ai-visibility";

export const HUB_PERIOD_LABEL: Record<OverviewPeriod, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" };
export const hubPeriod = (value: unknown): OverviewPeriod => typeof value === "string" && Object.hasOwn(HUB_PERIOD_LABEL, value) ? value as OverviewPeriod : "30d";

/** One workspace-wide earnings read. The per-creator figure is derived from it, never fetched separately. */
export async function loadHubEarnings(backend: OnlyFansBackend | null, period: OverviewPeriod, now = new Date()): Promise<{ earnings: NativeEarnings | null; error: string | null }> {
  const window = { start: period === "all" ? new Date(0).toISOString() : new Date(now.getTime() - (period === "90d" ? 90 : period === "30d" ? 30 : 7) * 86400000).toISOString(), end: now.toISOString() };
  try {
    const read = await backend?.getEarnings?.(window);
    if (read?.ok) return { earnings: read.data, error: null };
    return { earnings: null, error: read && !read.ok ? read.error : "Earnings are not configured for this workspace." };
  } catch { return { earnings: null, error: "Earnings could not be refreshed." }; }
}

export type HubEarnings = { state: "value"; netCents: number; grossCents: number; paymentCount: number } | { state: "unavailable"; reason: string };

/** Sums only this creator's accounts, and only when every one of them has a complete payment import. */
export function creatorEarnings(earnings: NativeEarnings | null, error: string | null, accountIds: string[]): HubEarnings {
  const no = (reason: string): HubEarnings => ({ state: "unavailable", reason });
  if (!earnings) return no(error ?? "Earnings are not available.");
  if (earnings.status !== "current") return no(earnings.reasons.map(reason => EARNINGS_REASONS[reason]).join(" ") || "Earnings are not available.");
  if (!earnings.statistics || !earnings.history) return no("Earnings per account are not reported for this period.");
  for (const id of accountIds) {
    const entry = earnings.history.accounts.find(item => item.accountId === id);
    if (entry?.status !== "complete") return no(entry ? "Payment history for this creator is still importing or needs review." : "Payment history for this creator is not reported.");
  }
  const rows = earnings.statistics.byAccount.filter(row => accountIds.includes(row.accountId));
  if (rows.some(row => row.netCents === null)) return no("Net earnings are not reported for this creator.");
  return { state: "value", netCents: rows.reduce((sum, row) => sum + (row.netCents as number), 0), grossCents: rows.reduce((sum, row) => sum + row.grossCents, 0), paymentCount: rows.reduce((sum, row) => sum + row.paymentCount, 0) };
}

export type HubArea = { state: string; checkedAt: string | null };
const AREA_KEYS = { messages: /messag|conversation|history|chat/i, media: /media|vault|content/i } as const;

/** Reads one sync area the backend reported, or null so the caller says "Not reported". The key names are the backend's own. */
export function syncArea(account: OfAccount, area: keyof typeof AREA_KEYS): HubArea | null {
  const key = Object.keys(account.syncHealth ?? {}).find(name => AREA_KEYS[area].test(name));
  const entry = key ? account.syncHealth?.[key] : undefined;
  if (!entry) return null;
  const checkedAt = entry.lastSuccessAt ?? entry.observedAt ?? null;
  const parts = [entry.state ? entry.state.replace(/_/g, " ") : checkedAt ? "Last sync succeeded" : "No successful sync recorded"];
  if (entry.pendingConversations) parts.push(`${entry.pendingConversations} conversations pending`);
  else if (entry.pending) parts.push(`${entry.pending} pending`);
  if (entry.quarantined) parts.push(`${entry.quarantined} need review`);
  if (entry.reason) parts.push(entry.reason);
  return { state: parts.join(", ").replace(/^./, c => c.toUpperCase()), checkedAt };
}

const PAYMENT_STATE = { complete: "Imported", syncing: "Import in progress", held: "Needs review", unavailable: "Unavailable" } as const;
export function paymentArea(earnings: NativeEarnings | null, accountId: string): HubArea | null {
  const entry = earnings?.history?.accounts.find(item => item.accountId === accountId);
  return entry ? { state: `${PAYMENT_STATE[entry.status]}, ${entry.importedPayments.toLocaleString("en-US")} payments`, checkedAt: entry.lastSuccessfulSyncAt } : null;
}

const AI_BLOCKED = { runtime: "Status unavailable", paused: "Off", connection: "On, connection unavailable, replies are not going out",
  sender_disabled: "On, outgoing replies off", sender: "On, sender not running, replies are not going out",
  sender_status: "On, sender status unknown, replies are not confirmed" } as const;

/** Whether AI replies are running, stated from the runtime the backend reported and nothing else. */
export function aiArea(account: OfAccount): HubArea | null {
  const runtime = account.runtime;
  if (!runtime) return null;
  const sender = runtime.sender.reason ? `. ${runtime.sender.reason}` : "";
  // Same account and sender checks as the per-conversation label (ai-visibility.ts): "enabled" needs a connected account,
  // delivery on, and a running sender observed in the last 180s.
  const blocked = accountBlocker(account) ?? senderBlocker(runtime);
  return { state: (blocked ? AI_BLOCKED[blocked] : "On, outgoing replies enabled") + sender, checkedAt: runtime.sender.observedAt };
}
