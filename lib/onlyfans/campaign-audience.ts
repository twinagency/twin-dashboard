import type { ConversationSummary } from "@/lib/onlyfans-preview/types";

/** Campaign audience helpers. Pure so the form rules can be asserted without a browser. */
export const AUDIENCE_LIMIT = 1000;
export const NO_SENDER_TEXT = "Choose one creator to send from";
export const POPULATION_TEXT = "Synchronized conversations. This may not include every subscriber.";
export const POPULATION_HINT = "Rows are conversations saved from OnlyFans for this account. A conversation does not prove a current subscription, and subscribers who never had a saved conversation are not listed. No-contact exclusions and delivery holds are checked again before sending.";
export const ALL_MODE_LABEL = "All synchronized conversations (server decides, up to 1,000; the request is refused above that, nothing is silently cut)";
export const ALL_MODE_HINT = "The server builds this audience from its own saved fan records, which can differ from the list above. If more than 1,000 are found the whole request is refused. Nothing is dropped to fit.";

export type Sender = { creatorName: string; handle: string };

export const senderLine = (sender: Sender | null) => sender ? `Sending as ${sender.creatorName} · @${sender.handle} · OnlyFans` : NO_SENDER_TEXT;

export type DraftState = { name: string; body: string; scheduled: string; audienceKind: "explicit" | "all_known"; fanIds: string[]; catalogItemId: string; query: string };
export const EMPTY_DRAFT: DraftState = { name: "", body: "", scheduled: "", audienceKind: "explicit", fanIds: [], catalogItemId: "", query: "" };

/** Drafts live only in this document, keyed by account: never on disk, never shared. */
const drafts = new Map<string, DraftState>();
export const rememberDraft = (accountId: string, draft: DraftState) => { drafts.set(accountId, draft); };
export const recallDraft = (accountId: string): DraftState => ({ ...EMPTY_DRAFT, ...(drafts.get(accountId) ?? {}) });
export const forgetDraft = (accountId: string) => { drafts.delete(accountId); };
export const clearDrafts = () => drafts.clear();

export function canQueue(input: { accountId: string | null; locked: boolean; name: string; body: string; audienceKind: "explicit" | "all_known"; selected: number }) {
  return !!input.accountId && !input.locked && !!input.name.trim() && !!input.body.trim() && (input.audienceKind === "all_known" || (input.selected > 0 && input.selected <= AUDIENCE_LIMIT));
}

/** Append a page, keeping order and dropping repeats. */
export function mergePage(previous: ConversationSummary[], page: ConversationSummary[]) {
  return [...new Map([...previous, ...page].map(item => [item.conversationId, item])).values()];
}
/** Add this page's rows to the selection without ever passing the limit. */
export function selectPage(selected: ReadonlySet<string>, rows: ConversationSummary[]) {
  const next = new Set(selected);
  for (const row of rows) { if (next.size >= AUDIENCE_LIMIT) break; next.add(row.conversationId); }
  return next;
}
export const clearSelection = (): Set<string> => new Set();

export function ageText(value: string | null | undefined, now = Date.now()) {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return "no activity recorded";
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 2880) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}
/** Newest synchronization time among loaded rows, or null when none carries one. */
export function lastSyncAt(rows: ConversationSummary[]) {
  const times = rows.map(row => Date.parse(row.freshness?.asOf ?? "")).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
