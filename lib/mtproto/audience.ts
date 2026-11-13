// lib/mtproto/audience.ts
//
// The audience preview engine (dashboard section 3: "Presses Preview -> sees
// eligible count, excluded count BROKEN DOWN BY REASON ... hold-out count,
// and up to 5 sample fans"). This runs BEFORE any reengage_runs/episodes row
// exists, so it independently re-derives the same eligibility policy
// (FULL-INFRA-SYSTEM-PLAN-2026-09-21.txt section B) the worker will apply —
// it does not read reengage_episodes as its source of truth for eligibility,
// only to detect a fan who was already given an episode for this exact
// silence stretch (already_contacted).
//
// PURE/IMPURE SPLIT (same pattern as lib/api-auth.ts + check-admin-api.ts):
// classifyFan() is a pure function over plain data so it can be driven from a
// test with zero Supabase and zero live tables. computeAudiencePreview() is
// the impure shell that reads Supabase and calls it per candidate row.
//
// GUESSES, called out explicitly (see also lib/mtproto/types.ts):
// - legacy_import is users.legacy_id IS NOT NULL (verified against twin-bot
//   migrations 081/123, see lib/mtproto/types.ts). NOT a first_seen_at cutoff.
// - "cap_reached" here orders survivors oldest-silence-first per creator and
//   keeps the first `effectiveCap` of them; the real worker's own ordering
//   may differ once it exists, so this is an ESTIMATE of what a run would
//   look like, not a claim the exact same fans will be picked in the exact
//   same order.
// - holdout at PREVIEW time is a size ESTIMATE (deterministic hash, no run id
//   exists yet); the real split happens per-episode once a run is created.

import { mtDb } from "./db";
import { selectAllRowsMtproto } from "./paging";
import { listConnections } from "./connections";
import { autoHaltKind } from "./halt";
import { isMissingTable, sanitizeFilters, uuidList, validateCaps } from "./validate";
import {
  MIN_SILENCE_HOURS,
  TOP_SPENDER_DEFAULT_MIN_STARS,
  type AudiencePreview,
  type ExclusionCounts,
  type PausedCreatorPreview,
  type PreviewExclusionReason,
  PREVIEW_EXCLUSION_REASONS,
  type RunFilters,
  type SampleFan,
} from "./types";

// The row shape this module reads off `users`. Narrow on purpose — this is
// not the dashboard's fan allowlist, it is exactly what the policy needs.
export type CandidateRow = {
  id: string;
  clone_id: string;
  telegram_id: number | null;
  name: string | null;
  language_code: string | null;
  blocked: boolean | null;
  blocked_reason: string | null;
  paused: boolean | null;
  is_active: boolean | null;
  minor_flagged_at: string | null;
  first_seen_at: string | null;
  /** Non-null = imported from the old n8n stack (twin-bot migration 081). */
  legacy_id: string | null;
  purchase_count: number | null;
  /** users.is_test (migration 157; the column may not exist yet, then undefined). */
  is_test?: boolean | null;
  last_message_received: string | null;
  total_spent_stars: number | null;
  spend_tier: string | null;
};

export type ClassifyContext = {
  nowMs: number;
  minSilenceHours: number;
  // A fan's identity inside one creator is (clone_id, telegram_id) since
  // migration 163 (users.id changes when a fan row is deleted and re-created,
  // the telegram id does not). null = the fan has no telegram id: nothing can
  // be keyed, so these answer false and the no_chat_id rule excludes the fan.
  isOptedOut: (cloneId: string, telegramId: number | null) => boolean;
  isAlreadyContacted: (cloneId: string, telegramId: number | null, episodeStartIso: string) => boolean;
  isWithinContactCooldown?: (cloneId: string, telegramId: number | null) => boolean;
  /** run.filters.includeLegacy (types.ts). When true, a fan is not excluded
   *  for legacy_import. Mirrors twin-userbot/src/policy.ts matchesFilters. */
  includeLegacy: boolean;
};

