/** Search fan identity across the authorised account, never message contents. */
export type InboxSearch = { query: string; filter: "all" | "unread" | "attention" | "ai" };
export const EMPTY_INBOX_SEARCH: InboxSearch = { query: "", filter: "all" };
export function inboxSearchParams(aiOnly = false, search?: InboxSearch) {
  const params = new URLSearchParams();
  if (search?.query.trim()) params.set("query", search.query.trim());
  const filter = aiOnly ? "ai" : search?.filter;
  if (filter && filter !== "all") params.set("filter", filter);
  return params;
}
