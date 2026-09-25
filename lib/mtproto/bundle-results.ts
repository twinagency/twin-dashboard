// lib/mtproto/bundle-results.ts
//
// Read-only results for "bundle on reply" (twin-bot migration 180): per
// creator, per FLOW, how many replies were eligible, how many free previews
// went out, how many failed and why, how many bought Part 1 / Part 2 and the
// stars that earned. Nothing here writes, and nothing here sends.
//
// MULTI-FLOW (2026-09-26 spec change): a creator can run several bundle flows
// (different sequences, captions, prices). bundle_push_config now has one row
// per FLOW (clone_id, flow_key), and bundle_push_sends is keyed by flow_id, so
// results are grouped per creator then per flow.
//
// WHAT IS SENT AND WHAT IS MATCHED. bundle_push_sends only ever records the
// FREE PREVIEW send (state 'sent' = Telegram accepted the preview video). Part
// 1 and Part 2 are sold by the existing video-sequence feature over the same
// Business connection, and — unlike the old photo-bundle push — that path
// writes an EXACT offer-to-part mapping (video_sequence_offers, keyed by
// attempt id) before every paid send, so a confirmed payment attributes to the
// exact part id via video_sequence_entitlements. There is no price/time
// guessing here: Part 1 and Part 2 sharing a price is not ambiguous, because
// entitlements are keyed by (user_id, part_id), not by price.
//
// Bounded reads: sends are paged with a hard row ceiling; the parts and
// entitlements reads are restricted to the revisions/fans actually present in
// the read sends. Any hit ceiling flips `truncated` and the UI shows lower
// bounds.

import { mtDb } from "./db";
import { selectAllRowsMtproto } from "./paging";
import type { CreatorLite } from "./types";

const MAX_SEND_ROWS = 20_000;
const MAX_ENTITLEMENT_ROWS = 20_000;
const RECENT_PER_FLOW = 25;

export type BundleState = "pending" | "sending" | "sent" | "failed" | "uncertain" | "skipped";
export type BundleAudience = "campaign_repliers" | "active_chatters";

export interface BundleConfigRow {
  id: string;
  clone_id: string;
  flow_key: string;
  name: string | null;
  enabled: boolean | null;
  priority: number | null;
  audience: BundleAudience | null;
  min_gap_hours: number | null;
  sequence_id: string | null;
  caption: string | null;
  part1_star_price: number | null;
  part2_star_price: number | null;
  delay_seconds: number | null;
  allow_uncertain: boolean | null;
  enabled_at: string | null;
}

export interface BundleSendDbRow {
  id: string;
  clone_id: string;
  flow_id: string;
  user_id: string | null;
  telegram_id: number | string;
  sequence_id: string | null;
  revision_id: string | null;
  state: BundleState;
  error: string | null;
  trigger_source: "reply" | "backfill";
  reply_classification: string | null;
  created_at: string;
  sent_at: string | null;
}

/** position 1 or 2 only; the free preview (position 0) is never in this table. */
export interface PartRow {
  id: string;
  revision_id: string;
  position: number;
  price_stars: number | null;
}

export interface EntitlementRow {
  user_id: string;
  part_id: string;
  price_stars_paid: number;
  revoked_at: string | null;
}

export interface BundleRecentSend {
  telegramId: number;
  state: BundleState;
  error: string | null;
  trigger: "reply" | "backfill";
  createdAt: string;
  sentAt: string | null;
  part1Bought: number | null;
  part2Bought: number | null;
}

export interface BundleFlowResult {
  flowId: string;
  flowKey: string;
  name: string;
  enabled: boolean;
  priority: number;
  audience: BundleAudience;
  minGapHours: number;
  sequenceId: string | null;
  captionPreview: string;
  part1Price: number | null;
  part2Price: number | null;
  delaySeconds: number;
  /** Enabled=false because the sequence/prices/caption are not real yet. */
  placeholder: boolean;
  /** Every classified reply that reached the queue for this flow. */
  replies: number;
  /** Refused: opt-out or hostile (or already opted out), or held back by the
   *  multi-flow rules (another flow in flight / inside its gap). */
  negative: number;
  flowGated: number;
  eligible: number;
  pending: number;
  previewsSent: number;
  sentByReply: number;
  sentByBackfill: number;
  failed: number;
  uncertain: number;
  /** Eligible, preview sendable, but stopped by a fan gate (24h window, paused, ...). */
  gated: number;
  failureReasons: Array<{ reason: string; count: number }>;
  part1Purchases: number;
  part2Purchases: number;
  stars: number;
  /** (part1 + part2 purchases) / (2 * previewsSent), or null when nothing was sent. */
  conversion: number | null;
  recent: BundleRecentSend[];
}

