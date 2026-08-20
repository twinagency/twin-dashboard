import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";
import { chartColorForClone, profileImagePathForClone } from "./colors";
import { cloneUserStatsWindow, usageRollup } from "./rollup";

export type Period = "ALL" | "1Y" | "6M" | "3M" | "1M" | "2W" | "1W" | "1D" | "CUSTOM";
type Gran = "hour" | "day" | "week" | "month";

const SPEC: Record<Period, { days: number | null; gran: Gran }> = {
  "1D": { days: 1, gran: "hour" },
  "1W": { days: 7, gran: "day" },
  "2W": { days: 14, gran: "day" },
  "1M": { days: 30, gran: "day" },
  // Every multi-day window is day-by-day: Ronan's call 2026-08-11. Weekly/monthly
  // buckets hid the individual days he reads the chart for. 1D stays hourly
  // because one bar is not a chart.
  "3M": { days: 90, gran: "day" },
  "6M": { days: 180, gran: "day" },
  "1Y": { days: 365, gran: "day" },
  ALL: { days: null, gran: "day" },
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
  // Day-by-day at every span, to match the fixed periods above.
  return "day";
}

export type CloneSummary = {
  id: string;
  slug: string;
  name: string;
  color: string;
  photoUrl?: string;
  stars: number; // window revenue in stars
};