/** One fan in, one verdict out: a PreviewExclusionReason, or "eligible". Order
 *  below is the priority a fan is checked in — the FIRST matching reason is
 *  the one it is counted under, so a blocked+opted-out fan counts once, as
 *  "blocked" (blocked is checked first because it is the hardest stop). */
export function classifyFan(row: CandidateRow, ctx: ClassifyContext): PreviewExclusionReason | "eligible" {
  if (row.is_test === true) return "test_account"; // the operator's own manual test fans are never real audience
  if (row.blocked) {
    if (row.blocked_reason === "minor" || row.minor_flagged_at) return "minor_gated";
    if (row.blocked_reason === "us_location") return "us_location";
    return "blocked";
  }
  if (row.minor_flagged_at) return "minor_gated"; // defence in depth: gate survives even if `blocked` was ever cleared by hand
  if (row.paused) return "paused";
  if (row.is_active === false) return "inactive";
  if (ctx.isOptedOut(row.clone_id, row.telegram_id)) return "opt_out";
  if (!row.last_message_received) return "within_24h"; // never messaged in = no episode to open yet
  if (ctx.isWithinContactCooldown?.(row.clone_id, row.telegram_id)) return "within_24h";
  if (ctx.isAlreadyContacted(row.clone_id, row.telegram_id, row.last_message_received)) return "already_contacted";
  // Exclude when unsure: any non-null legacy_id (even "") marks an import.
  // includeLegacy (an explicit operator opt-in on the run) is the one escape
  // hatch, mirroring twin-userbot/src/policy.ts matchesFilters exactly.
  if (!ctx.includeLegacy && row.legacy_id !== null && row.legacy_id !== undefined) return "legacy_import";
  if (!row.telegram_id) return "no_chat_id";
  const silentMs = ctx.nowMs - new Date(row.last_message_received).getTime();
  if (silentMs < ctx.minSilenceHours * 3600_000) return "within_24h";
  return "eligible";
}

// Deterministic string hash (FNV-1a), used ONLY to give a stable, repeatable
// preview estimate across repeated Preview clicks with the same filters — not
// cryptographic, not the real per-episode assignment (that happens for real
// once a run exists, at episode-creation time).
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function isHoldout(seed: string, cloneId: string, userId: string, holdoutPct: number): boolean {
  return hash01(`${seed}:${cloneId}:${userId}`) < holdoutPct / 100;
}

/** One fan inside one creator (migration 163). String() so a bigint that
 *  arrives as a string and one that arrives as a number key identically. */
export function fanKey(cloneId: string, telegramId: number | string): string {
  return `${cloneId}:${telegramId}`;
}

/** ISO string -> epoch ms key part, so "…+00:00" and "…Z" spellings of the
 *  same instant compare equal. */
function tsKey(iso: string): number {
  return new Date(iso).getTime();
}

// Both reads below are paged by clone_id (never by a 50k-uuid IN list, which
// blows the request URL limit) and FAIL CLOSED: an error other than "table not
// created yet" throws, so the preview can never quietly treat opted-out fans
// as fine. (The worker's own unique key + opt-out check remain the real gate.)
async function optedOutSet(cloneIds: string[]): Promise<Set<string>> {
  try {
    // Keyed on telegram_id (NOT NULL), never user_id: after migration 163 a
    // deleted fan's opt-out survives with user_id NULL and must still exclude a
    // re-created fan row with the same telegram id.
    const { rows, truncated } = await selectAllRowsMtproto<{ clone_id: string; telegram_id: number }>(
      () =>
        mtDb()
          .from("reengage_optouts")
          .select("clone_id,telegram_id")
          .in("clone_id", cloneIds)
          .order("id", { ascending: true }) as any,
      { label: "reengage_optouts", maxRows: 200_000, throwOnError: true },
    );
    if (truncated) throw new Error("reengage_optouts read hit the row ceiling; refusing to preview with an incomplete opt-out list");
    return new Set(rows.map((r) => fanKey(r.clone_id, r.telegram_id)));
  } catch (e) {
    if (isMissingTable(e)) {
      console.warn(`[mtproto] reengage_optouts not created yet (migration 158 not applied): ${e instanceof Error ? e.message : e}`);
      return new Set();
    }
    throw e;
  }
}

