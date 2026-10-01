import { validateTelegramData } from "@/lib/catalogue-core";

// T-Social: the Telegram Mini App feed (twin-reels/site). Pure helpers shared by
// the two public routes, the admin page and scripts/check-tsocial.ts. No Next
// imports here so the check runs offline.

export const TSOCIAL_ORIGIN = "https://dsygeknm080dt.cloudfront.net";
export const TSOCIAL_TOKEN_KEY = "tsocial_bot_token";
export const EVENT_KINDS = ["open", "view", "profile", "message", "share"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": TSOCIAL_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

/** Telegram id when initData is validly signed by the T-Social bot, else null. */
export function verifiedTelegramId(initData: unknown, token: string | null | undefined): number | null {
  if (typeof initData !== "string" || !token) return null;
  try { return validateTelegramData(initData, token).telegramId; } catch { return null; }
}

export type EventInput = { kind: EventKind; initData: string; cloneSlug: string | null; postId: string | null };
export function parseEventBody(body: unknown): EventInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.kind !== "string" || !(EVENT_KINDS as readonly string[]).includes(b.kind)) return null;
  const slug = typeof b.cloneSlug === "string" && /^[a-z0-9-]{1,80}$/.test(b.cloneSlug) ? b.cloneSlug : null;
  const postId = typeof b.postId === "string" && UUID.test(b.postId) ? b.postId : null;
  const initData = typeof b.initData === "string" && b.initData.length <= 12_000 ? b.initData : "";
  return { kind: b.kind as EventKind, initData, cloneSlug: slug, postId };
}

// Simple in-memory per-IP limiter (one process, same as the public API keys).
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(ip: string, now = Date.now(), max = 60): boolean {
  const h = hits.get(ip);
  if (!h || now >= h.reset) {
    if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  h.n++;
  return h.n > max;
}

// ── Feed projection ──────────────────────────────────────────────────────────
// Minimal shape of the supabase query builder we use, so tests can pass a fake.
type Q = PromiseLike<{ data: unknown; error: unknown; count?: number | null }> & {
  select: (cols: string, opts?: unknown) => Q;
  eq: (col: string, val: unknown) => Q;
  in: (col: string, vals: unknown[]) => Q;
};
export type TsocialDb = { from: (table: string) => Q };

export type FeedCreator = { slug: string; name: string; username: string; avatar: string; fans: number };
export type FeedPost = { id: string; type: "video" | "photo"; src: string; poster?: string; creator: string };

type CreatorRow = { clone_id: string; sort: number; display_name: string | null };
type CloneRow = { id: string; slug: string; name: string; business_username: string | null };
type PostRow = { id: string; clone_id: string; type: string; src: string; poster: string | null; sort: number };

async function rows<T>(q: Q): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error("tsocial query failed");
  return (data ?? []) as T[];
}

export async function loadFeed(db: TsocialDb): Promise<{ creators: FeedCreator[]; posts: FeedPost[] }> {
  const enabled = (await rows<CreatorRow>(db.from("tsocial_creators").select("clone_id,sort,display_name").eq("enabled", true)))
    .sort((a, b) => a.sort - b.sort);
  const ids = enabled.map((c) => c.clone_id);
  if (!ids.length) return { creators: [], posts: [] };
  const [clones, postRows, counts] = await Promise.all([
    rows<CloneRow>(db.from("clones").select("id,slug,name,business_username").in("id", ids)),
    rows<PostRow>(db.from("tsocial_posts").select("id,clone_id,type,src,poster,sort").eq("enabled", true).in("clone_id", ids)),
    Promise.all(ids.map(async (id) => {
      const { count } = await db.from("users").select("id", { count: "exact", head: true }).eq("clone_id", id);
      return [id, count ?? 0] as const;
    })),
  ]);
  const byId = new Map(clones.map((c) => [c.id, c]));
  const fans = new Map(counts);
  const creators: FeedCreator[] = [];
  const slugOf = new Map<string, string>();
  for (const e of enabled) {
    const c = byId.get(e.clone_id);
    if (!c || !c.business_username) continue; // a creator with nobody to message is not shown
    slugOf.set(c.id, c.slug);
    creators.push({ slug: c.slug, name: e.display_name || c.name, username: c.business_username, avatar: `media/${c.slug}/avatar.jpg`, fans: fans.get(c.id) ?? 0 });
  }
  const posts: FeedPost[] = postRows
    .filter((p) => slugOf.has(p.clone_id) && (p.type === "video" || p.type === "photo"))
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({ id: p.id, type: p.type as "video" | "photo", src: p.src, ...(p.poster ? { poster: p.poster } : {}), creator: slugOf.get(p.clone_id)! }));
  return { creators, posts };
}

/** True when a PostgREST error means the T-Social tables are not there yet. */
export function tablesMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /tsocial_.*(does not exist|schema cache)/.test(e.message ?? ""));
}
