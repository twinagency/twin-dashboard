// T-Social earnings: pure roll-up, no database and no Next imports so offline checks run it.
//
// WHERE THE MONEY IS RECORDED (the T-Social bot @TSocialAppBot has its own token, so none of this is in star_transactions):
//   tsocial_payments        method 'stars' | 'ton', status 'paid' | 'refunded' | 'pending' ('pending' = invoice opened, not paid).
//                           payload 'vip_<post id>_<tg id>_<nonce>' = a VIP bundle, 'ts_...' = a posting plan.
//   tsocial_unlock_orders   TON purchases of a paid post (status 'paid').
//   ai_model_purchases      Stars paid for AI girl pics (migration 20261008140000, type 'purchase' | 'refund'), absent until applied.
// Cross-check: Telegram getStarTransactions on the T-Social bot returns the same paid Stars rows as tsocial_payments (checked 2026-10-08).

export type PayRow = { id: string; tg_user_id: number | null; method: string; amount: number | string; currency: string; status: string; payload: string | null; created_at: string };
export type TonOrderRow = { payload: string; post_id: string | null; tg_user_id: number | null; amount_nano: number | string; cut_nano: number | string | null; status: string; created_at: string };
export type AiPurchaseRow = { id: string; type: string; model_id: string; telegram_id: number; image_id: string; stars: number; paid_at: string };

export type EarningsInput = {
  payments: PayRow[];
  tonOrders: TonOrderRow[];
  aiPurchases: AiPurchaseRow[];
  /** post id -> creator account id (VIP bundles and paid clips). */
  postOwner: Map<string, string>;
  /** creator account id -> display name. */
  accountName: Map<string, string>;
  /** AI model id -> name. */
  modelName: Map<string, string>;
  /** Telegram ids that are Ronan's or other test accounts. */
  testIds: Set<number>;
  starUsd: number;
  timeZone?: string;
};

export type Slice = { stars: number; ton: number; count: number; buyers: number };
export type CreatorRow = Slice & { key: string; name: string; kind: "creator" | "plans" | "ai" | "unknown" };
export type DayRow = { day: string; stars: number; ton: number; count: number };
export type Earnings = {
  stars: number;
  ton: number;
  usd: number;
  count: number;
  buyers: number;
  refundedStars: number;
  testStars: number;
  testTon: number;
  testCount: number;
  unpaid: { count: number; stars: number };
  bySource: { vip: Slice; plans: Slice; paidClips: Slice; ai: Slice };
  byDay: DayRow[];
  byCreator: CreatorRow[];
  firstPaid: string | null;
  lastPaid: string | null;
};

const NANO = 1_000_000_000;

export function parseVipPostId(payload: string | null | undefined): string | null {
  const m = /^vip_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_/i.exec(payload ?? "");
  return m ? m[1].toLowerCase() : null;
}

type Sale = { at: string; tg: number | null; stars: number; ton: number; source: "vip" | "plans" | "paidClips" | "ai"; creatorKey: string; creatorName: string; creatorKind: CreatorRow["kind"] };

export function buildEarnings(i: EarningsInput): Earnings {
  const tz = i.timeZone ?? "Australia/Sydney";
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const sales: Sale[] = [];
  let refundedStars = 0;
  let unpaidCount = 0, unpaidStars = 0;
  const owner = (postId: string | null) => {
    const acc = postId ? i.postOwner.get(postId) : undefined;
    return acc ? { key: acc, name: i.accountName.get(acc) ?? "Unknown creator", kind: "creator" as const } : { key: "unknown", name: "Unknown creator", kind: "unknown" as const };
  };
  for (const p of i.payments) {
    const amount = Number(p.amount) || 0;
    if (p.status === "refunded") { if (p.method === "stars") refundedStars += amount; continue; }
    if (p.status === "pending") { if (p.method === "stars") { unpaidCount++; unpaidStars += amount; } continue; }
    if (p.status !== "paid") continue;
    const vipPost = parseVipPostId(p.payload);
    const isPlan = !vipPost && (p.payload ?? "").startsWith("ts_");
    const who = vipPost ? owner(vipPost) : isPlan ? { key: "plans", name: "Posting plans (T-Social itself)", kind: "plans" as const } : { key: "unknown", name: "Unknown", kind: "unknown" as const };
    sales.push({ at: p.created_at, tg: p.tg_user_id, stars: p.method === "stars" ? amount : 0, ton: p.method === "ton" ? amount : 0, source: vipPost ? "vip" : "plans", creatorKey: who.key, creatorName: who.name, creatorKind: who.kind });
  }
  for (const o of i.tonOrders) {
    if (o.status !== "paid") continue;
    const who = owner(o.post_id);
    sales.push({ at: o.created_at, tg: o.tg_user_id, stars: 0, ton: (Number(o.amount_nano) + Number(o.cut_nano ?? 0)) / NANO, source: "paidClips", creatorKey: who.key, creatorName: who.name, creatorKind: who.kind });
  }
  const refunded = new Set(i.aiPurchases.filter((r) => r.type === "refund").map((r) => r.id));
  for (const a of i.aiPurchases) {
    if (a.type === "refund") { refundedStars += Number(a.stars) || 0; continue; }
    if (a.type !== "purchase" || refunded.has(a.id)) continue;
    sales.push({ at: a.paid_at, tg: a.telegram_id, stars: Number(a.stars) || 0, ton: 0, source: "ai", creatorKey: `ai:${a.model_id}`, creatorName: `${i.modelName.get(a.model_id) ?? "AI girl"} (AI)`, creatorKind: "ai" });
  }

  const slice = (rows: Sale[]): Slice => ({ stars: sum(rows, (r) => r.stars), ton: sum(rows, (r) => r.ton), count: rows.length, buyers: new Set(rows.map((r) => r.tg).filter((v) => v != null)).size });
  const isTest = (s: Sale) => s.tg != null && i.testIds.has(s.tg);
  const all = slice(sales);
  const test = slice(sales.filter(isTest));

  const days = new Map<string, DayRow>();
  for (const s of sales) {
    const d = dayOf(s.at);
    const row = days.get(d) ?? { day: d, stars: 0, ton: 0, count: 0 };
    row.stars += s.stars; row.ton += s.ton; row.count++;
    days.set(d, row);
  }
  const creators = new Map<string, Sale[]>();
  for (const s of sales) (creators.get(s.creatorKey) ?? creators.set(s.creatorKey, []).get(s.creatorKey)!).push(s);
  const byCreator: CreatorRow[] = [...creators.entries()].map(([key, rows]) => ({ key, name: rows[0].creatorName, kind: rows[0].creatorKind, ...slice(rows) }))
    .sort((a, b) => b.stars - a.stars || b.ton - a.ton || a.name.localeCompare(b.name));
  const times = sales.map((s) => s.at).sort();
  return {
    stars: all.stars, ton: all.ton, usd: all.stars * i.starUsd, count: all.count, buyers: all.buyers, refundedStars,
    testStars: test.stars, testTon: test.ton, testCount: test.count,
    unpaid: { count: unpaidCount, stars: unpaidStars },
    bySource: { vip: slice(sales.filter((s) => s.source === "vip")), plans: slice(sales.filter((s) => s.source === "plans")), paidClips: slice(sales.filter((s) => s.source === "paidClips")), ai: slice(sales.filter((s) => s.source === "ai")) },
    byDay: [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    byCreator,
    firstPaid: times[0] ?? null, lastPaid: times.at(-1) ?? null,
  };
}

function sum<T>(rows: T[], f: (r: T) => number): number { let t = 0; for (const r of rows) t += f(r); return t; }