async function alreadyContactedSet(cloneIds: string[]): Promise<{ keys: Set<string>; truncated: boolean }> {
  try {
    const { rows, truncated } = await selectAllRowsMtproto<{ clone_id: string; telegram_id: number; episode_start_inbound_at: string }>(
      () =>
        mtDb()
          .from("reengage_episodes")
          .select("clone_id,telegram_id,episode_start_inbound_at")
          .in("clone_id", cloneIds)
          // LIVE episodes only: a dry run's simulated episodes must never mark a
          // fan as already contacted (migration 158 scopes their dedupe to the run).
          .eq("dry_run", false)
          .order("id", { ascending: true }) as any,
      { label: "reengage_episodes (already-contacted check)", maxRows: 200_000, throwOnError: true },
    );
    return { keys: new Set(rows.map((r) => `${fanKey(r.clone_id, r.telegram_id)}:${tsKey(r.episode_start_inbound_at)}`)), truncated };
  } catch (e) {
    if (isMissingTable(e)) {
      console.warn(`[mtproto] reengage_episodes not created yet (migration 158 not applied): ${e instanceof Error ? e.message : e}`);
      return { keys: new Set(), truncated: false };
    }
    throw e;
  }
}

/** Same real-attempt states and rolling 24h clock as the worker. */
async function recontactCooldownSet(cloneIds: string[]): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { rows, truncated } = await selectAllRowsMtproto<{ clone_id: string; telegram_id: number; sent_at: string | null; claimed_at: string | null }>(
    () => mtDb().from("reengage_episodes").select("clone_id,telegram_id,sent_at,claimed_at")
      .in("clone_id", cloneIds).eq("dry_run", false)
      .or("and(state.eq.acked,tg_message_id.not.is.null),and(state.eq.replied,tg_message_id.not.is.null),state.eq.sent,state.eq.uncertain")
      .or(`sent_at.gte.${cutoff},claimed_at.gte.${cutoff}`)
      .order("id", { ascending: true }) as any,
    { label: "reengage_episodes (recontact cooldown)", maxRows: 200_000, throwOnError: true },
  );
  if (truncated) throw new Error("Recontact cooldown read was incomplete");
  const after = Date.parse(cutoff);
  return new Set(rows.filter(r => {
    const time = Date.parse(r.sent_at ?? r.claimed_at ?? "");
    return !Number.isFinite(time) || time > after;
  }).map(r => fanKey(r.clone_id, r.telegram_id)));
}

/** Mirrors twin-userbot/src/policy.ts matchesSegment/matchesFilters so the
 *  preview counts the same audience the worker will scan. lapsed_buyers is
 *  the worker's purchase_count > 0. never_bought is deliberately STRICTER
 *  than the worker (no Stars AND purchase_count 0): users.purchase_count is
 *  known to undercount buyers, and this side must never call a buyer "never
 *  bought". */
function applySegmentFilter(q: any, filters: RunFilters) {
  switch (filters.segment) {
    case "top_spenders":
      return q.gte("total_spent_stars", filters.minSpendStars ?? TOP_SPENDER_DEFAULT_MIN_STARS);
    case "lapsed_buyers":
      return q.gt("purchase_count", 0);
    case "never_bought":
      return q.eq("purchase_count", 0).eq("total_spent_stars", 0);
    case "all_silent":
    default:
      return q;
  }
}

/** True only for "users.is_test column does not exist" (Postgres 42703 or
 *  PostgREST's equivalent), never for any other failure. */
export function isMissingIsTestColumn(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const msg = String(err?.message ?? e ?? "");
  if (!/is_test/.test(msg)) return false;
  return err?.code === "42703" || err?.code === "PGRST204" || /does not exist|could not find/i.test(msg);
}

export async function computeAudiencePreview(
  filters: RunFilters,
  opts: { dailyCap: number; runCap: number | null; holdoutPct: number; seed?: string; allowRecontact?: boolean },
): Promise<AudiencePreview> {
  return (await computeAudience(filters, opts)).preview;
}

