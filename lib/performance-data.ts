import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";

// Behavioral analytics for /performance: classic-vs-smart flow, day-of-week
// conversion timing, and the shape of a conversation before a fan's first
// payment. Deliberately separate from lib/analytics-data.ts (money cuts for
// the Revenue page). This file never touches revenue accounting, it only
// reads the same source tables read-only and re-derives its own numbers.
//
// This is a pre-cutover test database with very little traffic. Every
// aggregate here is fetched once (chat_history/users/star_transactions are
// all in the low hundreds of rows) and rolled up in JS, same pattern as
// analytics-data.ts. Small-N honesty: every percentage ships next to its raw
// count, and a bucket with zero underlying rows renders as "not enough data"
// rather than a fabricated 0% or 100%.

const MS_MIN = 60_000;

type CloneRow = { id: string; name: string; ai_mode: string | null; created_at: string };
type UserRow = { id: string; clone_id: string; telegram_id: number; first_seen_at: string };
type ChatRow = { clone_id: string; telegram_id: number; role: "ai" | "human"; created_at: string; meta: Record<string, unknown> | null };
type TxRow = { clone_id: string; telegram_id: number | null; amount_stars: number; paid_at: string };

const MEDIA_TYPES = new Set(["photo", "video"]);

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first, JS getDay() is Sunday=0

export type ModeBucket = {
  key: "classic" | "smart";
  label: string;
  cloneCount: number;
  fans: number;
  purchasers: number;
  conversionPct: number | null;
  revenueStars: number;
  revenuePerFan: number | null;
  totalMessages: number;
  avgMessagesPerFan: number | null;
  retainedFans: number;
  retentionPct: number | null;
};

export type DowRow = {
  dow: number;
  label: string;
  messages: number;
  activeFans: number;
  purchases: number;
  revenueStars: number;
  firstPurchases: number;
};

export type PrePurchaseRow = {
  telegramId: number;
  cloneName: string;
  messagesBefore: number;
  elapsedMinutes: number;
  mediaFirst: boolean;
};

