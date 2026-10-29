import { EMPTY_INBOX_SEARCH, type InboxSearch } from "./inbox-search";

/** What the inbox looks like, kept so leaving it and coming back finds it as it was.
 * Like drafts, this lives only in this document: never on disk, never in browser
 * storage, never shared. The principal is the server-derived staff identity, so a
 * different operator session starts from an empty inbox.
 */
export type InboxFilters = { search: InboxSearch; aiOnly: boolean };
const filters = new Map<string, InboxFilters>();
const selected = new Map<string, string>();
const scrolls = new Map<string, number>();
const key = (...parts: string[]) => JSON.stringify(parts);

export function rememberFilters(principal: string, creatorId: string | null, value: InboxFilters) { filters.set(key(principal, creatorId ?? ""), value); }
export function recallFilters(principal: string, creatorId: string | null): InboxFilters {
  return filters.get(key(principal, creatorId ?? "")) ?? { search: EMPTY_INBOX_SEARCH, aiOnly: false };
}
export function rememberSelected(principal: string, accountId: string, conversationId: string) { selected.set(key(principal, accountId), conversationId); }
export function recallSelected(principal: string, accountId: string): string | null { return selected.get(key(principal, accountId)) ?? null; }
/** `top` is the scroll offset, or null when the reader was at the bottom (follow new messages). */
export function rememberScroll(principal: string, accountId: string, conversationId: string, top: number | null) {
  const id = key(principal, accountId, conversationId);
  if (top === null) scrolls.delete(id); else scrolls.set(id, top);
}
export function recallScroll(principal: string, accountId: string, conversationId: string): number | null { return scrolls.get(key(principal, accountId, conversationId)) ?? null; }
export function clearInboxViewMemory() { filters.clear(); selected.clear(); scrolls.clear(); }