export interface BundleCloneResult {
  cloneId: string;
  name: string;
  flows: BundleFlowResult[];
  /** Sums across this creator's flows, for the collapsed summary row. */
  previewsSent: number;
  purchases: number;
  stars: number;
}

export interface BundleFleetTotals {
  replies: number;
  negative: number;
  flowGated: number;
  eligible: number;
  pending: number;
  previewsSent: number;
  sentByReply: number;
  sentByBackfill: number;
  failed: number;
  uncertain: number;
  gated: number;
  part1Purchases: number;
  part2Purchases: number;
  purchases: number;
  stars: number;
  conversion: number | null;
  failureReasons: Array<{ reason: string; count: number }>;
}

export interface BundleFleetResult {
  /** False when the tables do not exist yet (migration 180 not applied). */
  available: boolean;
  error: string | null;
  truncated: boolean;
  clones: BundleCloneResult[];
  totals: BundleFleetTotals;
}

const isNegative = (r: { state: BundleState; error: string | null }) =>
  r.state === "skipped" && (r.error === "opted_out" || (r.error ?? "").startsWith("negative:"));
const isFlowGated = (r: { state: BundleState; error: string | null }) =>
  r.state === "skipped" && (r.error === "already_has_flow" || r.error === "other_flow_in_flight" || r.error === "other_flow_recent");

