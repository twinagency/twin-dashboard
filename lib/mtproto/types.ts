// lib/mtproto/types.ts
//
// Pure types + const lists for the MTProto Campaign area. This is a COPY of
// twin-userbot/src/contract.ts, not a cross-repo import (each repo owns its
// own copy on purpose — see that file's header). It MUST mirror the SQL CHECK
// constraints in twin-bot/db/migrations/158_reengage_mtproto.sql byte-for-byte
// in the ── STATES / SHAPES sections below. If either the migration or
// twin-userbot/src/contract.ts changes one of these lists, update this file in
// the same change. Everything below "DASHBOARD-ONLY" is not part of that
// mirror — it exists only on this side.
//
// Self-contained by design (2026-09-22 instruction): nothing here imports
// from outside lib/mtproto/.

// ── STATES (mirrors migration 158 CHECK constraints) ────────────────────────

export const EPISODE_STATES = [
  "eligible",
  "holdout",
  "claimed",
  "prepared",
  "sent",
  "acked",
  "failed",
  "uncertain",
  "cancelled",
  "replied",
  "skipped",
] as const;
export type EpisodeState = (typeof EPISODE_STATES)[number];

export const RUN_STATUSES = [
  "draft",
  "queued",
  "running",
  "paused",
  "stopped",
  "done",
  "failed",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const EVENT_TYPES = [
  "scan_eligible",
  "scan_excluded",
  "holdout_assigned",
  "claimed",
  "composed",
  "eligibility_recheck",
  "send_attempted",
  "send_acked",
  "send_failed",
  "send_uncertain",
  "reconciled_sent",
  "reconciled_not_sent",
  "cancelled",
  "fan_replied",
  "bot_responded",
  "offer_sent",
  "purchase",
  "opt_out",
  "block",
  "episode_closed",
  "account_halt",
  "control_action",
  "session_event",
  "config_change",
  "run_started",
  "run_finished",
  "dry_run_would_send",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Closed list the dashboard's exclusion breakdown uses (not a DB CHECK —
 *  scan_excluded.detail.reason is free-form jsonb). Mirrors
 *  twin-userbot/src/contract.ts EXCLUSION_REASONS. */
export const EXCLUSION_REASONS = [
  "blocked",
  "paused",
  "inactive",
  "minor_gated",
  "us_location",
  "opt_out",
  "already_contacted",
  "legacy_import",
  "no_chat_id",
  "within_24h",
  "privacy_restricted",
  "holdout",
  "other_sender",
  "cap_reached",
  "not_in_chats",
  "other",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

/** The subset of EXCLUSION_REASONS the dashboard's PREVIEW can actually
 *  compute ahead of any send (the prompt's exact breakdown list). Reasons
 *  left out here (privacy_restricted, other_sender, other) are only ever
 *  known at send time, from the worker's own error codes. */
export const PREVIEW_EXCLUSION_REASONS = [
  "blocked",
  "paused",
  "inactive",
  "minor_gated",
  "us_location",
  "opt_out",
  "already_contacted",
  "legacy_import",
  "no_chat_id",
  "within_24h",
  "holdout",
  "cap_reached",
  // Dashboard-only: users.is_test fans (migration 157) are the operator's own
  // test accounts. Not in the worker contract's EXCLUSION_REASONS on purpose.
  "test_account",
] as const satisfies readonly (ExclusionReason | "test_account")[];
export type PreviewExclusionReason = (typeof PREVIEW_EXCLUSION_REASONS)[number];

export const RUN_SEGMENTS = ["all_silent", "top_spenders", "lapsed_buyers", "never_bought"] as const;
export type RunSegment = (typeof RUN_SEGMENTS)[number];

// ── POLICY CONSTANTS (mirrors twin-userbot/src/contract.ts) ────────────────

export const COOLDOWN_HOURS = 24;
export const MIN_SILENCE_HOURS = 24;
export const DEFAULT_HOLDOUT_PCT = 0;
export const DEFAULT_DAILY_CAP = 30;
export const HARD_MAX_DAILY_CAP = 2400;

/** Mirrors the reengage_runs_message_variants_count CHECK (migration 20261015120000). */
export const MAX_MESSAGE_VARIANTS = 30;
export const MAX_REENGAGEMENT_MESSAGE_CHARS = 280;
/** Mirrors twin-userbot/src/compose.ts DEFAULT_REENGAGEMENT_VARIANTS. */
export const DEFAULT_REENGAGEMENT_VARIANTS = [
  "Hey how are you sweetie ?",
  "Hey sweetie how have you been ?",
  "Heyy how are you babe ?",
  "Hi sweetie, how are you ?",
  "Hey you, how have you been ?",
  "Hey babe how's everything going ?",
  "Hey sweetie, what have you been up to ?",
  "Heyy, how have you been lately ?",
  "Hi babe, how are things with you ?",
  "Hey you, how's your day going ?",
  "Hey stranger, how are you doing ?",
  "Hii how's your week been ?",
  "Hey babe, been a while, how are you ?",
  "Heyy what are you up to ?",
  "Hey you, how's life treating you ?",
  "Hi sweetie, how's your week going ?",
  "Hey hun, how have things been ?",
  "Heyy how's everything with you ?",
  "Hey babe, what's new with you ?",
  "Hi you, how are you doing lately ?",
  "Hey sweetie, hope you're doing good, how are you ?",
  "Hey hun, how's your day been ?",
  "Hi babe, what have you been up to lately ?",
  "Hey how's it going sweetie ?",
  "Heyy how are things babe ?",
  "Hey you, what's been happening ?",
  "Hi hun, how have you been doing ?",
  "Hey sweetie, how's everything going with you ?",
  "Hey babe, how are you feeling today ?",
  "Hii how have you been babe ?",
] as const;

// Dashboard-side bounds: allow 0% to disable hold-out entirely.
export const HOLDOUT_MIN_PCT = 0;
export const HOLDOUT_MAX_PCT = 20;
export const MAX_RUN_CAP = 10_000;
/** Mirrors twin-userbot/src/policy.ts DEFAULT_TOP_SPENDER_MIN_STARS. */
export const TOP_SPENDER_DEFAULT_MIN_STARS = 500;

/** Typed confirmations enforced SERVER-SIDE (the client input is a courtesy). */
export const CONFIRM_LIVE_PHRASE = "GO LIVE";
export const RESUME_PHRASE = "RESUME";

/** paused_reason written by the worker's spike detector (twin-userbot
 *  contract.ts SPIKE_PAUSE_REASON_PREFIX). A pause carrying it is an
 *  AUTO-HALT, distinct from an operator's manual pause. */
export const AUTO_HALT_PREFIX = "auto_halt_spike:";
export const AUTO_HALT_KINDS = ["optout_spike", "complaint_spike", "error_spike", "detector_error"] as const;

// LEGACY IMPORT DETECTION (verified 2026-09-22 against twin-bot migrations
// 081 and 123): the 57k fans carried over from the old n8n stack are exactly
// the `users` rows with legacy_id IS NOT NULL (081: "every row created
// natively here has NULL, only imported rows carry a value"; 123 measured
// 57,164 imported vs 8,216 native). first_seen_at is NOT a usable marker: the
// import stamped 2026-08-08 on all of them but native fans exist from
// 2026-07-28. A fan is legacy_import iff legacy_id is non-null; an unreadable
// value is treated as legacy (exclude when unsure).

// ── SHAPES (mirrors migration 158 columns) ──────────────────────────────────

export interface RunFilters {
  creatorIds?: string[];
  cloneIds?: string[];
  segment?: RunSegment;
  minSpendStars?: number;
  lastActiveFromDays?: number;
  lastActiveToDays?: number;
  language?: string;
  excludeIds?: string[];
  /** Mirrors twin-userbot/src/policy.ts MatchContext.includeLegacy. When true,
   *  a fan is not excluded for legacy_import (the ~57k fans imported from the
   *  old n8n stack, users.legacy_id IS NOT NULL). Default/undefined excludes
   *  them, same as before this field existed. */
  includeLegacy?: boolean;
}

export interface ReengageRun {
  allowRecontact?: boolean;
  photoCampaign?: import("./media-campaign").MediaBundleCampaign | null;
  id: string;
  createdAt: string;
  createdBy: string;
  status: RunStatus;
  dryRun: boolean;
  cloneIds: string[];
  filters: RunFilters;
  dailyCap: number;
  runCap: number | null;
  holdoutPct: number;
  messageVariants: string[];
  confirmLiveAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stopRequested: boolean;
  note: string | null;
}

export interface ReengageEpisode {
  id: string;
  runId: string;
  cloneId: string;
  /** NULL once the fan row was deleted (migration 163: FK ON DELETE SET NULL).
   *  The fan's real identity here is (cloneId, telegramId). */
  userId: string | null;
  telegramId: number;
  episodeStartInboundAt: string;
  state: EpisodeState;
  /** Set by a DB trigger from the run at insert, immutable; the dashboard never
   *  writes it. Anything other than an explicit false reads as dry (safe side). */
  dryRun: boolean;
  preparedText: string | null;
  ackedText: string | null;
  tgMessageId: number | null;
  claimedBy: string | null;
  claimedAt: string | null;
  sentAt: string | null;
  errorCode: string | null;
  skipReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReengageEvent {
  id: number;
  ts: string;
  runId: string | null;
  episodeId: string | null;
  cloneId: string | null;
  userId: string | null;
  eventType: EventType;
  actor: string;
  detail: Record<string, unknown>;
}

export const CONNECTION_STATUSES = ["disconnected", "connecting", "connected", "revoked", "error"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface UserbotConnection {
  cloneId: string;
  status: ConnectionStatus;
  tgUserId: number | null;
  dcId: number | null;
  lastSeenAt: string | null;
  /** Kill switch: a paused creator is skipped by the scan and by every send. */
  paused: boolean;
  pausedReason: string | null;
  dailyCap: number;
  /**
   * userbot_connections.live_enabled (migration 164), default FALSE. The
   * per-creator half of the live gate, owned by THIS dashboard. A real send
   * needs this AND a live-confirmed run AND a worker started with
   * REENGAGE_ALLOW_LIVE — see twin-userbot/src/config.ts canSendLive. False
   * means this creator is dry-run only: episodes still scan, compose and
   * record, nothing leaves the Telegram account. Anything other than an
   * explicit true reads as false.
   */
  liveEnabled: boolean;
  sessionRef: string | null;
  /** Dashboard-only: set by the worker's auto flood-wait handling when it
   *  exists (userbot_connections.paused_until, not part of migration 158/164).
   *  Read defensively: a DB without this column simply returns null forever,
   *  never an error (see lib/mtproto/connections.ts). Null unless the current
   *  pause is a timed one Telegram itself imposed. */
  pausedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── DASHBOARD-ONLY (not part of the cross-repo mirror) ──────────────────────

/** app_settings key the worker polls for kill-switch layer 1 (migration 158
 *  header comment). Not a new table, an existing app_settings row. */
export const GLOBAL_STOP_KEY = "mtproto_global_stop";

/**
 * app_settings key for the GLOBAL LIVE ARM (migration 165), the database half
 * of the worker's live gate 2. Same table, same mechanism and same read path
 * as GLOBAL_STOP_KEY above; the worker reads it in
 * twin-userbot/src/store.ts isGlobalLiveArmed, which hardcodes this same
 * string (check-mtproto J7 asserts the two spellings have not drifted).
 *
 * DEFAULT AND FAIL-SAFE: DISARMED. Only the exact text "true" arms.
 *
 * WHAT THIS REPLACED, SAID PLAINLY: arming live sending used to require the
 * env var REENGAGE_ALLOW_LIVE on the worker's own box, reachable only over
 * SSM. It now requires nothing but dashboard admin access. That is a smaller
 * gate than an out-of-band env var was, traded on purpose so live/dry can be
 * driven without a terminal. The compensations are that arming needs the typed
 * ARM_LIVE_PHRASE checked server-side, every change is logged to
 * reengage_events with the actor and before/after, disarming is always one
 * click, and the two OTHER gates (a live-confirmed run, and the per-creator
 * live_enabled switch) are untouched and still required.
 */
export const GLOBAL_LIVE_ARM_KEY = "mtproto_global_live_arm";

/** Typed confirmation for arming the fleet, enforced SERVER-SIDE in
 *  lib/mtproto/global-live-arm.ts (the input is a courtesy). Deliberately not
 *  "GO LIVE": that phrase belongs to a single run and a single creator, and
 *  must never double as consent for the whole fleet. DISARMING is never
 *  gated. */
export const ARM_LIVE_PHRASE = "ARM LIVE";

// ── MTPROTO LIMITS (migration 169/171: app_settings key 'mtproto_limits') ──
//
// Mirrors twin-userbot/src/contract.ts's MtprotoLimits + hard ranges exactly
// (same cross-repo mirror pattern as the rest of this file). The worker
// clamps into these ranges regardless of what the DB row says; the dashboard
// is expected to reject a write outside these before it ever reaches the
// table, which is what lib/mtproto/limits.ts's setMtprotoLimits does.

export const MTPROTO_LIMITS_KEY = "mtproto_limits";

export const HARD_MIN_HOURLY_CAP = 1;
export const HARD_MAX_HOURLY_CAP = 100;
export const HARD_MIN_DAILY_CAP = 1;
// HARD_MAX_DAILY_CAP above (400, migration 168) doubles as this range's ceiling.
export const MIN_SEND_SPACING_MS = 2_000;
export const HARD_MAX_JITTER_MS = 300_000;
export const HARD_MIN_MIN_SILENCE_HOURS = 1;
export const HARD_MAX_MIN_SILENCE_HOURS = 720;
export const HARD_MIN_FLOOD_WAIT_MULTIPLIER = 1;
export const HARD_MAX_FLOOD_WAIT_MULTIPLIER = 10;

// Three anti-burst floors, mirrors twin-userbot/src/contract.ts. Unlike every
// field above, 0 is a valid, meaningful setting here (off), not something
// clamped away as unsafe: these are NOT Telegram rules, they're an opt-in
// precaution added 2026-09-23 and off by default (see that repo's policy.ts
// header for the incident and why the cause is unconfirmed).
export const HARD_MIN_WARMUP_HOURS = 0;
export const HARD_MAX_WARMUP_HOURS = 48;
export const HARD_MIN_MIN_SEND_GAP_MINUTES = 0;
export const HARD_MAX_MIN_SEND_GAP_MINUTES = 60;
export const HARD_MIN_FIRST_DAY_MAX_SENDS = 0;
export const HARD_MAX_FIRST_DAY_MAX_SENDS = 400;

export interface MtprotoLimits {
  /** Sends per creator per rolling hour. Range [HARD_MIN_HOURLY_CAP, HARD_MAX_HOURLY_CAP]. */
  hourlyCap: number;
  /** Suggested starting per-run/connection daily cap. Range [HARD_MIN_DAILY_CAP, HARD_MAX_DAILY_CAP]. */
  defaultDailyCap: number;
  /** Floor of the human-like pacing jitter between sends, ms. Range [MIN_SEND_SPACING_MS, HARD_MAX_JITTER_MS]. */
  jitterMinMs: number;
  /** Ceiling of the jitter, ms. Range [jitterMinMs (resolved), HARD_MAX_JITTER_MS]. */
  jitterMaxMs: number;
  /** Hours a fan must be silent before becoming eligible. Range [HARD_MIN_MIN_SILENCE_HOURS, HARD_MAX_MIN_SILENCE_HOURS]. */
  minSilenceHours: number;
  /** Multiplied onto Telegram's own FLOOD_WAIT/SLOWMODE_WAIT/FLOOD_PREMIUM_WAIT seconds to
   *  compute userbot_connections.paused_until. Range [HARD_MIN_FLOOD_WAIT_MULTIPLIER, HARD_MAX_FLOOD_WAIT_MULTIPLIER]. */
  floodWaitMultiplier: number;
  /** Hours to hold back ALL live sends after a fresh login. 0 = off (default).
   *  Range [HARD_MIN_WARMUP_HOURS, HARD_MAX_WARMUP_HOURS]. */
  warmupHours: number;
  /** Minimum minutes between two live sends, same account, on top of
   *  jitterMinMs/jitterMaxMs/hourlyCap. 0 = off (default). Range
   *  [HARD_MIN_MIN_SEND_GAP_MINUTES, HARD_MAX_MIN_SEND_GAP_MINUTES]. */
  minSendGapMinutes: number;
  /** Cap on live sends inside the fixed 24h window after a fresh login. 0 =
   *  off (default). Range [HARD_MIN_FIRST_DAY_MAX_SENDS, HARD_MAX_FIRST_DAY_MAX_SENDS]. */
  firstDayMaxSends: number;
}

/** Built-in defaults, MUST match twin-bot migration 169/171's seed row byte
 *  for byte, so an unreadable DB read behaves identically to a fresh one.
 *  The three anti-burst floors are NOT in that seed row (no migration was
 *  needed for them, a missing JSON key just falls back to this default) but
 *  MUST still match twin-userbot/src/contract.ts's MTPROTO_LIMITS_DEFAULTS. */
export const MTPROTO_LIMITS_DEFAULTS: MtprotoLimits = {
  hourlyCap: 20,
  defaultDailyCap: DEFAULT_DAILY_CAP,
  jitterMinMs: 4_000,
  jitterMaxMs: 25_000,
  minSilenceHours: MIN_SILENCE_HOURS,
  floodWaitMultiplier: 2,
  warmupHours: 0,
  minSendGapMinutes: 0,
  firstDayMaxSends: 0,
};

export const ATTRIBUTION_WINDOWS_HOURS = [24, 72, 7 * 24] as const;
export type AttributionWindowHours = (typeof ATTRIBUTION_WINDOWS_HOURS)[number];

export interface CreatorLite {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused";
  businessUsername: string | null;
  /** clones.account_phone, operator record only. Used to prefill the phone
   *  login option; nothing else reads it (migration 170). */
  accountPhone: string | null;
}

export interface SampleFan {
  userId: string;
  telegramId: number;
  name: string | null;
  spendTier: string | null;
  totalSpentStars: number;
  lastMessageReceived: string | null;
  language: string | null;
}

export type ExclusionCounts = Record<PreviewExclusionReason, number>;

/** A creator whose connection is paused: none of its fans are previewed as
 *  sendable (the worker and migration 158's claim skip paused creators). */
export interface PausedCreatorPreview {
  cloneId: string;
  reason: string | null;
  /** True when the pause is a spike auto-halt, false for a manual pause. */
  autoHalted: boolean;
  /** Fans that matched the filters but will NOT be sent to: "paused: not sent". */
  notSent: number;
}

export interface AudiencePreview {
  /** Fans of NON-paused creators that matched the filters. Paused creators'
   *  fans are counted in pausedNotSent instead, never in eligible/excluded. */
  candidatePool: number;
  pausedCreators: PausedCreatorPreview[];
  pausedNotSent: number;
  eligible: number;
  holdout: number;
  excluded: ExclusionCounts;
  excludedTotal: number;
  sample: SampleFan[];
  truncated: boolean;
}

export interface OptOutRow {
  cloneId: string;
  cloneName: string;
  /** Unique fans with an acked real send. */
  contacted: number;
  /** Unique contacted fans with an opt_out event. */
  optedOut: number;
  /** optedOut / contacted, null when nobody was contacted. */
  rate: number | null;
}

export interface OptOutReport {
  total: OptOutRow;
  perCreator: OptOutRow[];
  /** Set when the opt_out events could not be read: figures are unknown, not zero. */
  error?: string;
  partial?: boolean;
}

export interface FunnelCounts {
  eligible: number;
  holdout: number;
  contacted: number;
  acknowledged: number;
  replied: number;
  bought: number;
  stars: number;
  /** True when a paged read was cut short: every figure is a lower bound. */
  partial?: boolean;
}

export interface LiftSide {
  /** Fans whose window has fully elapsed (a half-finished 7d window would
   *  understate whichever group was assigned more recently). */
  fans: number;
  replies: number;
  /** Fans with ANY paid order in the window. Same rule for contacted and
   *  hold-out, so buyerRate/starsPerFan are directly comparable (incremental). */
  buyers: number;
  stars: number;
  /** Contacted only (0 for hold-out): fans who replied to our send AND bought
   *  within the window (the N3 attribution rule), and their Stars. */
  attributedBuyers: number;
  attributedStars: number;
  replyRate: number;
  buyerRate: number;
  starsPerFan: number;
}

export interface LiftReport {
  windowHours: AttributionWindowHours;
  /** True when the purchase read was truncated: figures are lower bounds. */
  partial?: boolean;
  contacted: LiftSide;
  holdout: LiftSide;
}

/** Read-out of a spike auto-halt for the Connections page and Safety panel. */
export interface AutoHaltInfo {
  /** Suffix of paused_reason, e.g. "optout_spike". */
  kind: string;
  /** Short badge text, e.g. "Opt-out spike". */
  label: string;
  /** One sentence: what happened and what it means. */
  explanation: string;
  /** "3 of 12 sends opted out (25.0%)", from the latest account_halt event. */
  tripped: string | null;
  /** "trips at 10% or 3 opt-outs, minimum 10 sends", from the same event. */
  threshold: string | null;
  haltedAt: string | null;
  /** False when no matching account_halt event could be found (say so, do not guess). */
  eventFound: boolean;
}

export interface SafetySnapshot {
  /** connection paused (manual or auto). */
  paused: boolean;
  pausedReason: string | null;
  autoHalt: AutoHaltInfo | null;
  cloneId: string;
  cloneName: string;
  sentToday: number;
  dailyCap: number;
  floodWaitCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
  connectionStatus: ConnectionStatus;
  daysCleanSinceRestriction: number | null;
}

export interface SendRow {
  episodeId: string;
  cloneId: string;
  cloneName: string;
  /** NULL for a deleted fan (shown as "deleted fan"). */
  userId: string | null;
  telegramId: number;
  sentAt: string | null;
  text: string | null;
  state: EpisodeState;
  errorCode: string | null;
  repliedAt: string | null;
  boughtStars: number | null;
  boughtWithinHours: AttributionWindowHours | null;
  /** True for a dry run's simulated "would send" row: nothing left the
   *  Telegram account. Only ever true when buildSendRows was called with
   *  { includeDry: true } (its default excludes dry rows entirely). */
  dryRun: boolean;
}

