import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";
import { chartColorForClone, profileImagePathForClone } from "./colors";

export type Period = "ALL" | "1Y" | "6M" | "3M" | "1M" | "2W" | "1W" | "1D" | "CUSTOM";
type Gran = "hour" | "day" | "week" | "month";

const SPEC: Record<Period, { days: number | null; gran: Gran }> = {
  "1D": { days: 1, gran: "hour" },
  "1W": { days: 7, gran: "day" },
  "2W": { days: 14, gran: "day" },
  "1M": { days: 30, gran: "day" },
  "3M": { days: 90, gran: "week" },
  "6M": { days: 180, gran: "week" },
  "1Y": { days: 365, gran: "month" },
  ALL: { days: null, gran: "month" },
  // Unused — CUSTOM always comes with an explicit {startMs, endMs} range, which
  // picks its own granularity (see granForSpan) instead of reading this table.
  CUSTOM: { days: null, gran: "day" },
};

export type DateRange = { startMs: number; endMs: number };

const MS_DAY = 86_400_000;

// Custom ranges pick bucket width from the span so a 3-day pick doesn't render
// as monthly bars and a 2-year pick doesn't render one bar per hour.
function granForSpan(ms: number): Gran {
  const days = ms / MS_DAY;
  if (days <= 2) return "hour";
  if (days <= 45) return "day";
  if (days <= 270) return "week";
  return "month";
}

export type CloneSummary = {
  id: string;
  slug: string;
  name: string;
  color: string;
  photoUrl?: string;
  stars: number; // window revenue in stars
};

export type CloneStats = {
  stars: number;
  sales: number;
  users: number;
  active24h: number;
  messages: number;
  buyers: number;
  costUsd: number;  // AI + voice spend in the window (from usage_events)
  aiCalls: number;
  aiErrors: number;
};

export type RecentTransaction = {
  cloneId: string;
  cloneName: string;
  cloneColor: string;
  buyerName: string;
  username: string | null;
  telegramId: number | null;
  stars: number;
  kind: string; // feature if set (credits/photo/video/bundle/media/tip/subscription), else the coarse `kind`
  mediaType: "photo" | "video" | "bundle" | null;
  mediaUrl: string | null;
  mediaName: string | null;
  paidAt: string;
};

export type DashboardData = {
  period: Period;
  clones: CloneSummary[];
  bucketLabels: string[];
  // one row per bucket: { bucket: label, [cloneId]: stars }
  series: Record<string, number | string>[];
  recent: RecentTransaction[];
  totals: {
    stars: number;
    sales: number;
    costUsd: number;
    aiErrors: number;
    // Fleet-wide (all-time, not period-scoped — same semantics as perClone below).
    users: number;
    active24h: number;
    messages: number;
    buyers: number;
  };
  perClone: Record<string, CloneStats>;
};

