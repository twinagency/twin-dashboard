import { CHAT_HISTORY_PAGE, parseHistoryCursor } from "./chat-history-window";

export type InboxClone = { id: string; slug: string; name: string; engine?: string | null };
export type InboxFan = Record<string, any> & { id: string; clone_id: string; telegram_id: number };
export type InboxMessage = { id: string | number; created_at: string; role: string; content: string; meta?: any; source?: "v1" | "v2"; delivery?: string };
export type InboxCursor = { at: string; id: string; source: "v1" | "v2" };
export const fanKey = (fan: { clone_id: string; telegram_id: string | number }) => `${fan.clone_id}:${fan.telegram_id}`;
export const virtualFanId = (clone: string, telegram: string | number) => `v2_${clone}_${telegram}`;
export const isStoredFan = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

export function parseInboxCursor(value?: string): InboxCursor | null {
  const legacy = parseHistoryCursor(value);
  if (legacy) return { ...legacy, source: "v1" };
  if (!value?.startsWith("u.") || value.length > 800 || !/^u\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const c = JSON.parse(Buffer.from(value.slice(2), "base64url").toString("utf8"));
    if (!c || typeof c.at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(c.at) || !Number.isFinite(Date.parse(c.at))) return null;
    if (typeof c.id !== "string" || c.id.length > 200 || !c.id || !["v1", "v2"].includes(c.source)) return null;
    if (c.source === "v1" && !/^\d{1,19}$/.test(c.id)) return null;
    return { at: c.at, id: c.id, source: c.source };
  } catch { return null; }
}
export function inboxCursor(row: InboxMessage): string {
  return "u." + Buffer.from(JSON.stringify({ at: row.created_at.replace(/\+00:00$/, "Z"), id: String(row.id), source: row.source ?? "v1" })).toString("base64url");
}
// Preserve microseconds and use source + native ID as the tie breaker. Repeated
// text is not a duplicate; the same fan may legitimately say it several times.
const timeKey = (at: string) => at.replace(/\+00:00$/, "Z").replace(/(?:\.(\d+))?Z$/, (_, fraction = "") => `.${fraction.padEnd(6, "0")}Z`);
export function compareMessages(a: InboxMessage, b: InboxMessage): number {
  const at = timeKey(a.created_at), bt = timeKey(b.created_at);
  if (at !== bt) return at < bt ? -1 : 1;
  const as = a.source ?? "v1", bs = b.source ?? "v1";
  if (as !== bs) return as < bs ? -1 : 1;
  if (as === "v1") return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}
export function mergeHistory(v1: InboxMessage[], v2: InboxMessage[], cursor: InboxCursor | null, upstreamHasMore = false) {
  const unique = new Map<string, InboxMessage>();
  for (const row of [...v1, ...v2]) unique.set(`${row.source ?? "v1"}:${row.id}`, row);
  const anchor = cursor ? { id: cursor.id, created_at: cursor.at, source: cursor.source, role: "", content: "" } : null;
  const rows = [...unique.values()].filter(row => !anchor || compareMessages(row, anchor) < 0).sort(compareMessages);
  return { rows: rows.slice(-CHAT_HISTORY_PAGE), hasMore: upstreamHasMore || rows.length > CHAT_HISTORY_PAGE };
}

export function overlayV2Fan(clone: InboxClone, raw: any, existing?: InboxFan): InboxFan | null {
  const id = String(raw?.chatId ?? "");
  if (!/^\d{1,16}$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
  const last = date(raw.lastSeen), first = date(raw.firstSeen);
  const name = typeof raw.name === "string" ? raw.name : null;
  const username = typeof raw.username === "string" ? raw.username : name?.startsWith("@") ? name.slice(1) : null;
  return {
    id: virtualFanId(clone.id, id), clone_id: clone.id, telegram_id: Number(id),
    name: name && !name.startsWith("@") && name !== id ? name : null,
    total_messages_sent: null,
    total_messages_purchased: 0, message_credits: null, total_spent_stars: 0, purchase_count: 0,
    is_active: true, blocked: false, paused: false, ...existing,
    // The legacy user row remains the authority for financial and safety fields.
    // Raw monitor sales are gross and must never bypass partner revenue scaling.
    username: username || existing?.username || null,
    last_message_received: last && (!existing?.last_message_received || Date.parse(last) > Date.parse(existing.last_message_received)) ? last : existing?.last_message_received ?? last,
    first_seen_at: existing?.first_seen_at ?? first,
    _v2: true, _virtual: !existing,
  };
}
export function fanMatches(fan: InboxFan, status: string, q: string, cutoff: string): boolean {
  const active = !!fan.last_message_received && Date.parse(fan.last_message_received) >= Date.parse(cutoff);
  if (status === "active" && !active || status === "unreachable" && active) return false;
  if (status === "paying" && !(fan.purchase_count > 0 || fan.total_spent_stars > 0)) return false;
  if (status === "credits" && !(fan.message_credits > 0)) return false;
  if (status === "flagged" && !fan.blocked) return false;
  if (status === "new" && !(fan.first_seen_at && Date.parse(fan.first_seen_at) >= Date.parse(cutoff))) return false;
  const term = q.trim().toLowerCase().replace(/[,()*]/g, "");
  return !term || [fan.name, fan.stated_name, fan.username, fan.business_connection_id].some(value => typeof value === "string" && value.toLowerCase().includes(term)) || /^\d+$/.test(term) && String(fan.telegram_id) === term;
}
export function sortFans(fans: InboxFan[], key: string, asc: boolean): InboxFan[] {
  return [...fans].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv != null) return asc ? -1 : 1;
    if (bv == null && av != null) return asc ? 1 : -1;
    const cmp = av == null || bv == null ? 0 : key.endsWith("_at") || key === "last_message_received" ? Date.parse(av) - Date.parse(bv) : Number(av) - Number(bv);
    return (asc ? cmp : -cmp) || a.id.localeCompare(b.id);
  });
}
