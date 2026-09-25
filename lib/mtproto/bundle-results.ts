// lib/mtproto/bundle-results.ts
//
// Read-only results for the "bundle on reply" push (twin-bot migration 180):
// per creator and fleet wide, how many replies were eligible, how many bundles
// went out, how many failed and why, how many were bought and the stars that
// earned. Nothing here writes, and nothing here sends.
//
// PURCHASE MATCHING, and why it is a match rather than an exact join. Telegram
// does not hand back which bundle a paid-media charge unlocked, and the bot's
// ledger row keeps only the feature tag ('bundle'), not the bundle id. So a
// send counts as bought when the SAME fan paid a media charge for EXACTLY the
// price we sent, at or after the send, within PURCHASE_WINDOW_DAYS. A fan who
// later bought a different bundle priced identically could be over-counted;
// that is the honest limit, and the UI says so in a hover hint.
//
// star_transactions has duplicate rows for one real charge on some creators
// (same charge, different Telegram id). Rows are collapsed on the business key
// (clone, fan, kind, amount, paid_at to the second) BEFORE matching, and a
// charge is used for at most one send, so a duplicate can never count twice.
//
// Bounded reads: sends are paged with a hard row ceiling, star_transactions is
// read per creator, per chunk of at most 200 fans, from the earliest send on,
// with a row ceiling; any hit ceiling flips `truncated` and the UI shows
// lower bounds. The ledger is never rolled up (see N4 in attribution.ts).

import { mtDb } from "./db";
import { classifyRevenueLedgerRow } from "@/lib/revenue-ledger";
import { selectAllRowsMtproto } from "./paging";
import type { CreatorLite } from "./types";

export const PURCHASE_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const CHUNK = 200;
const MAX_SEND_ROWS = 20_000;
const MAX_TX_ROWS = 20_000;
const RECENT_PER_CLONE = 25;

export type BundleState = "pending" | "sending" | "sent" | "failed" | "uncertain" | "skipped";

export interface BundleConfigRow {
  clone_id: string;
  enabled: boolean | null;
  bundle_id: string | null;
  caption: string | null;
  star_price: number | null;
  delay_seconds: number | null;
  allow_uncertain: boolean | null;
  enabled_at: string | null;
}

