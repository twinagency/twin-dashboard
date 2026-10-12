export const CHAT_HISTORY_DAYS = 90;
export const CHAT_HISTORY_PAGE = 100;
export type HistoryCursor = { at: string; id: string };

/** Strict cursor grammar: user input never becomes arbitrary PostgREST syntax. */
export function parseHistoryCursor(value?: string): HistoryCursor | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)\|(\d{1,19})$/.exec(value);
  return m && Number.isFinite(Date.parse(m[1])) ? { at: m[1], id: m[2] } : null;
}
export function historyCursor(row: { created_at: string; id: string | number }): string {
  // Preserve database microseconds. Rounding to milliseconds can skip tied rows.
  return `${row.created_at.replace(/\+00:00$/, "Z")}|${row.id}`;
}
export function historyWindowQuery(query: any, options: { before?: string; after?: string; now?: number } = {}) {
  const now = options.now ?? Date.now();
  const before = parseHistoryCursor(options.before);
  const after = before ? null : parseHistoryCursor(options.after);
  let q = query.gte("created_at", new Date(now - CHAT_HISTORY_DAYS * 86400_000).toISOString())
    .lte("created_at", new Date(now).toISOString());
  const c = before ?? after;
  if (c) {
    const op = before ? "lt" : "gt";
    q = q.or(`created_at.${op}.${c.at},and(created_at.eq.${c.at},id.${op}.${c.id})`);
  }
  return q.order("created_at", { ascending: !!after }).order("id", { ascending: !!after }).limit(CHAT_HISTORY_PAGE + 1);
}