/** The preview plus WHO is in the audience (eligible + hold-out + over cap),
 *  as `clone_id:user_id` keys. Server-only: the review gate digests these. */
export async function computeAudience(
  filters: RunFilters,
  opts: { dailyCap: number; runCap: number | null; holdoutPct: number; seed?: string; allowRecontact?: boolean },
): Promise<{ preview: AudiencePreview; members: string[] }> {
  const cloneIds = uuidList(filters.cloneIds ?? filters.creatorIds ?? [], "cloneIds", 100);
  validateCaps({ dailyCap: opts.dailyCap, runCap: opts.runCap, holdoutPct: opts.holdoutPct });
  filters = sanitizeFilters(filters, cloneIds);
  const excluded: ExclusionCounts = Object.fromEntries(PREVIEW_EXCLUSION_REASONS.map((r) => [r, 0])) as ExclusionCounts;
  if (cloneIds.length === 0) {
    return { preview: { candidatePool: 0, pausedCreators: [], pausedNotSent: 0, eligible: 0, holdout: 0, excluded, excludedTotal: 0, sample: [], truncated: false }, members: [] };
  }

  const cols =
    "id,clone_id,telegram_id,name,language_code,blocked,blocked_reason,paused,is_active,minor_flagged_at,first_seen_at,legacy_id,purchase_count,last_message_received,total_spent_stars,spend_tier";

  const makeQuery = (withIsTest: boolean) => () => {
    // Typed `any` from the first call on purpose: chaining this many filters
    // onto supabase-js's own generic builder type (which parses `cols` at the
    // type level) blows past TS's instantiation depth limit (TS2589). The
    // runtime behaviour is unaffected — CandidateRow is the real, checked
    // shape this function returns to its caller.
    let q: any = mtDb().from("users").select(withIsTest ? `${cols},is_test` : cols).in("clone_id", cloneIds).not("last_message_received", "is", null);
    q = applySegmentFilter(q, filters);
    if (filters.minSpendStars) q = q.gte("total_spent_stars", filters.minSpendStars);
    if (filters.language) q = q.eq("language_code", filters.language);
    // excludeIds are UUID-validated by sanitizeFilters, so this string can
    // only ever contain hex and dashes.
    if (filters.excludeIds?.length) q = q.not("id", "in", `(${filters.excludeIds.join(",")})`);
    // lastActiveToDays bounds the SILENCE window from above (drop fans quiet
    // longer than that) — a candidate-pool narrowing, not one of the fixed
    // exclusion-reason buckets, same treatment as segment/spend/language.
    if (filters.lastActiveToDays != null) {
      const cutoff = new Date(Date.now() - filters.lastActiveToDays * 86_400_000).toISOString();
      q = q.gte("last_message_received", cutoff);
    }
    // id tiebreaker: without it rows sharing a timestamp can be skipped or
    // duplicated across .range() pages.
    return q.order("last_message_received", { ascending: true }).order("id", { ascending: true }) as any;
  };

  // users.is_test is read when it exists. ONLY a "column does not exist" error
  // on is_test falls back to the base columns (migration 157 not applied); any
  // other read error throws, so the preview never fails open.
  const readUsers = (withIsTest: boolean) =>
    selectAllRowsMtproto<CandidateRow>(makeQuery(withIsTest), {
      label: "users (mtproto audience candidates)",
      maxRows: 50_000,
      throwOnError: true,
    });
  let usersRead: { rows: CandidateRow[]; truncated: boolean };
  try {
    usersRead = await readUsers(true);
  } catch (e) {
    if (!isMissingIsTestColumn(e)) throw e;
    console.warn("[mtproto] users.is_test not present (migration 157 not applied); previewing without the test-account filter");
    usersRead = await readUsers(false);
  }
  const { rows, truncated } = usersRead;

  // A creator whose connection is paused (manual or spike auto-halt) sends
  // nothing: the worker and migration 158's claim skip it. Read fails CLOSED
  // (listConnections throws on anything but a missing table).
  const connections = await listConnections();
  const pausedConn = new Map(connections.filter((c) => c.paused && cloneIds.includes(c.cloneId)).map((c) => [c.cloneId, c]));

  const [optOuts, contactedRead, recentContacts] = await Promise.all([
    optedOutSet(cloneIds),
    opts.allowRecontact ? Promise.resolve({ keys: new Set<string>(), truncated: false }) : alreadyContactedSet(cloneIds),
    opts.allowRecontact ? recontactCooldownSet(cloneIds) : Promise.resolve(new Set<string>()),
  ]);
  const contacted = contactedRead.keys;

  const nowMs = Date.now();
  const minSilenceHours = Math.max(MIN_SILENCE_HOURS, filters.lastActiveFromDays ? filters.lastActiveFromDays * 24 : 0);
  const ctx: ClassifyContext = {
    nowMs,
    minSilenceHours,
    isOptedOut: (c, t) => t != null && optOuts.has(fanKey(c, t)),
    isWithinContactCooldown: (c, t) => t != null && recentContacts.has(fanKey(c, t)),
    isAlreadyContacted: (c, t, iso) => t != null && contacted.has(`${fanKey(c, t)}:${tsKey(iso)}`),
    includeLegacy: filters.includeLegacy === true,
  };

  const seed = opts.seed ?? "preview";
  const survivorsByClone = new Map<string, CandidateRow[]>();
  let holdoutCount = 0;

  const pausedCounts = new Map<string, number>();
  const members: string[] = [];
  let poolRows = 0;
  for (const row of rows) {
    if (pausedConn.has(row.clone_id)) {
      pausedCounts.set(row.clone_id, (pausedCounts.get(row.clone_id) ?? 0) + 1);
      continue; // "paused: not sent": not eligible, not hold-out, not an exclusion reason
    }
    poolRows += 1;
    const verdict = classifyFan(row, ctx);
    if (verdict !== "eligible") {
      excluded[verdict] += 1;
      continue;
    }
    members.push(`${row.clone_id}:${row.id}`);
    if (isHoldout(seed, row.clone_id, row.id, opts.holdoutPct)) {
      holdoutCount += 1;
      excluded.holdout += 1;
      continue;
    }
    const list = survivorsByClone.get(row.clone_id) ?? [];
    list.push(row);
    survivorsByClone.set(row.clone_id, list);
  }

  // A run sends at most dailyCap per creator per day and runCap in total, so
  // the first-day estimate is the smaller of the two (not runCap alone).
  const effectiveCap = Math.min(opts.dailyCap, opts.runCap ?? Infinity);
  let eligible = 0;
  const kept: CandidateRow[] = [];
  for (const [, list] of survivorsByClone) {
    // Already ordered oldest-silence-first from the query's ORDER BY.
    const within = list.slice(0, effectiveCap);
    const over = list.length - within.length;
    excluded.cap_reached += Math.max(0, over);
    eligible += within.length;
    kept.push(...within);
  }

  const sample: SampleFan[] = kept.slice(0, 5).map((r) => ({
    userId: r.id,
    telegramId: r.telegram_id ?? 0,
    name: r.name,
    spendTier: r.spend_tier,
    totalSpentStars: r.total_spent_stars ?? 0,
    lastMessageReceived: r.last_message_received,
    language: r.language_code,
  }));

  const excludedTotal = (Object.values(excluded) as number[]).reduce((a, b) => a + b, 0);
  const pausedCreators: PausedCreatorPreview[] = [...pausedConn.values()].map((c) => ({
    cloneId: c.cloneId,
    reason: c.pausedReason,
    autoHalted: autoHaltKind(c.pausedReason) !== null,
    notSent: pausedCounts.get(c.cloneId) ?? 0,
  }));
  const pausedNotSent = pausedCreators.reduce((a, p) => a + p.notSent, 0);
  return { preview: { candidatePool: poolRows, pausedCreators, pausedNotSent, eligible, holdout: holdoutCount, excluded, excludedTotal, sample, truncated: truncated || contactedRead.truncated }, members };
}