export interface BundleSendDbRow {
  id: string;
  clone_id: string;
  telegram_id: number | string;
  state: BundleState;
  error: string | null;
  star_price: number | null;
  trigger_source: "reply" | "backfill";
  reply_classification: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface LedgerTx {
  id: string;
  clone_id: string;
  telegram_id: number | string | null;
  kind: string | null;
  feature: string | null;
  amount_stars: number;
  invoice_payload: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface BundleRecentSend {
  telegramId: number;
  state: BundleState;
  error: string | null;
  starPrice: number | null;
  trigger: "reply" | "backfill";
  createdAt: string;
  sentAt: string | null;
  boughtStars: number | null;
}

export interface BundleCloneResult {
  cloneId: string;
  name: string;
  config: { enabled: boolean; bundleId: string | null; starPrice: number | null; delaySeconds: number; captionPreview: string; placeholder: boolean } | null;
  /** Every classified reply that reached the queue (eligible + negative). */
  replies: number;
  /** Replies we refused because they were opt-out or hostile (or already opted out). */
  negative: number;
  eligible: number;
  pending: number;
  sent: number;
  sentByReply: number;
  sentByBackfill: number;
  failed: number;
  uncertain: number;
  /** Eligible but stopped by a gate (24h window, paused, test user, ...). */
  gated: number;
  failureReasons: Array<{ reason: string; count: number }>;
  purchases: number;
  stars: number;
  /** purchases / sent, or null when nothing was sent. */
  conversion: number | null;
  recent: BundleRecentSend[];
}

export interface BundleFleetResult {
  /** False when the tables do not exist yet (migration 180 not applied). */
  available: boolean;
  error: string | null;
  truncated: boolean;
  clones: BundleCloneResult[];
  totals: Omit<BundleCloneResult, "cloneId" | "name" | "config" | "recent" | "failureReasons"> & { failureReasons: Array<{ reason: string; count: number }> };
}

const isNegative = (r: { state: BundleState; error: string | null }) =>
  r.state === "skipped" && (r.error === "opted_out" || (r.error ?? "").startsWith("negative:"));

/** Short, stable label for grouping ("negative:complaint:spam" is never shown here). */
export function reasonLabel(error: string | null): string {
  const e = (error ?? "").trim();
  if (!e) return "no reason recorded";
  return e.replace(/\s+/g, " ").slice(0, 90);
}

const txKey = (t: LedgerTx) =>
  `${t.clone_id}|${t.telegram_id ?? ""}|${t.kind ?? ""}|${Number(t.amount_stars)}|${String(t.paid_at ?? t.created_at).slice(0, 19)}`;

/** Collapse rows that are one real charge recorded twice. Pure. */
export function dedupeLedger(rows: readonly LedgerTx[]): LedgerTx[] {
  const seen = new Set<string>();
  const out: LedgerTx[] = [];
  for (const r of rows) {
    const k = txKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * For each SENT row, the first paid-media charge by the same fan for exactly
 * the sent price, at/after the send, inside the window. A charge serves one
 * send only. Pure.
 */
export function matchPurchases(sends: readonly BundleSendDbRow[], ledger: readonly LedgerTx[]): Map<string, { stars: number; paidAt: string }> {
  const txs = dedupeLedger(ledger)
    .map((t) => ({ t, c: classifyRevenueLedgerRow(t), ms: new Date(t.paid_at ?? t.created_at).getTime() }))
    .filter((x) => x.c.paidOrder && x.t.kind === "media" && (x.t.feature == null || x.t.feature === "bundle" || x.t.feature === "media" || x.t.feature === ""))
    .sort((a, b) => a.ms - b.ms);
  const used = new Set<string>();
  const out = new Map<string, { stars: number; paidAt: string }>();
  const sentRows = sends.filter((s) => s.state === "sent" && s.sent_at && s.star_price).sort((a, b) => Date.parse(a.sent_at as string) - Date.parse(b.sent_at as string));
  for (const s of sentRows) {
    const sentMs = Date.parse(s.sent_at as string);
    const hit = txs.find(
      (x) =>
        !used.has(txKey(x.t)) &&
        x.t.clone_id === s.clone_id &&
        Number(x.t.telegram_id) === Number(s.telegram_id) &&
        x.c.stars === Number(s.star_price) &&
        x.ms >= sentMs - 5_000 &&
        x.ms <= sentMs + PURCHASE_WINDOW_DAYS * DAY_MS,
    );
    if (!hit) continue;
    used.add(txKey(hit.t));
    out.set(s.id, { stars: hit.c.stars, paidAt: hit.t.paid_at ?? hit.t.created_at });
  }
  return out;
}

const TOTAL_KEYS = ["replies", "negative", "eligible", "pending", "sent", "sentByReply", "sentByBackfill", "failed", "uncertain", "gated", "purchases", "stars"] as const;

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
const sortedReasons = (m: Map<string, number>) => [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

/** Pure aggregation, exported for the test. */
export function summarizeBundleResults(
  creators: readonly Pick<CreatorLite, "id" | "name">[],
  configs: readonly BundleConfigRow[],
  sends: readonly BundleSendDbRow[],
  ledger: readonly LedgerTx[],
): Omit<BundleFleetResult, "available" | "error" | "truncated"> {
  const bought = matchPurchases(sends, ledger);
  const ids = new Set<string>([...configs.map((c) => c.clone_id), ...sends.map((s) => s.clone_id)]);
  const nameOf = (id: string) => creators.find((c) => c.id === id)?.name ?? id;
  const clones: BundleCloneResult[] = [];

  for (const cloneId of ids) {
    const mine = sends.filter((s) => s.clone_id === cloneId);
    const cfg = configs.find((c) => c.clone_id === cloneId) ?? null;
    const reasons = new Map<string, number>();
    const r: BundleCloneResult = {
      cloneId, name: nameOf(cloneId),
      config: cfg
        ? {
            enabled: cfg.enabled === true, bundleId: cfg.bundle_id, starPrice: cfg.star_price, delaySeconds: cfg.delay_seconds ?? 0,
            captionPreview: (cfg.caption ?? "").slice(0, 120),
            placeholder: !cfg.bundle_id || /^todo\b/i.test((cfg.caption ?? "").trim()),
          }
        : null,
      replies: mine.length, negative: 0, eligible: 0, pending: 0, sent: 0, sentByReply: 0, sentByBackfill: 0,
      failed: 0, uncertain: 0, gated: 0, failureReasons: [], purchases: 0, stars: 0, conversion: null, recent: [],
    };
    for (const s of mine) {
      if (isNegative(s)) { r.negative++; continue; }
      r.eligible++;
      if (s.state === "pending" || s.state === "sending") r.pending++;
      else if (s.state === "sent") {
        r.sent++;
        if (s.trigger_source === "backfill") r.sentByBackfill++; else r.sentByReply++;
        const b = bought.get(s.id);
        if (b) { r.purchases++; r.stars += b.stars; }
      } else if (s.state === "failed") { r.failed++; bump(reasons, reasonLabel(s.error)); }
      else if (s.state === "uncertain") { r.uncertain++; bump(reasons, `maybe delivered: ${reasonLabel(s.error)}`); }
      else if (s.state === "skipped") { r.gated++; bump(reasons, reasonLabel(s.error)); }
    }
    r.failureReasons = sortedReasons(reasons);
    r.conversion = r.sent > 0 ? r.purchases / r.sent : null;
    r.recent = [...mine]
      .sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at))
      .slice(0, RECENT_PER_CLONE)
      .map((s) => ({
        telegramId: Number(s.telegram_id), state: s.state, error: s.error, starPrice: s.star_price, trigger: s.trigger_source,
        createdAt: s.created_at, sentAt: s.sent_at, boughtStars: bought.get(s.id)?.stars ?? null,
      }));
    clones.push(r);
  }
  clones.sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name));

  const allReasons = new Map<string, number>();
  for (const c of clones) for (const f of c.failureReasons) allReasons.set(f.reason, (allReasons.get(f.reason) ?? 0) + f.count);
  const sum = (k: (typeof TOTAL_KEYS)[number]) => clones.reduce((n, c) => n + c[k], 0);
  const totals: BundleFleetResult["totals"] = {
    replies: sum("replies"), negative: sum("negative"), eligible: sum("eligible"), pending: sum("pending"), sent: sum("sent"),
    sentByReply: sum("sentByReply"), sentByBackfill: sum("sentByBackfill"), failed: sum("failed"), uncertain: sum("uncertain"),
    gated: sum("gated"), purchases: sum("purchases"), stars: sum("stars"), conversion: null, failureReasons: sortedReasons(allReasons),
  };
  totals.conversion = totals.sent > 0 ? totals.purchases / totals.sent : null;
  return { clones, totals };
}

function missingRelation(e: { code?: string; message?: string } | null | undefined): boolean {
  return e?.code === "42P01" || e?.code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(e?.message ?? "");
}

const EMPTY_TOTALS = summarizeBundleResults([], [], [], []).totals;

/** Never throws. Unreadable is reported, never shown as zero. */
export async function loadBundleResults(creators: readonly Pick<CreatorLite, "id" | "name">[]): Promise<BundleFleetResult> {
  const fail = (available: boolean, error: string | null): BundleFleetResult => ({ available, error, truncated: false, clones: [], totals: EMPTY_TOTALS });
  try {
    const cfgRes = await mtDb()
      .from("bundle_push_config")
      .select("clone_id,enabled,bundle_id,caption,star_price,delay_seconds,allow_uncertain,enabled_at");
    if (cfgRes.error) return missingRelation(cfgRes.error) ? fail(false, null) : fail(true, cfgRes.error.message);
    const configs = (cfgRes.data ?? []) as BundleConfigRow[];

    const sendRes = await selectAllRowsMtproto<BundleSendDbRow>(
      () =>
        mtDb()
          .from("bundle_push_sends")
          .select("id,clone_id,telegram_id,state,error,star_price,trigger_source,reply_classification,created_at,sent_at")
          .order("id", { ascending: true }) as any,
      { label: "bundle_push_sends", maxRows: MAX_SEND_ROWS, throwOnError: true },
    );
    const sends = sendRes.rows;

    // Ledger: only for creators with SENT rows, only from their earliest send.
    let ledgerTruncated = false;
    const ledger: LedgerTx[] = [];
    const sentByClone = new Map<string, BundleSendDbRow[]>();
    for (const s of sends) if (s.state === "sent" && s.sent_at) sentByClone.set(s.clone_id, [...(sentByClone.get(s.clone_id) ?? []), s]);
    await Promise.all(
      [...sentByClone.entries()].map(async ([cloneId, rows]) => {
        const earliestIso = new Date(Math.min(...rows.map((r) => Date.parse(r.sent_at as string))) - 60_000).toISOString();
        const fans = [...new Set(rows.map((r) => Number(r.telegram_id)))];
        for (let i = 0; i < fans.length; i += CHUNK) {
          const ids = fans.slice(i, i + CHUNK);
          const res = await selectAllRowsMtproto<LedgerTx>(
            () =>
              mtDb()
                .from("star_transactions")
                .select("id,clone_id,telegram_id,kind,feature,amount_stars,invoice_payload,paid_at,created_at")
                .eq("clone_id", cloneId)
                .eq("kind", "media")
                .in("telegram_id", ids)
                .gte("paid_at", earliestIso)
                .order("id", { ascending: true }) as any,
            { label: "star_transactions (bundle push)", maxRows: MAX_TX_ROWS },
          );
          ledger.push(...res.rows);
          if (res.truncated) ledgerTruncated = true;
        }
      }),
    );

    return { available: true, error: null, truncated: sendRes.truncated || ledgerTruncated, ...summarizeBundleResults(creators, configs, sends, ledger) };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return missingRelation(err) ? fail(false, null) : fail(true, err?.message ?? "unreadable");
  }
}