// Build the ordered list of buckets for a window + a function mapping a
// timestamp to its bucket key.
function buildBuckets(startMs: number, endMs: number, gran: Gran) {
  const labels: string[] = [];
  const keys: string[] = [];

  const monthLabel = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const hourLabel = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });

  if (gran === "month") {
    const start = new Date(startMs);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(endMs);
    while (cur <= end) {
      keys.push(`${cur.getFullYear()}-${cur.getMonth()}`);
      labels.push(monthLabel(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    const keyFor = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${d.getMonth()}`;
    };
    return { keys, labels, keyFor };
  }

  const step = gran === "hour" ? 3_600_000 : gran === "day" ? MS_DAY : 7 * MS_DAY;
  const count = Math.max(1, Math.ceil((endMs - startMs) / step));
  for (let i = 0; i < count; i++) {
    const d = new Date(startMs + i * step);
    keys.push(String(i));
    labels.push(gran === "hour" ? hourLabel(d) : dayLabel(d));
  }
  const keyFor = (ts: number) =>
    String(Math.min(count - 1, Math.max(0, Math.floor((ts - startMs) / step))));
  return { keys, labels, keyFor };
}

export async function getDashboard(period: Period, range?: DateRange): Promise<DashboardData> {
  const spec = SPEC[period];
  const now = Date.now();
  const windowEnd = range ? range.endMs : now;
  const gran: Gran = range ? granForSpan(range.endMs - range.startMs) : spec.gran;

  // ── clones ──────────────────────────────────────────────────────────────
  const { data: cloneRows } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,created_at,intake")
    .order("created_at", { ascending: true });
  const clones = (cloneRows ?? []) as { id: string; slug: string; name: string; intake: unknown }[];
  const colorById = new Map<string, string>();
  clones.forEach((c, i) => colorById.set(c.id, chartColorForClone(c.intake, i)));

  // Cover photo per clone (first uploaded), batch-signed — so avatars match
  // the nav and the clones grid everywhere.
  const photoById = new Map<string, string>();
  if (clones.length) {
    const { data: photoRows } = await supabaseAdmin
      .from("photos")
      .select("clone_id, storage_path")
      .in("clone_id", clones.map((c) => c.id))
      .order("created_at", { ascending: true });
    const firstPath = new Map<string, string>();
    for (const clone of clones) {
      const customPath = profileImagePathForClone(clone.intake);
      if (customPath) firstPath.set(clone.id, customPath);
    }
    for (const p of photoRows ?? []) {
      if (p.clone_id && !firstPath.has(p.clone_id)) firstPath.set(p.clone_id, p.storage_path);
    }
    const entries = [...firstPath.entries()];
    if (entries.length) {
      const { data: signed } = await supabaseAdmin.storage
        .from("media")
        .createSignedUrls(entries.map((e) => e[1]), 3600);
      (signed ?? []).forEach((s, i) => {
        if (s.signedUrl) photoById.set(entries[i][0], s.signedUrl);
      });
    }
  }

  // ── window start ──────────────────────────────────────────────────────────
  let startMs: number;
  if (range) {
    startMs = range.startMs;
  } else if (spec.days !== null) {
    startMs = now - spec.days * MS_DAY;
  } else {
    const { data: earliest } = await supabaseAdmin
      .from("star_transactions")
      .select("paid_at")
      .order("paid_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    startMs = earliest?.paid_at
      ? new Date(earliest.paid_at).getTime()
      : now - 180 * MS_DAY;
  }

  const { keys, labels, keyFor } = buildBuckets(startMs, windowEnd, gran);

  // ── purchases in window ────────────────────────────────────────────────────
  // Revenue ledger: every incoming Star (credit packs + paid media). `feature`
  // is an additive column (migration 024) — fall back without it if that
  // migration hasn't landed yet, same defensive pattern as analytics-data.ts.
  type PurchaseRow = {
    id: string;
    clone_id: string;
    amount_stars: number;
    paid_at: string;
    telegram_id: number | null;
    kind: string | null;
    feature: string | null;
  };
  let purchases: PurchaseRow[];
  {
    const withFeature = await supabaseAdmin
      .from("star_transactions")
      .select("id,clone_id,amount_stars,paid_at,telegram_id,kind,feature")
      .gte("paid_at", new Date(startMs).toISOString())
      .lte("paid_at", new Date(windowEnd).toISOString());
    if (withFeature.error) {
      const legacy = await supabaseAdmin
        .from("star_transactions")
        .select("id,clone_id,amount_stars,paid_at,telegram_id,kind")
        .gte("paid_at", new Date(startMs).toISOString())
        .lte("paid_at", new Date(windowEnd).toISOString());
      purchases = ((legacy.data ?? []) as Omit<PurchaseRow, "feature">[]).map((r) => ({ ...r, feature: null }));
    } else {
      purchases = (withFeature.data ?? []) as PurchaseRow[];
    }
  }

  // bucketKey -> cloneId -> stars
  const grid = new Map<string, Map<string, number>>();
  const cloneStars = new Map<string, number>();
  const cloneSales = new Map<string, number>();
  let totalStars = 0;
  let totalSales = 0;

  for (const p of purchases) {
    const bk = keyFor(new Date(p.paid_at).getTime());
    if (!grid.has(bk)) grid.set(bk, new Map());
    const row = grid.get(bk)!;
    row.set(p.clone_id, (row.get(p.clone_id) ?? 0) + p.amount_stars);
    cloneStars.set(p.clone_id, (cloneStars.get(p.clone_id) ?? 0) + p.amount_stars);
    cloneSales.set(p.clone_id, (cloneSales.get(p.clone_id) ?? 0) + 1);
    totalStars += p.amount_stars;
    totalSales += 1;
  }

  const series = keys.map((k, i) => {
    const row: Record<string, number | string> = { bucket: labels[i] };
    const bk = grid.get(k);
    for (const c of clones) row[c.id] = bk?.get(c.id) ?? 0;
    return row;
  });

  // ── AI/voice cost in window (usage_events) ──────────────────────────────────
  const { data: usageRows } = await supabaseAdmin
    .from("usage_events")
    .select("clone_id,cost_usd,ok,created_at")
    .gte("created_at", new Date(startMs).toISOString())
    .lte("created_at", new Date(windowEnd).toISOString());
  const usage = (usageRows ?? []) as {
    clone_id: string | null;
    cost_usd: number | null;
    ok: boolean;
    created_at: string;
  }[];
  const cloneCost = new Map<string, number>();
  const cloneCalls = new Map<string, number>();
  const cloneErrors = new Map<string, number>();
  let totalCost = 0;
  let totalErrors = 0;
  for (const u of usage) {
    // Always count the cost in the grand total, even if we can't attribute it to a
    // clone (unattributed rows still cost real money — don't let them vanish).
    totalCost += Number(u.cost_usd) || 0;
    // Per-clone stats need a clone to attribute to; skip null-clone rows there only.
    if (!u.clone_id) continue;
    cloneCost.set(u.clone_id, (cloneCost.get(u.clone_id) ?? 0) + (Number(u.cost_usd) || 0));
    cloneCalls.set(u.clone_id, (cloneCalls.get(u.clone_id) ?? 0) + 1);
    if (!u.ok) {
      cloneErrors.set(u.clone_id, (cloneErrors.get(u.clone_id) ?? 0) + 1);
      totalErrors += 1;
    }
  }

  // ── per-clone user stats ────────────────────────────────────────────────────
  const { rows: userRows } = await selectAllRows(
    supabaseAdmin
      .from("users")
      .select("clone_id,telegram_id,name,stated_name,username,last_message_received,total_messages_sent,purchase_count,total_spent_stars"),
    { label: "dashboard per-clone user stats" },
  );
  const users = (userRows ?? []) as {
    clone_id: string;
    telegram_id: number;
    name: string | null;
    stated_name: string | null;
    username: string | null;
    last_message_received: string | null;
    total_messages_sent: number;
    purchase_count: number | null;
    total_spent_stars: number | null;
  }[];

  // Fan's self-stated name is the source of truth over the Telegram display
  // name (see memory: allieai2-fan-name-truth).
  const nameByKey = new Map<string, string>();
  const usernameByKey = new Map<string, string | null>();
  for (const u of users) {
    const key = `${u.clone_id}:${u.telegram_id}`;
    nameByKey.set(key, u.stated_name || u.name || `Fan ${u.telegram_id}`);
    usernameByKey.set(key, u.username);
  }

  const dayAgo = now - MS_DAY; // "active" = messaged in the last 24h (matches the Telegram messaging window)
  const perClone: Record<string, CloneStats> = {};
  for (const c of clones) {
    perClone[c.id] = {
      stars: cloneStars.get(c.id) ?? 0,
      sales: cloneSales.get(c.id) ?? 0,
      users: 0,
      active24h: 0,
      messages: 0,
      buyers: 0,
      costUsd: cloneCost.get(c.id) ?? 0,
      aiCalls: cloneCalls.get(c.id) ?? 0,
      aiErrors: cloneErrors.get(c.id) ?? 0,
    };
  }
  for (const u of users) {
    const s = perClone[u.clone_id];
    if (!s) continue;
    s.users += 1;
    s.messages += u.total_messages_sent ?? 0;
    // "Buyer" = ever paid us anything (credits, media, tips) — matches the
    // definition used in lib/analytics-data.ts so the two tabs agree.
    if ((u.purchase_count ?? 0) > 0 || (u.total_spent_stars ?? 0) > 0) s.buyers += 1;
    if (u.last_message_received && new Date(u.last_message_received).getTime() >= dayAgo)
      s.active24h += 1;
  }

  // ── recent transactions — most recent first. Capped generously (not to 30)
  // so scoping to one clone client-side still has enough rows to show; the
  // frontend takes the top 30 AFTER filtering by clone. ─────────────────────
  type MediaType = "photo" | "video" | "bundle";
  const isMediaType = (value: unknown): value is MediaType =>
    value === "photo" || value === "video" || value === "bundle";
  const latestPurchases = [...purchases]
    .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
    .slice(0, 300);

  // The Telegram ledger has the sale and the rich chat-history row has the
  // catalogue id. Match a sale to the latest unused same-price locked offer
  // made to that fan before payment, then resolve that exact item below.
  const mediaRefByTransaction = new Map<string, { type: MediaType; id: string }>();
  const mediaPurchases = latestPurchases.filter((p) => p.kind === "media" || isMediaType(p.feature));
  const mediaCloneIds = [...new Set(mediaPurchases.map((p) => p.clone_id))];
  const mediaTelegramIds = [
    ...new Set(mediaPurchases.map((p) => p.telegram_id).filter((id): id is number => id != null)),
  ];
  if (mediaCloneIds.length && mediaTelegramIds.length) {
    const { data: offerRows } = await supabaseAdmin
      .from("chat_history")
      .select("id,clone_id,telegram_id,created_at,meta")
      .in("clone_id", mediaCloneIds)
      .in("telegram_id", mediaTelegramIds)
      .contains("meta", { paid: true })
      .order("created_at", { ascending: false })
      .limit(5000);
    const offers: {
      rowId: number;
      cloneId: string;
      telegramId: number;
      createdAt: number;
      stars: number;
      type: MediaType;
      mediaId: string;
    }[] = [];
    for (const row of (offerRows ?? []) as {
      id: number;
      clone_id: string;
      telegram_id: number;
      created_at: string;
      meta: { type?: unknown; media_id?: unknown; stars?: unknown } | null;
    }[]) {
      if (!isMediaType(row.meta?.type) || typeof row.meta?.media_id !== "string") continue;
      offers.push({
        rowId: row.id,
        cloneId: row.clone_id,
        telegramId: Number(row.telegram_id),
        createdAt: new Date(row.created_at).getTime(),
        stars: Number(row.meta.stars),
        type: row.meta.type,
        mediaId: row.meta.media_id,
      });
    }
    const usedOffers = new Set<number>();
    for (const purchase of mediaPurchases) {
      if (purchase.telegram_id == null) continue;
      const paidAt = new Date(purchase.paid_at).getTime();
      const recordedType = isMediaType(purchase.feature) ? purchase.feature : null;
      const offer = offers.find(
        (candidate) =>
          !usedOffers.has(candidate.rowId) &&
          candidate.cloneId === purchase.clone_id &&
          candidate.telegramId === Number(purchase.telegram_id) &&
          candidate.createdAt <= paidAt &&
          candidate.stars === Number(purchase.amount_stars) &&
          (!recordedType || candidate.type === recordedType),
      );
      if (offer) {
        usedOffers.add(offer.rowId);
        mediaRefByTransaction.set(purchase.id, { type: offer.type, id: offer.mediaId });
      }
    }
  }

  const mediaAssetByKey = new Map<string, { path: string | null; name: string | null }>();
  const refs = [...mediaRefByTransaction.values()];
  const photoIds = [...new Set(refs.filter((r) => r.type === "photo").map((r) => r.id))];
  const videoIds = [...new Set(refs.filter((r) => r.type === "video").map((r) => r.id))];
  const bundleIds = [...new Set(refs.filter((r) => r.type === "bundle").map((r) => r.id))];
  if (photoIds.length) {
    const { data } = await supabaseAdmin
      .from("photos")
      .select("id,storage_path,image_name,caption")
      .in("id", photoIds);
    for (const p of (data ?? []) as { id: string; storage_path: string; image_name: string | null; caption: string | null }[]) {
      mediaAssetByKey.set(`photo:${p.id}`, { path: p.storage_path, name: p.image_name || p.caption || "Photo" });
    }
  }
  if (videoIds.length) {
    const { data } = await supabaseAdmin.from("videos").select("id,storage_path,caption").in("id", videoIds);
    for (const v of (data ?? []) as { id: string; storage_path: string; caption: string | null }[]) {
      mediaAssetByKey.set(`video:${v.id}`, { path: v.storage_path, name: v.caption || "Video" });
    }
  }
  if (bundleIds.length) {
    const { data } = await supabaseAdmin
      .from("photo_bundles")
      .select("id,name,photo_bundle_items(storage_path,sort_order)")
      .in("id", bundleIds);
    for (const b of (data ?? []) as {
      id: string;
      name: string | null;
      photo_bundle_items: { storage_path: string; sort_order: number }[];
    }[]) {
      const cover = [...(b.photo_bundle_items ?? [])].sort((a, z) => a.sort_order - z.sort_order)[0];
      mediaAssetByKey.set(`bundle:${b.id}`, { path: cover?.storage_path ?? null, name: b.name || "Bundle" });
    }
  }
  const mediaPaths = [
    ...new Set([...mediaAssetByKey.values()].map((asset) => asset.path).filter((path): path is string => !!path)),
  ];
  const { data: signedMedia } = mediaPaths.length
    ? await supabaseAdmin.storage.from("media").createSignedUrls(mediaPaths, 3600)
    : { data: [] as { signedUrl: string | null }[] };
  const signedUrlByPath = new Map(mediaPaths.map((path, i) => [path, signedMedia?.[i]?.signedUrl ?? null]));

  const cloneNameById = new Map(clones.map((c) => [c.id, c.name]));
  const recent: RecentTransaction[] = latestPurchases.map((p) => {
    const mediaRef = mediaRefByTransaction.get(p.id);
    const mediaType = mediaRef?.type ?? (isMediaType(p.feature) ? p.feature : null);
    const asset = mediaRef ? mediaAssetByKey.get(`${mediaRef.type}:${mediaRef.id}`) : null;
    return {
      cloneId: p.clone_id,
      cloneName: cloneNameById.get(p.clone_id) ?? "-",
      cloneColor: colorById.get(p.clone_id) ?? "#888",
      buyerName: p.telegram_id != null ? nameByKey.get(`${p.clone_id}:${p.telegram_id}`) ?? `Fan ${p.telegram_id}` : "Unknown",
      username: p.telegram_id != null ? usernameByKey.get(`${p.clone_id}:${p.telegram_id}`) ?? null : null,
      telegramId: p.telegram_id,
      stars: p.amount_stars,
      kind: mediaType || p.feature || p.kind || "other",
      mediaType,
      mediaUrl: asset?.path ? signedUrlByPath.get(asset.path) ?? null : null,
      mediaName: asset?.name ?? null,
      paidAt: p.paid_at,
    };
  });

  const summaries: CloneSummary[] = clones
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      color: colorById.get(c.id)!,
      photoUrl: photoById.get(c.id),
      stars: cloneStars.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.stars - a.stars);

  // Fleet-wide rollup of the same all-time fields perClone tracks, so the
  // Revenue page's headline tiles have an "All clones" total to show.
  let totalUsers = 0;
  let totalActive24h = 0;
  let totalMessages = 0;
  let totalBuyers = 0;
  for (const c of clones) {
    const s = perClone[c.id];
    totalUsers += s.users;
    totalActive24h += s.active24h;
    totalMessages += s.messages;
    totalBuyers += s.buyers;
  }

  return {
    period,
    clones: summaries,
    bucketLabels: labels,
    series,
    recent,
    totals: {
      stars: totalStars,
      sales: totalSales,
      costUsd: totalCost,
      aiErrors: totalErrors,
      users: totalUsers,
      active24h: totalActive24h,
      messages: totalMessages,
      buyers: totalBuyers,
    },
    perClone,
  };
}
