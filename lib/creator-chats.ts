import "server-only";
import { supabaseAdmin } from "./supabase";
import { withDashboardAccess } from "./dashboard-access";
import type { CreatorDashboardIdentity } from "./creator-dashboard-identity";
import { creatorChatsClone } from "./creator-chats-policy";

// Read-only fan chats for creator accounts listed in creator-chats-policy.
// Current chats come from the V2 bot monitor (same private API the Twin
// dashboard inbox uses); older chats come from Twin chat_history, which the
// scoped live client already limits to the creator's one clone.
const UPSTREAM = process.env.BOT_V2_URL ?? "http://172.31.6.134:4300";
const PAGE = 200;

export type ChatFan = { telegramId: string; name: string | null; username: string | null; lastAt: string | null; messages: number | null; stars: number };
export type ChatMessage = { id: string; at: string; role: "fan" | "ai"; content: string };

async function monitor(slug: string, endpoint: "fans" | "chat-history", params: Record<string, string> = {}) {
  const url = new URL(`${UPSTREAM}/api/${endpoint}`);
  url.search = new URLSearchParams({ ...params, girl: slug }).toString();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (res.status === 404 && endpoint === "chat-history" && (await res.text()).trim() === "chat not found") return { history: [], hasMore: false, nextCursor: null };
  if (!res.ok) throw new Error(`monitor ${endpoint} ${res.status}`);
  return res.json();
}

function allowed(access: CreatorDashboardIdentity) {
  const scoped = access.kind === "creator" ? creatorChatsClone(access.accountId) : null;
  if (!scoped || access.cloneIds.length !== 1 || access.cloneIds[0] !== scoped.cloneId) throw new Error("Chats are not available for this account");
  return scoped;
}

export async function loadChatFans(access: CreatorDashboardIdentity, search: string): Promise<{ fans: ChatFan[]; v2Unavailable: boolean }> {
  const scoped = allowed(access);
  const byId = new Map<string, ChatFan>();
  let v2Unavailable = false;
  try {
    const rows = await monitor(scoped.slug, "fans");
    if (!Array.isArray(rows)) throw new Error("Invalid fan list");
    for (const r of rows) {
      const id = String(r.chatId ?? "");
      if (!/^-?\d{1,16}$/.test(id) || !r.business) continue;
      byId.set(id, { telegramId: id, name: r.name ?? null, username: r.username ?? null, lastAt: r.lastSeen ?? null, messages: Number(r.messages) || null, stars: Number(r.starsSpent) || 0 });
    }
  } catch { v2Unavailable = true; }
  const legacy = await withDashboardAccess(access, async () => {
    const res = await supabaseAdmin.from("users").select("telegram_id,name,stated_name,username,last_message_received,total_spent_stars")
      .eq("clone_id", scoped.cloneId).order("last_message_received", { ascending: false, nullsFirst: false }).limit(2000);
    if (res.error) throw new Error("Fans could not be loaded. Refresh to try again.");
    return res.data ?? [];
  });
  for (const u of legacy) {
    const id = String(u.telegram_id);
    const cur = byId.get(id);
    const lastAt = u.last_message_received ?? null;
    if (cur) {
      cur.name ||= u.stated_name || u.name || null;
      cur.username ||= u.username || null;
      if (lastAt && (!cur.lastAt || lastAt > cur.lastAt)) cur.lastAt = lastAt;
      cur.stars = Math.max(cur.stars, Number(u.total_spent_stars) || 0);
    } else byId.set(id, { telegramId: id, name: u.stated_name || u.name || null, username: u.username || null, lastAt, messages: null, stars: Number(u.total_spent_stars) || 0 });
  }
  const q = search.trim().toLowerCase().replace(/^@/, "");
  const fans = [...byId.values()]
    .filter(f => !q || f.telegramId.includes(q) || (f.name ?? "").toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  return { fans, v2Unavailable };
}

/**
 * One page of a fan's chat, oldest first. V2 pages first (cursor "v2:<monitor cursor>"),
 * then legacy Twin rows (cursor "v1:<created_at>").
 */
export async function loadChatThread(access: CreatorDashboardIdentity, telegramId: string, before: string | null): Promise<{ messages: ChatMessage[]; older: string | null; v2Unavailable: boolean }> {
  const scoped = allowed(access);
  if (!/^-?\d{1,16}$/.test(telegramId)) throw new Error("Invalid fan");
  let v2: ChatMessage[] = [], v2Unavailable = false, older: string | null = null;
  let v1Before: string | null = before?.startsWith("v1:") ? before.slice(3) : null;
  if (!v1Before) {
    try {
      const page = await monitor(scoped.slug, "chat-history", { chatId: telegramId, ...(before?.startsWith("v2:") ? { before: before.slice(3) } : {}) });
      v2 = (Array.isArray(page.history) ? page.history : []).filter((r: any) =>
        typeof r.id === "string" && typeof r.content === "string" && ["user", "assistant"].includes(r.role) && Number.isFinite(Date.parse(r.at))
      ).map((r: any) => ({ id: `v2:${r.id}`, at: r.at, role: r.role === "user" ? "fan" : "ai", content: r.content }));
      if (page.hasMore && page.nextCursor) older = `v2:${page.nextCursor}`;
    } catch { v2Unavailable = true; }
    if (older) return { messages: v2, older, v2Unavailable };
    v1Before = v2[0]?.at ?? null;
  }
  if (v1Before && !Number.isFinite(Date.parse(v1Before))) throw new Error("Invalid cursor");
  const rows = await withDashboardAccess(access, async () => {
    let query = supabaseAdmin.from("chat_history").select("id,role,content,created_at")
      .eq("clone_id", scoped.cloneId).eq("telegram_id", Number(telegramId)).order("created_at", { ascending: false }).limit(PAGE + 1);
    if (v1Before) query = query.lt("created_at", v1Before);
    const res = await query;
    if (res.error) throw new Error("Chat could not be loaded. Refresh to try again.");
    return res.data ?? [];
  });
  const v1 = rows.slice(0, PAGE).reverse().map(r => ({ id: `v1:${r.id}`, at: r.created_at, role: (r.role === "human" || r.role === "user" ? "fan" : "ai") as ChatMessage["role"], content: String(r.content ?? "") }));
  if (rows.length > PAGE && v1[0]) older = `v1:${v1[0].at}`;
  return { messages: [...v1, ...v2], older, v2Unavailable };
}