/** Short, stable label for grouping ("negative:complaint:spam" is never shown here). */
export function reasonLabel(error: string | null): string {
  const e = (error ?? "").trim();
  if (!e) return "no reason recorded";
  return e.replace(/\s+/g, " ").slice(0, 90);
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
const sortedReasons = (m: Map<string, number>) => [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

/**
 * Part 1 / Part 2 ids for a revision, from the parts table (positions 1 and 2
 * only; position 0, the free preview, is never sold and never appears here).
 */
function partsOf(parts: readonly PartRow[], revisionId: string | null): { p1: string | null; p2: string | null } {
  if (!revisionId) return { p1: null, p2: null };
  const mine = parts.filter((p) => p.revision_id === revisionId);
  return {
    p1: mine.find((p) => p.position === 1)?.id ?? null,
    p2: mine.find((p) => p.position === 2)?.id ?? null,
  };
}

/**
 * Live (unrevoked) entitlement for one fan+part, exact id match — no price or
 * time guessing, unlike the old photo-bundle attribution. Pure.
 */
function entitlementFor(entitlements: readonly EntitlementRow[], userId: string | null, partId: string | null): EntitlementRow | null {
  if (!userId || !partId) return null;
  return entitlements.find((e) => e.user_id === userId && e.part_id === partId && !e.revoked_at) ?? null;
}

/** Pure aggregation, exported for the test. */
export function summarizeBundleResults(
  creators: readonly Pick<CreatorLite, "id" | "name">[],
  configs: readonly BundleConfigRow[],
  sends: readonly BundleSendDbRow[],
  parts: readonly PartRow[],
  entitlements: readonly EntitlementRow[],
): Omit<BundleFleetResult, "available" | "error" | "truncated"> {
  const nameOf = (id: string) => creators.find((c) => c.id === id)?.name ?? id;
  const cloneIds = new Set<string>([...configs.map((c) => c.clone_id), ...sends.map((s) => s.clone_id)]);
  const clones: BundleCloneResult[] = [];

  for (const cloneId of cloneIds) {
    const cloneConfigs = configs.filter((c) => c.clone_id === cloneId).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    const flowIds = new Set<string>([...cloneConfigs.map((c) => c.id), ...sends.filter((s) => s.clone_id === cloneId).map((s) => s.flow_id)]);
    const flows: BundleFlowResult[] = [];

    for (const flowId of flowIds) {
      const cfg = cloneConfigs.find((c) => c.id === flowId) ?? null;
      const mine = sends.filter((s) => s.clone_id === cloneId && s.flow_id === flowId);
      const reasons = new Map<string, number>();
      const caption = (cfg?.caption ?? "").trim();
      const placeholder = !cfg?.sequence_id || cfg.part1_star_price == null || cfg.part2_star_price == null || !caption || /^todo\b/i.test(caption) || /todo-personalise/i.test(caption);

      const f: BundleFlowResult = {
        flowId, flowKey: cfg?.flow_key ?? flowId, name: cfg?.name ?? cfg?.flow_key ?? flowId,
        enabled: cfg?.enabled === true, priority: cfg?.priority ?? 100, audience: cfg?.audience ?? "campaign_repliers",
        minGapHours: cfg?.min_gap_hours ?? 24, sequenceId: cfg?.sequence_id ?? null, captionPreview: caption.slice(0, 120),
        part1Price: cfg?.part1_star_price ?? null, part2Price: cfg?.part2_star_price ?? null, delaySeconds: cfg?.delay_seconds ?? 0,
        placeholder,
        replies: mine.length, negative: 0, flowGated: 0, eligible: 0, pending: 0, previewsSent: 0, sentByReply: 0, sentByBackfill: 0,
        failed: 0, uncertain: 0, gated: 0, failureReasons: [], part1Purchases: 0, part2Purchases: 0, stars: 0, conversion: null, recent: [],
      };

      const recentSource: Array<BundleSendDbRow & { p1: number | null; p2: number | null }> = [];
      for (const s of mine) {
        if (isFlowGated(s)) { f.flowGated++; continue; }
        if (isNegative(s)) { f.negative++; continue; }
        f.eligible++;
        let p1Bought: number | null = null;
        let p2Bought: number | null = null;
        if (s.state === "pending" || s.state === "sending") f.pending++;
        else if (s.state === "sent") {
          f.previewsSent++;
          if (s.trigger_source === "backfill") f.sentByBackfill++; else f.sentByReply++;
          const { p1, p2 } = partsOf(parts, s.revision_id);
          const e1 = entitlementFor(entitlements, s.user_id, p1);
          const e2 = entitlementFor(entitlements, s.user_id, p2);
          if (e1) { f.part1Purchases++; f.stars += e1.price_stars_paid; p1Bought = e1.price_stars_paid; }
          if (e2) { f.part2Purchases++; f.stars += e2.price_stars_paid; p2Bought = e2.price_stars_paid; }
        } else if (s.state === "failed") { f.failed++; bump(reasons, reasonLabel(s.error)); }
        else if (s.state === "uncertain") { f.uncertain++; bump(reasons, `maybe delivered: ${reasonLabel(s.error)}`); }
        else if (s.state === "skipped") { f.gated++; bump(reasons, reasonLabel(s.error)); }
        recentSource.push({ ...s, p1: p1Bought, p2: p2Bought });
      }
      f.failureReasons = sortedReasons(reasons);
      f.conversion = f.previewsSent > 0 ? (f.part1Purchases + f.part2Purchases) / (2 * f.previewsSent) : null;
      f.recent = [...recentSource]
        .sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at))
        .slice(0, RECENT_PER_FLOW)
        .map((s) => ({
          telegramId: Number(s.telegram_id), state: s.state, error: s.error, trigger: s.trigger_source,
          createdAt: s.created_at, sentAt: s.sent_at, part1Bought: s.p1, part2Bought: s.p2,
        }));
      flows.push(f);
    }
    flows.sort((a, b) => b.previewsSent - a.previewsSent || a.priority - b.priority || a.flowKey.localeCompare(b.flowKey));
    clones.push({
      cloneId, name: nameOf(cloneId), flows,
      previewsSent: flows.reduce((n, f) => n + f.previewsSent, 0),
      purchases: flows.reduce((n, f) => n + f.part1Purchases + f.part2Purchases, 0),
      stars: flows.reduce((n, f) => n + f.stars, 0),
    });
  }
  clones.sort((a, b) => b.previewsSent - a.previewsSent || a.name.localeCompare(b.name));

  const allFlows = clones.flatMap((c) => c.flows);
  const allReasons = new Map<string, number>();
  for (const f of allFlows) for (const r of f.failureReasons) allReasons.set(r.reason, (allReasons.get(r.reason) ?? 0) + r.count);
  const sum = (k: keyof BundleFlowResult) => allFlows.reduce((n, f) => n + (f[k] as number), 0);
  const totals: BundleFleetTotals = {
    replies: sum("replies"), negative: sum("negative"), flowGated: sum("flowGated"), eligible: sum("eligible"), pending: sum("pending"),
    previewsSent: sum("previewsSent"), sentByReply: sum("sentByReply"), sentByBackfill: sum("sentByBackfill"), failed: sum("failed"),
    uncertain: sum("uncertain"), gated: sum("gated"), part1Purchases: sum("part1Purchases"), part2Purchases: sum("part2Purchases"),
    purchases: sum("part1Purchases") + sum("part2Purchases"), stars: sum("stars"), conversion: null, failureReasons: sortedReasons(allReasons),
  };
  totals.conversion = totals.previewsSent > 0 ? (totals.part1Purchases + totals.part2Purchases) / (2 * totals.previewsSent) : null;
  return { clones, totals };
}