// Every field here is scoped to the requested window. `active` was `active24h`
// until 2026-08-21: it was a hardcoded now()-24h cut that ignored the period
// filter, and it was renamed rather than redefined in place so that every
// reader had to be looked at (there were three) instead of silently changing
// meaning under the two that render it with a "24h" label.
export type CloneStats = {
  stars: number;
  sales: number;
  users: number;
  active: number;
  /** Fans messageable RIGHT NOW: last_message_received inside the last 24h,
   *  deliberately NOT scoped to the selected window.
   *
   *  Telegram only lets a business bot message a fan within 24h of that fan's
   *  last message, so this is the size of the audience the fleet can actually
   *  reach this minute — an operational limit, not a statistic about a period.
   *  Asking "how many can I message, over the last 3 months" is not a question,
   *  which is why this one tile stays fixed while the rest follow the filter. */
  reachable24h: number;
  messages: number;
  buyers: number;
  /** repeat buyers / buyers, both counted inside the window. 0 when no buyers. */
  repeatPct: number;
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
    // Fleet-wide, scoped to the SAME window as stars/sales above. These were
    // all-time until 2026-08-21, which is the bug this shape now rules out.
    users: number;
    active: number;
    /** Not window-scoped, on purpose — see CloneStats.reachable24h. */
    reachable24h: number;
    messages: number;
    buyers: number;
    repeatPct: number;
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
  // PAGED, and this is the revenue number itself. Unpaged, this read stopped at
  // the PostgREST cap and every total on the page was a fraction of the truth,
  // with nothing to say so. Measured on alanna-pow 2026-08-09, once her real
  // Telegram history landed: the 3-month window returned 1000 of 3383 rows and
  // reported 304,220 stars against an actual 1,340,088, and all-time reported
  // 572,191 against 2,263,157. The read has no ORDER BY, so WHICH thousand rows
  // came back was arbitrary - which is how a WIDER window could show LESS money
  // than a narrower one, the symptom that gave it away.
  let purchases: PurchaseRow[];
  {
    const COLS = "id,clone_id,amount_stars,paid_at,telegram_id,kind,feature";
    const COLS_LEGACY = "id,clone_id,amount_stars,paid_at,telegram_id,kind";
    // selectAllRows reports a failed read as an empty result, which here would
    // read as "no revenue" rather than "column not there yet". So the missing
    // column is probed for with one row BEFORE paging, and the paged read then
    // asks only for columns that exist. Same defensive intent as before, just
    // moved ahead of the read that has to succeed.
    const probe = await supabaseAdmin.from("star_transactions").select(COLS).limit(1);
    const hasFeature = !probe.error;
    const paged = await selectAllRows(
      supabaseAdmin
        .from("star_transactions")
        .select(hasFeature ? COLS : COLS_LEGACY)
        .gte("paid_at", new Date(startMs).toISOString())
        .lte("paid_at", new Date(windowEnd).toISOString()),
      { label: "dashboard revenue ledger" },
    );
    purchases = hasFeature
      ? (paged.rows as PurchaseRow[])
      : (paged.rows as Omit<PurchaseRow, "feature">[]).map((r) => ({ ...r, feature: null }));
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
  // Aggregated in SQL (migration 120). This read used to page every row: 330,849
  // of them in a 30 day window, which is ~200 sequential round trips AND past
  // selectAllRows()'s 200,000 row ceiling, so the cost it reported was a lower
  // bound with nothing on the page to say so. The rollup is 143ms and complete.
  const usage = await usageRollup(startMs, windowEnd);
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
    cloneCalls.set(u.clone_id, (cloneCalls.get(u.clone_id) ?? 0) + (Number(u.calls) || 0));
    const errors = Number(u.errors) || 0;
    if (errors) {
      cloneErrors.set(u.clone_id, (cloneErrors.get(u.clone_id) ?? 0) + errors);
      totalErrors += errors;
    }
  }

  // ── buyers + repeat rate, per clone, INSIDE THE WINDOW ──────────────────────
  // Derived from the star_transactions rows loaded above, which are ALREADY
  // filtered to [startMs, windowEnd] — so this costs no extra round trip, and
  // this page ends up with exactly one definition of "buyer": someone who paid
  // inside the window. That is deliberately NOT the users-table definition
  // ("has ever paid us anything") that lib/analytics-data.ts uses for its
  // LIFETIME funnel — those are different questions on different tabs, and the
  // reason the tile now reads this instead of analytics.funnel.repeatPct.
  //
  // A row with no telegram_id can't be attributed to a person, so it can't make
  // one a buyer. It still counts as revenue and as a transaction above, which is
  // the same thing the totals have always done with it.
  const cloneTxPerFan = new Map<string, Map<number, number>>();
  for (const p of purchases) {
    if (p.telegram_id == null) continue;
    let perFan = cloneTxPerFan.get(p.clone_id);
    if (!perFan) {
      perFan = new Map();
      cloneTxPerFan.set(p.clone_id, perFan);
    }
    perFan.set(p.telegram_id, (perFan.get(p.telegram_id) ?? 0) + 1);
  }

  // ── per-clone user stats, INSIDE THE WINDOW ─────────────────────────────────
  // migration 122. The 120 function this replaced took only a p_active_since and
  // counted fans/messages/buyers over the whole users table, so five tiles sat
  // on lifetime totals while the period filter moved the other six — the bug
  // Ronan reported on 2026-08-21. Both ends are bounded now, and by the same
  // window the chart and the revenue totals above already use.
  //
  // `messages` now counts chat_history rows rather than summing
  // users.total_messages_sent, because only the former has a timestamp to filter
  // on. The ALL view therefore reads lower than it used to (271k vs 641k) — the
  // header of migration 122 explains why both numbers are correct.
  const userStats = await cloneUserStatsWindow(startMs, windowEnd);
  // Second call, fixed at the last 24h whatever the operator picked. This is the
  // Telegram business-bot messaging window — the fans the fleet may legally
  // message right now — so it is the one number on the page that must NOT move
  // with the filter. It is a separate RPC rather than a field on the one above
  // because the two answer questions about different time spans; migration 122's
  // users_clone_last_message_idx is what keeps it cheap.
  const reachableStats = await cloneUserStatsWindow(now - MS_DAY, now);
  const reachableByClone = new Map<string, number>();
  for (const row of reachableStats) reachableByClone.set(row.clone_id, Number(row.active) || 0);
  const perClone: Record<string, CloneStats> = {};
  for (const c of clones) {
    const perFan = cloneTxPerFan.get(c.id);
    const buyers = perFan?.size ?? 0;
    let repeatBuyers = 0;
    if (perFan) for (const count of perFan.values()) if (count > 1) repeatBuyers += 1;
    perClone[c.id] = {
      stars: cloneStars.get(c.id) ?? 0,
      sales: cloneSales.get(c.id) ?? 0,
      users: 0,
      active: 0,
      reachable24h: reachableByClone.get(c.id) ?? 0,
      messages: 0,
      buyers,
      repeatPct: buyers > 0 ? repeatBuyers / buyers : 0,
      costUsd: cloneCost.get(c.id) ?? 0,
      aiCalls: cloneCalls.get(c.id) ?? 0,
      aiErrors: cloneErrors.get(c.id) ?? 0,
    };
  }
  for (const row of userStats) {
    const s = perClone[row.clone_id];
    if (!s) continue;
    s.users = Number(row.fans) || 0;
    s.messages = Number(row.messages) || 0;
    s.active = Number(row.active) || 0;
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

  // ── buyer names for the recent list ─────────────────────────────────────────
  // Only the ≤300 fans who appear in `recent` need a name, so this asks for
  // exactly them. It used to fall out of the full users read that the rollup
  // above replaced — 63k rows fetched to label 300 lines. Still paged: the
  // telegram_id IN () list crosses every clone, so the result can exceed the
  // 1,000 row cap even though the input is small.
  //
  // Fan's self-stated name is the source of truth over the Telegram display
  // name (see memory: allieai2-fan-name-truth).
  const nameByKey = new Map<string, string>();
  const usernameByKey = new Map<string, string | null>();
  {
    const buyerTelegramIds = [
      ...new Set(latestPurchases.map((p) => p.telegram_id).filter((id): id is number => id != null)),
    ];
    const buyerCloneIds = [...new Set(latestPurchases.map((p) => p.clone_id).filter(Boolean))];
    if (buyerTelegramIds.length && buyerCloneIds.length) {
      const { rows: buyerRows } = await selectAllRows<{
        clone_id: string;
        telegram_id: number;
        name: string | null;
        stated_name: string | null;
        username: string | null;
      }>(
        supabaseAdmin
          .from("users")
          .select("clone_id,telegram_id,name,stated_name,username")
          .in("clone_id", buyerCloneIds)
          .in("telegram_id", buyerTelegramIds)
          // ORDERED, because 300 buyers across 11 clones can cross the 1,000
          // row page boundary and `users` is written on every inbound message.
          // Unordered .range() paging over a moving table skips rows, and a
          // skipped row here renders "Fan 12345" instead of his name. That is
          // the same defect this commit fixed on usage_events.
          .order("id", { ascending: true }),
        { label: "dashboard recent buyer names" },
      );
      for (const u of buyerRows) {
        const key = `${u.clone_id}:${u.telegram_id}`;
        nameByKey.set(key, u.stated_name || u.name || `Fan ${u.telegram_id}`);
        usernameByKey.set(key, u.username);
      }
    }
  }

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

  // Fleet-wide rollup of the same WINDOWED fields perClone tracks, so the
  // Revenue page's headline tiles have an "All clones" total to show.
  //
  // users / active / messages are additive across clones. BUYERS IS NOT: one
  // fan can pay two clones and a sum counts them twice, which is why this
  // builds its own per-fan map over every purchase in the window instead of
  // adding the per-clone counts up. Same reason the fleet repeat rate can't be
  // averaged out of the per-clone rates — the denominators overlap.
  let totalUsers = 0;
  let totalActive = 0;
  let totalReachable = 0;
  let totalMessages = 0;
  for (const c of clones) {
    const s = perClone[c.id];
    totalUsers += s.users;
    totalActive += s.active;
    totalReachable += s.reachable24h;
    totalMessages += s.messages;
  }
  const fleetTxPerFan = new Map<number, number>();
  for (const p of purchases) {
    if (p.telegram_id == null) continue;
    fleetTxPerFan.set(p.telegram_id, (fleetTxPerFan.get(p.telegram_id) ?? 0) + 1);
  }
  const totalBuyers = fleetTxPerFan.size;
  let fleetRepeatBuyers = 0;
  for (const count of fleetTxPerFan.values()) if (count > 1) fleetRepeatBuyers += 1;

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
      active: totalActive,
      reachable24h: totalReachable,
      messages: totalMessages,
      buyers: totalBuyers,
      repeatPct: totalBuyers > 0 ? fleetRepeatBuyers / totalBuyers : 0,
    },
    perClone,
  };
}
