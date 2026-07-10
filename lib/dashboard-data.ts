import { supabaseAdmin } from "./supabase";
import { colorForIndex } from "./colors";

export type Period = "ALL" | "6M" | "3M" | "1M" | "2W" | "1W" | "1D";
type Gran = "hour" | "day" | "week" | "month";

const SPEC: Record<Period, { days: number | null; gran: Gran }> = {
  "1D": { days: 1, gran: "hour" },
  "1W": { days: 7, gran: "day" },
  "2W": { days: 14, gran: "day" },
  "1M": { days: 30, gran: "day" },
  "3M": { days: 90, gran: "week" },
  "6M": { days: 180, gran: "week" },
  ALL: { days: null, gran: "month" },
};

const MS_DAY = 86_400_000;

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
  active7d: number;
  messages: number;
  buyers: number;
  costUsd: number;  // AI + voice spend in the window (from usage_events)
  aiCalls: number;
  aiErrors: number;
};

export type DashboardData = {
  period: Period;
  clones: CloneSummary[];
  bucketLabels: string[];
  // one row per bucket: { bucket: label, [cloneId]: stars }
  series: Record<string, number | string>[];
  totals: { stars: number; sales: number; costUsd: number; aiErrors: number };
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

export async function getDashboard(period: Period): Promise<DashboardData> {
  const spec = SPEC[period];
  const now = Date.now();

  // ── clones ──────────────────────────────────────────────────────────────
  const { data: cloneRows } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,created_at")
    .order("created_at", { ascending: true });
  const clones = (cloneRows ?? []) as { id: string; slug: string; name: string }[];
  const colorById = new Map<string, string>();
  clones.forEach((c, i) => colorById.set(c.id, colorForIndex(i)));

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
  if (spec.days !== null) {
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

  const { keys, labels, keyFor } = buildBuckets(startMs, now, spec.gran);

  // ── purchases in window ────────────────────────────────────────────────────
  // Revenue ledger: every incoming Star (credit packs + paid media).
  const { data: purchaseRows } = await supabaseAdmin
    .from("star_transactions")
    .select("clone_id,amount_stars,paid_at")
    .gte("paid_at", new Date(startMs).toISOString());
  const purchases = (purchaseRows ?? []) as {
    clone_id: string;
    amount_stars: number;
    paid_at: string;
  }[];

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
    .gte("created_at", new Date(startMs).toISOString());
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
    if (!u.clone_id) continue;
    cloneCost.set(u.clone_id, (cloneCost.get(u.clone_id) ?? 0) + (Number(u.cost_usd) || 0));
    cloneCalls.set(u.clone_id, (cloneCalls.get(u.clone_id) ?? 0) + 1);
    totalCost += Number(u.cost_usd) || 0;
    if (!u.ok) {
      cloneErrors.set(u.clone_id, (cloneErrors.get(u.clone_id) ?? 0) + 1);
      totalErrors += 1;
    }
  }

  // ── per-clone user stats ────────────────────────────────────────────────────
  const { data: userRows } = await supabaseAdmin
    .from("users")
    .select("clone_id,last_message_received,total_messages_sent,total_messages_purchased");
  const users = (userRows ?? []) as {
    clone_id: string;
    last_message_received: string | null;
    total_messages_sent: number;
    total_messages_purchased: number;
  }[];

  const sevenDaysAgo = now - 7 * MS_DAY;
  const perClone: Record<string, CloneStats> = {};
  for (const c of clones) {
    perClone[c.id] = {
      stars: cloneStars.get(c.id) ?? 0,
      sales: cloneSales.get(c.id) ?? 0,
      users: 0,
      active7d: 0,
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
    if (u.total_messages_purchased > 0) s.buyers += 1;
    if (u.last_message_received && new Date(u.last_message_received).getTime() >= sevenDaysAgo)
      s.active7d += 1;
  }

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

  return {
    period,
    clones: summaries,
    bucketLabels: labels,
    series,
    totals: { stars: totalStars, sales: totalSales, costUsd: totalCost, aiErrors: totalErrors },
    perClone,
  };
}