function missingRelation(e: { code?: string; message?: string } | null | undefined): boolean {
  return e?.code === "42P01" || e?.code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(e?.message ?? "");
}

const EMPTY_TOTALS = summarizeBundleResults([], [], [], [], []).totals;

/** Never throws. Unreadable is reported, never shown as zero. */
export async function loadBundleResults(creators: readonly Pick<CreatorLite, "id" | "name">[]): Promise<BundleFleetResult> {
  const fail = (available: boolean, error: string | null): BundleFleetResult => ({ available, error, truncated: false, clones: [], totals: EMPTY_TOTALS });
  try {
    const cfgRes = await mtDb()
      .from("bundle_push_config")
      .select("id,clone_id,flow_key,name,enabled,priority,audience,min_gap_hours,sequence_id,caption,part1_star_price,part2_star_price,delay_seconds,allow_uncertain,enabled_at");
    if (cfgRes.error) return missingRelation(cfgRes.error) ? fail(false, null) : fail(true, cfgRes.error.message);
    const configs = (cfgRes.data ?? []) as BundleConfigRow[];

    const sendRes = await selectAllRowsMtproto<BundleSendDbRow>(
      () =>
        mtDb()
          .from("bundle_push_sends")
          .select("id,clone_id,flow_id,user_id,telegram_id,sequence_id,revision_id,state,error,trigger_source,reply_classification,created_at,sent_at")
          .order("id", { ascending: true }) as any,
      { label: "bundle_push_sends", maxRows: MAX_SEND_ROWS, throwOnError: true },
    );
    const sends = sendRes.rows;

    // Parts: only positions 1/2 of the revisions that actually appear in reads.
    const revisionIds = [...new Set(sends.map((s) => s.revision_id).filter((x): x is string => !!x))];
    let parts: PartRow[] = [];
    if (revisionIds.length > 0) {
      const { data, error } = await mtDb()
        .from("video_sequence_parts")
        .select("id,revision_id,position,price_stars")
        .in("revision_id", revisionIds)
        .in("position", [1, 2]);
      if (error && !missingRelation(error)) return fail(true, error.message);
      parts = (data ?? []) as PartRow[];
    }

    // Entitlements: only for fans (user ids) who actually got a preview, and
    // only the parts above, so this never scans the whole entitlements table.
    const userIds = [...new Set(sends.map((s) => s.user_id).filter((x): x is string => !!x))];
    const partIds = parts.map((p) => p.id);
    let entitlements: EntitlementRow[] = [];
    let entTruncated = false;
    if (userIds.length > 0 && partIds.length > 0) {
      const res = await selectAllRowsMtproto<EntitlementRow>(
        () =>
          mtDb()
            .from("video_sequence_entitlements")
            .select("user_id,part_id,price_stars_paid,revoked_at")
            .in("part_id", partIds)
            .in("user_id", userIds)
            .order("id", { ascending: true }) as any,
        { label: "video_sequence_entitlements (bundle push)", maxRows: MAX_ENTITLEMENT_ROWS },
      );
      entitlements = res.rows;
      entTruncated = res.truncated;
    }

    return { available: true, error: null, truncated: sendRes.truncated || entTruncated, ...summarizeBundleResults(creators, configs, sends, parts, entitlements) };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return missingRelation(err) ? fail(false, null) : fail(true, err?.message ?? "unreadable");
  }
}
