import { supabaseAdmin } from "./supabase";
import { getDashboardAccess, requireCloneAccess } from "./dashboard-access";
import { CHAT_HISTORY_DAYS, CHAT_HISTORY_PAGE, historyWindowQuery } from "./chat-history-window";
import { fanKey, overlayV2Fan, parseInboxCursor, mergeHistory, type InboxClone, type InboxFan, type InboxMessage } from "./live-telegram-model";

const UPSTREAM = process.env.BOT_V2_URL ?? "http://172.31.6.134:4300";
// Shared only for already-authorized creator IDs; access is rechecked before
// every cache read. Never cache a user's selected scope or authorization.
const fanCache = new Map<string, { until: number; task: Promise<any[]> }>();

async function monitor(clone: InboxClone, endpoint: "fans" | "chat-history", params: Record<string, string> = {}) {
  await requireCloneAccess(clone.id);
  if (!/^[a-z0-9-]+$/i.test(clone.slug)) throw new Error("Invalid creator");
  const url = new URL(`${UPSTREAM}/api/${endpoint}`);
  url.search = new URLSearchParams({ ...params, girl: clone.slug }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (response.status === 404 && endpoint === "chat-history" && (await response.text()).trim() === "chat not found") return { history: [], hasMore: false };
  if (!response.ok) throw new Error("Telegram history is temporarily unavailable");
  return response.json();
}

async function creatorFans(clone: InboxClone): Promise<any[]> {
  await requireCloneAccess(clone.id);
  const cached = fanCache.get(clone.id);
  if (cached && cached.until > Date.now()) return cached.task;
  if (fanCache.size > 200) for (const [id, entry] of fanCache) if (entry.until <= Date.now()) fanCache.delete(id);
  const task = monitor(clone, "fans").then(rows => {
    if (!Array.isArray(rows)) throw new Error("Invalid fan list");
    return rows;
  });
  fanCache.set(clone.id, { until: Date.now() + 10_000, task });
  try { return await task; } catch (error) { fanCache.delete(clone.id); throw error; }
}

/** Current V2 participants plus their existing, scoped user records. No writes. */
export async function loadV2Fans(clones: InboxClone[], selectedCloneId: string | null) {
  const access = await getDashboardAccess();
  const allowed = clones.filter(clone => clone.engine === "v2" && (!selectedCloneId || clone.id === selectedCloneId) && (!access || access.cloneIds.includes(clone.id)));
  const fans: InboxFan[] = [], originals = new Map<string, InboxFan>(), unavailable: string[] = [];
  await Promise.all(allowed.map(async clone => {
    try {
      const raw = (await creatorFans(clone)).filter(row => overlayV2Fan(clone, row));
      const ids = [...new Set(raw.map(row => Number(row.chatId)))];
      const existing = new Map<string, InboxFan>();
      for (let start = 0; start < ids.length; start += 150) {
        const res = await supabaseAdmin.from("users").select("*").eq("clone_id", clone.id).in("telegram_id", ids.slice(start, start + 150)).limit(150);
        if (res.error) throw new Error("Could not match Telegram fans");
        for (const row of res.data ?? []) existing.set(String(row.telegram_id), row as InboxFan);
      }
      for (const row of raw) {
        const original = existing.get(String(row.chatId));
        const merged = overlayV2Fan(clone, row, original)!;
        if (original) originals.set(fanKey(original), original);
        fans.push(merged);
      }
    } catch { unavailable.push(clone.name); }
  }));
  return { fans, originals, unavailable };
}

/** Read both stores into one chronological page. V2 retains its own source IDs. */
export async function loadTelegramHistory(clone: InboxClone, telegramId: number, options: { before?: string; after?: string } = {}) {
  await requireCloneAccess(clone.id);
  const combined = clone.engine === "v2";
  const cursor = parseInboxCursor(options.before);
  const before = cursor ? `${cursor.at}|${cursor.source === "v1" ? cursor.id : "9223372036854775807"}` : undefined;
  // The monitor uses millisecond timestamps. A legacy timestamp inside that
  // millisecond must include V2 rows at its start, not lose them lexically.
  const monitorAt = cursor ? new Date(cursor.at).toISOString() : "";
  const hasSubmillisecond = cursor?.source === "v1" && /\.\d{3}\d*[1-9]\d*Z$/.test(cursor.at);
  const v1Query = historyWindowQuery(supabaseAdmin.from("chat_history").select("*").eq("clone_id", clone.id).eq("telegram_id", telegramId), {
    before, after: combined ? undefined : options.after,
  }).limit(CHAT_HISTORY_PAGE + 1);
  const v2Query = combined ? monitor(clone, "chat-history", {
    chatId: String(telegramId),
    ...(cursor ? { before: Buffer.from(JSON.stringify({ at: monitorAt, id: cursor.source === "v2" ? cursor.id : hasSubmillisecond ? "\uffff" : "" })).toString("base64url") } : {}),
  }) : Promise.resolve({ history: [], hasMore: false });
  const [legacy, current] = await Promise.allSettled([v1Query, v2Query]);
  if (legacy.status !== "fulfilled" || legacy.value.error) throw new Error("Could not load conversation history. Please retry.");
  const v1 = (legacy.value.data ?? []).map((row: any) => ({ ...row, source: "v1" as const }));
  if (!combined) {
    const rows = v1.slice(0, CHAT_HISTORY_PAGE);
    if (!options.after || options.before) rows.reverse();
    return { rows, hasMore: v1.length > CHAT_HISTORY_PAGE, combined: false, unavailable: false };
  }
  const value = current.status === "fulfilled" ? current.value : null;
  const unavailable = !value || !Array.isArray(value.history);
  const cutoff = Date.now() - CHAT_HISTORY_DAYS * 86400_000;
  const v2: InboxMessage[] = (unavailable ? [] : value.history).filter((row: any) =>
    typeof row.id === "string" && typeof row.content === "string" && ["user", "assistant"].includes(row.role)
    && ["received", "acknowledged", "unverified"].includes(row.delivery)
    && Date.parse(row.at) >= cutoff && Date.parse(row.at) <= Date.now()
  ).map((row: any) => ({ id: row.id, created_at: row.at, role: row.role === "user" ? "human" : "ai", content: row.content, source: "v2", delivery: row.delivery }));
  return { ...mergeHistory(v1, v2, cursor, value?.hasMore === true || v1.length > CHAT_HISTORY_PAGE), combined: true, unavailable };
}