export type PerformanceData = {
  scopedCloneName: string | null;
  fleetHasSmartClone: boolean;
  modeComparison: ModeBucket[];
  dayOfWeek: DowRow[];
  dowHasAnyData: boolean;
  prePurchase: {
    validCount: number;
    anomalousExcluded: number;
    avgMessagesBefore: number | null;
    avgElapsedMinutes: number | null;
    mediaFirstCount: number;
    mediaFirstPct: number | null;
    rows: PrePurchaseRow[];
  };
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function metaType(meta: Record<string, unknown> | null): string | null {
  if (!meta || typeof meta !== "object") return null;
  const t = (meta as { type?: unknown }).type;
  return typeof t === "string" ? t : null;
}

export async function getPerformanceData(cloneId: string | null): Promise<PerformanceData> {
  // Fleet-wide fetch, rolled up in JS. This was written when the dataset was
  // tiny; it is paged now because the n8n import pushes chat_history past a
  // million rows, and an unpaged read would silently stop at the PostgREST cap
  // and report a fraction of the fleet as the whole of it.
  // cloneId only narrows the day-of-week and pre-purchase cuts below; the
  // classic-vs-smart comparison always spans the whole fleet since that's what
  // it compares.
  const [{ data: cloneRows }, { rows: userRows }, { rows: chatRows, truncated: chatTruncated }, { rows: txRows }] =
    await Promise.all([
      supabaseAdmin.from("clones").select("id,name,ai_mode,created_at").order("created_at", { ascending: true }),
      selectAllRows<UserRow>(supabaseAdmin.from("users").select("id,clone_id,telegram_id,first_seen_at"), {
        label: "performance: fans",
      }),
      selectAllRows<ChatRow>(
        supabaseAdmin.from("chat_history").select("clone_id,telegram_id,role,created_at,meta"),
        { label: "performance: chat history" },
      ),
      selectAllRows<TxRow>(
        supabaseAdmin.from("star_transactions").select("clone_id,telegram_id,amount_stars,paid_at"),
        { label: "performance: star transactions" },
      ),
    ]);
  if (chatTruncated) {
    // Loud on purpose. Retention and message totals below are then lower bounds,
    // and this page has no way to say so in its own UI yet.
    console.warn(
      "[performance] chat_history read hit the row ceiling: message counts and retention are lower bounds, not totals.",
    );
  }

  const clones = (cloneRows ?? []) as CloneRow[];
  const users = (userRows ?? []) as UserRow[];
  const chat = (chatRows ?? []) as ChatRow[];
  const txs = (txRows ?? []) as TxRow[];

  const cloneById = new Map(clones.map((c) => [c.id, c]));
  const modeByClone = new Map<string, "classic" | "smart">(
    clones.map((c) => [c.id, c.ai_mode === "smart" ? "smart" : "classic"]),
  );

  // ── first purchase per fan (clone_id + telegram_id) ──────────────────────
  // star_transactions.user_id is not populated on this dataset, so every row
  // joins back to a fan by (clone_id, telegram_id) instead.
  const firstPurchase = new Map<string, string>(); // "cloneId|telegramId" -> earliest paid_at
  const spendByFan = new Map<string, number>();
  const fanKey = (cloneIdV: string, telegramId: number) => `${cloneIdV}|${telegramId}`;
  for (const t of txs) {
    if (!t.clone_id || t.telegram_id == null) continue;
    const key = fanKey(t.clone_id, t.telegram_id);
    spendByFan.set(key, (spendByFan.get(key) ?? 0) + (Number(t.amount_stars) || 0));
    const cur = firstPurchase.get(key);
    if (!cur || new Date(t.paid_at).getTime() < new Date(cur).getTime()) firstPurchase.set(key, t.paid_at);
  }

  // ── classic vs smart (always fleet-wide) ─────────────────────────────────
  const BUCKET_LABEL: Record<"classic" | "smart", string> = { classic: "Classic (sorter)", smart: "Smart (agent)" };
  const modeComparison: ModeBucket[] = (["classic", "smart"] as const).map((key) => {
    const cloneIds = new Set(clones.filter((c) => modeByClone.get(c.id) === key).map((c) => c.id));
    const bucketUsers = users.filter((u) => cloneIds.has(u.clone_id));
    const fans = bucketUsers.length;
    const purchasers = bucketUsers.filter((u) => firstPurchase.has(fanKey(u.clone_id, u.telegram_id))).length;
    const revenueStars = txs
      .filter((t) => t.clone_id && cloneIds.has(t.clone_id))
      .reduce((s, t) => s + (Number(t.amount_stars) || 0), 0);
    const bucketChat = chat.filter((c) => cloneIds.has(c.clone_id));
    const totalMessages = bucketChat.length;

    // Retention: a fan whose human messages land on more than one distinct
    // calendar date. Denominator is every known fan in the bucket, so a fan
    // who never came back still counts (as not-retained), not as excluded.
    const daysByFan = new Map<string, Set<string>>();
    for (const c of bucketChat) {
      if (c.role !== "human") continue;
      const key = fanKey(c.clone_id, c.telegram_id);
      if (!daysByFan.has(key)) daysByFan.set(key, new Set());
      daysByFan.get(key)!.add(dayKey(c.created_at));
    }
    const retainedFans = bucketUsers.filter((u) => (daysByFan.get(fanKey(u.clone_id, u.telegram_id))?.size ?? 0) > 1).length;

    return {
      key,
      label: BUCKET_LABEL[key],
      cloneCount: cloneIds.size,
      fans,
      purchasers,
      conversionPct: fans > 0 ? purchasers / fans : null,
      revenueStars,
      revenuePerFan: fans > 0 ? revenueStars / fans : null,
      totalMessages,
      avgMessagesPerFan: fans > 0 ? totalMessages / fans : null,
      retainedFans,
      retentionPct: fans > 0 ? retainedFans / fans : null,
    };
  });
  const fleetHasSmartClone = clones.some((c) => modeByClone.get(c.id) === "smart");

  // ── scope the remaining two cuts to the picked clone (or the whole fleet) ─
  const scopedClones = cloneId ? clones.filter((c) => c.id === cloneId) : clones;
  const scopedCloneIds = new Set(scopedClones.map((c) => c.id));
  const scopedChat = chat.filter((c) => scopedCloneIds.has(c.clone_id));
  const scopedUsers = users.filter((u) => scopedCloneIds.has(u.clone_id));
  const scopedTxs = txs.filter((t) => t.clone_id && scopedCloneIds.has(t.clone_id));

  // ── day of week ───────────────────────────────────────────────────────────
  const dowMessages = new Array(7).fill(0);
  const dowActiveFans: Set<string>[] = Array.from({ length: 7 }, () => new Set());
  const dowPurchases = new Array(7).fill(0);
  const dowRevenue = new Array(7).fill(0);
  const dowFirstPurchases = new Array(7).fill(0);

  for (const c of scopedChat) {
    if (c.role !== "human") continue;
    const dow = new Date(c.created_at).getDay();
    dowMessages[dow] += 1;
    dowActiveFans[dow].add(fanKey(c.clone_id, c.telegram_id));
  }
  for (const t of scopedTxs) {
    if (!t.clone_id) continue;
    const dow = new Date(t.paid_at).getDay();
    dowPurchases[dow] += 1;
    dowRevenue[dow] += Number(t.amount_stars) || 0;
  }
  // "When fans convert": bucket each fan's FIRST purchase only, by weekday.
  for (const u of scopedUsers) {
    const key = fanKey(u.clone_id, u.telegram_id);
    const fp = firstPurchase.get(key);
    if (fp) dowFirstPurchases[new Date(fp).getDay()] += 1;
  }

  const dayOfWeek: DowRow[] = DOW_ORDER.map((dow, i) => ({
    dow,
    label: DOW_LABELS[i],
    messages: dowMessages[dow],
    activeFans: dowActiveFans[dow].size,
    purchases: dowPurchases[dow],
    revenueStars: dowRevenue[dow],
    firstPurchases: dowFirstPurchases[dow],
  }));
  const dowHasAnyData = scopedChat.length > 0 || scopedTxs.length > 0;

  // ── pre-purchase pattern ─────────────────────────────────────────────────
  // For every scoped fan with a first purchase on record, look at what came
  // before it: message count, elapsed time since first contact, and whether
  // she'd already sent a photo/video. A fan is excluded (not silently zeroed)
  // when their first purchase timestamp predates their first_seen_at, that's
  // a data ordering problem (this test DB has been reseeded), not a real
  // <1-message conversion, so it would be dishonest to report it as one.
  let anomalousExcluded = 0;
  const prePurchaseRows: PrePurchaseRow[] = [];
  for (const u of scopedUsers) {
    const key = fanKey(u.clone_id, u.telegram_id);
    const fp = firstPurchase.get(key);
    if (!fp) continue;
    const fpMs = new Date(fp).getTime();
    const firstSeenMs = new Date(u.first_seen_at).getTime();
    if (fpMs < firstSeenMs) {
      anomalousExcluded += 1;
      continue;
    }
    const fanChat = scopedChat.filter((c) => c.clone_id === u.clone_id && c.telegram_id === u.telegram_id);
    const messagesBefore = fanChat.filter((c) => c.role === "human" && new Date(c.created_at).getTime() < fpMs).length;
    const mediaFirst = fanChat.some(
      (c) => c.role === "ai" && MEDIA_TYPES.has(metaType(c.meta) ?? "") && new Date(c.created_at).getTime() < fpMs,
    );
    prePurchaseRows.push({
      telegramId: u.telegram_id,
      cloneName: cloneById.get(u.clone_id)?.name ?? "?",
      messagesBefore,
      elapsedMinutes: (fpMs - firstSeenMs) / MS_MIN,
      mediaFirst,
    });
  }
  const validCount = prePurchaseRows.length;
  const avgMessagesBefore = validCount > 0 ? prePurchaseRows.reduce((s, r) => s + r.messagesBefore, 0) / validCount : null;
  const avgElapsedMinutes = validCount > 0 ? prePurchaseRows.reduce((s, r) => s + r.elapsedMinutes, 0) / validCount : null;
  const mediaFirstCount = prePurchaseRows.filter((r) => r.mediaFirst).length;

  return {
    scopedCloneName: cloneId ? (cloneById.get(cloneId)?.name ?? null) : null,
    fleetHasSmartClone,
    modeComparison,
    dayOfWeek,
    dowHasAnyData,
    prePurchase: {
      validCount,
      anomalousExcluded,
      avgMessagesBefore,
      avgElapsedMinutes,
      mediaFirstCount,
      mediaFirstPct: validCount > 0 ? mediaFirstCount / validCount : null,
      rows: prePurchaseRows,
    },
  };
}
