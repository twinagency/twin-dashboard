/** Search fan identity across the authorised account, never message contents. */
export type InboxSearch = { query: string; filter: "all" | "unread" | "attention" | "ai" | "paused" | "review" | "delivery" };
export const EMPTY_INBOX_SEARCH: InboxSearch = { query: "", filter: "all" };
export function inboxSearchParams(aiOnly = false, search?: InboxSearch | string) {
  if (typeof search === "string") search = { query: search, filter: "all" };
  const params = new URLSearchParams();
  if (search?.query.trim()) params.set("query", search.query.trim());
  const filter = aiOnly ? "ai" : search?.filter;
  if (filter && ["ai", "unread", "attention"].includes(filter)) params.set("filter", filter);
  return params;
}
