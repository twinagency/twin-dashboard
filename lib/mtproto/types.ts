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
] as const satisfies readonly ExclusionReason[];
export type PreviewExclusionReason = (typeof PREVIEW_EXCLUSION_REASONS)[number];

export const RUN_SEGMENTS = ["all_silent", "top_spenders", "lapsed_buyers", "never_bought"] as const;
export type RunSegment = (typeof RUN_SEGMENTS)[number];

// ── POLICY CONSTANTS (mirrors twin-userbot/src/contract.ts) ────────────────

export const COOLDOWN_HOURS = 24;
export const MIN_SILENCE_HOURS = 24;
export const DEFAULT_HOLDOUT_PCT = 15;
export const DEFAULT_DAILY_CAP = 30;
export const HARD_MAX_DAILY_CAP = 100;

/** Fans created before the n8n -> Twin cutover (twin-bot/CLAUDE.md: "finished
 *  2026-08-09/10 ... the n8n servers are deleted") have first_seen_at values
 *  carried over from the import rather than a genuine first contact, which is
 *  what plan section B calls "forged legacy-import timestamps (57k legacy
 *  imports)". There is no dedicated legacy-import column in the schema, so
 *  this cutoff is a GUESS standing in for one — confirm with Jesse/Ronan
 *  before relying on it for anything beyond a dashboard exclusion count. */
export const LEGACY_IMPORT_CUTOFF_ISO = "2026-08-10T00:00:00Z";

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
}

export interface ReengageRun {
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
  userId: string;
  telegramId: number;
  episodeStartInboundAt: string;
  state: EpisodeState;
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
  paused: boolean;
  pausedReason: string | null;
  dailyCap: number;
  sessionRef: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── DASHBOARD-ONLY (not part of the cross-repo mirror) ──────────────────────

/** app_settings key the worker polls for kill-switch layer 1 (migration 158
 *  header comment). Not a new table, an existing app_settings row. */
export const GLOBAL_STOP_KEY = "mtproto_global_stop";

export const ATTRIBUTION_WINDOWS_HOURS = [24, 72, 7 * 24] as const;
export type AttributionWindowHours = (typeof ATTRIBUTION_WINDOWS_HOURS)[number];

export interface CreatorLite {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused";
  businessUsername: string | null;
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

export interface AudiencePreview {
  candidatePool: number;
  eligible: number;
  holdout: number;
  excluded: ExclusionCounts;
  excludedTotal: number;
  sample: SampleFan[];
  truncated: boolean;
}

export interface FunnelCounts {
  eligible: number;
  holdout: number;
  contacted: number;
  delivered: number;
  replied: number;
  bought: number;
  stars: number;
}

export interface LiftSide {
  fans: number;
  replies: number;
  buyers: number;
  stars: number;
  replyRate: number;
  buyerRate: number;
  starsPerFan: number;
}

export interface LiftReport {
  windowHours: AttributionWindowHours;
  contacted: LiftSide;
  holdout: LiftSide;
}

export interface SafetySnapshot {
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
  userId: string;
  telegramId: number;
  sentAt: string | null;
  text: string | null;
  state: EpisodeState;
  errorCode: string | null;
  repliedAt: string | null;
  boughtStars: number | null;
  boughtWithinHours: AttributionWindowHours | null;
}
