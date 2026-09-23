// components/mtproto/view.ts
//
// Pure view-model helpers for the MTProto Campaign screens: plain-language
// labels, tones and small derived numbers. Presentation only. Nothing here
// reads the database, gates a send or changes what a number means; internal
// names (states, reason codes, error codes) stay as they are and are only
// translated for the operator's eyes. No em dashes in any visible string.

import type { EpisodeState, FunnelCounts, LiftReport, RunSegment, RunStatus, UserbotConnection } from "@/lib/mtproto/types";

export type Tone = "neutral" | "good" | "warn" | "crit" | "info" | "accent";

export const SEGMENT_LABEL: Record<RunSegment, string> = {
  all_silent: "All silent fans",
  top_spenders: "Top spenders",
  lapsed_buyers: "Lapsed buyers",
  never_bought: "Never bought",
};

// ── numbers ──────────────────────────────────────────────────────────────────

export const num = (n: number) => n.toLocaleString("en-US");

/** 0..1 ratio to "12.5%"; null/NaN reads as a dash, never as 0%. */
export function pct(r: number | null | undefined, digits = 1): string {
  if (r == null || !Number.isFinite(r)) return "n/a";
  return `${(r * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
}

/** Whole-number share of `part` in `whole`, or null when there is no whole. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

// ── time ─────────────────────────────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

// ── runs ─────────────────────────────────────────────────────────────────────

export const RUN_STATUS_INFO: Record<RunStatus, { label: string; tone: Tone; hint: string }> = {
  draft: { label: "Draft", tone: "neutral", hint: "Created but not started yet." },
  queued: { label: "Waiting to start", tone: "info", hint: "Ready. The sender picks it up on its next check." },
  running: { label: "Running", tone: "good", hint: "Messages are going out now, within the daily caps." },
  paused: { label: "Paused", tone: "warn", hint: "On hold. Nothing is sent until it is started again." },
  stopped: { label: "Stopped", tone: "crit", hint: "Someone pressed Stop. No new messages will be sent." },
  done: { label: "Finished", tone: "neutral", hint: "Every message in this run has been handled." },
  failed: { label: "Failed", tone: "crit", hint: "The run hit an error and ended early." },
};

/** Runs whose messages can still go out for real. */
export function runIsSendingLive(run: { dryRun: boolean; status: RunStatus; stopRequested: boolean }): boolean {
  return !run.dryRun && !run.stopRequested && (run.status === "queued" || run.status === "running" || run.status === "paused");
}

// ── sends ────────────────────────────────────────────────────────────────────

export const SEND_STATE_INFO: Partial<Record<EpisodeState, { label: string; tone: Tone; hint: string }>> = {
  eligible: { label: "Lined up", tone: "neutral", hint: "Chosen to be messaged, not sent yet." },
  holdout: { label: "Held back", tone: "neutral", hint: "Deliberately not messaged, so results can be compared." },
  claimed: { label: "Preparing", tone: "info", hint: "The sender has picked this fan up." },
  prepared: { label: "Ready to send", tone: "info", hint: "The message is written and about to go." },
  sent: { label: "Sent", tone: "info", hint: "Sent, waiting for Telegram to confirm." },
  acked: { label: "Acknowledged", tone: "good", hint: "Telegram accepted the message. This is not proof the fan saw it." },
  replied: { label: "Replied", tone: "good", hint: "The fan answered." },
  failed: { label: "Failed", tone: "crit", hint: "Telegram refused the message." },
  uncertain: { label: "Unclear", tone: "warn", hint: "We could not tell if it went out. It is being double-checked." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "Cancelled before it was sent." },
  skipped: { label: "Skipped", tone: "neutral", hint: "Left out at send time by a safety check." },
};

export function sendState(state: string): { label: string; tone: Tone; hint: string } {
  return SEND_STATE_INFO[state as EpisodeState] ?? { label: state.replaceAll("_", " "), tone: "neutral", hint: "" };
}

const ERROR_TEXT: Record<string, string> = {
  PEER_FLOOD: "Telegram says this account is sending too much",
  FLOOD_WAIT: "Telegram asked this account to slow down",
  USER_PRIVACY_RESTRICTED: "The fan's privacy settings block messages",
  USER_IS_BLOCKED: "The fan blocked this account",
  PEER_ID_INVALID: "Telegram could not find this fan",
  PEER_NOT_RESOLVED: "Telegram could not find this fan",
  INPUT_USER_DEACTIVATED: "The fan's account is deleted",
  USER_DEACTIVATED: "The fan's account is deleted",
  AUTH_KEY_UNREGISTERED: "The Telegram login for this creator expired",
  SESSION_REVOKED: "The Telegram login for this creator was signed out",
};

/** Plain sentence for a raw Telegram/worker error code. The code stays visible
 *  to the caller (small, monospace) so nothing is hidden. */
export function humanError(code: string): string {
  const upper = code.toUpperCase();
  for (const key of Object.keys(ERROR_TEXT)) if (upper.includes(key)) return ERROR_TEXT[key];
  return "Something went wrong sending this message";
}

// ── exclusions (why a fan was left out) ──────────────────────────────────────

export const EXCLUSION_INFO: Record<string, { label: string; why: string }> = {
  blocked: { label: "Blocked the creator", why: "The fan blocked the creator's bot, so a message cannot reach them." },
  paused: { label: "Creator paused", why: "This creator's sending is paused." },
  inactive: { label: "Creator inactive", why: "The creator is switched off." },
  minor_gated: { label: "Possible minor", why: "Kept out on purpose by the age safety check." },
  us_location: { label: "In the US", why: "Kept out on purpose because of the US location rule." },
  opt_out: { label: "Asked us to stop", why: "The fan said stop or unsubscribe before. Never contacted again." },
  already_contacted: { label: "Messaged recently", why: "Already got a re-engagement message in this silence, so no second one." },
  legacy_import: { label: "From the old system", why: "Imported from the old n8n stack, so we skip them." },
  no_chat_id: { label: "No chat to message", why: "We have no chat with this fan to write into." },
  within_24h: { label: "Wrote in the last 24 hours", why: "Not silent yet. Silent fans only, at least a day of quiet." },
  privacy_restricted: { label: "Privacy blocks messages", why: "The fan's Telegram privacy settings refuse messages from this account." },
  other_sender: { label: "Someone else messaged them", why: "Another sender already reached this fan." },
  holdout: { label: "Held back on purpose", why: "The control group, kept out so we can measure if messaging works." },
  cap_reached: { label: "Over the daily cap", why: "The creator's daily limit is already used up." },
  test_account: { label: "Test account", why: "One of the operator's own test fans." },
  other: { label: "Other reason", why: "Left out for a reason not in the usual list." },
};

export function exclusion(reason: string): { label: string; why: string } {
  return EXCLUSION_INFO[reason] ?? { label: reason.replaceAll("_", " "), why: "" };
}

// ── funnel ───────────────────────────────────────────────────────────────────

export type FunnelStage = { key: string; label: string; tip: string; value: number; ofPrev: number | null };

/** The five people-stages, each with its share of the stage before. Stars and
 *  hold-out are shown separately by the caller. Numbers pass through untouched. */
export function funnelStages(f: FunnelCounts): FunnelStage[] {
  const raw: Omit<FunnelStage, "ofPrev">[] = [
    { key: "eligible", label: "Could be messaged", tip: "Silent fans picked for these runs, including the hold-out group.", value: f.eligible },
    { key: "contacted", label: "Messaged", tip: "Fans who got a real re-engagement message.", value: f.contacted },
    { key: "acknowledged", label: "Acknowledged", tip: "Telegram accepted the message. It does not prove the fan saw it.", value: f.acknowledged },
    { key: "replied", label: "Replied", tip: "Fans who answered the message.", value: f.replied },
    { key: "bought", label: "Bought", tip: "Fans who replied and then bought within 7 days.", value: f.bought },
  ];
  return raw.map((s, i) => ({ ...s, ofPrev: i === 0 ? null : share(s.value, raw[i - 1].value) }));
}

// ── lift ─────────────────────────────────────────────────────────────────────

/** Fewest fans in EACH group before a difference is worth reading. Below this a
 *  couple of lucky buyers swing the percentages wildly. */
export const MIN_LIFT_FANS = 30;

export function liftReadiness(r: LiftReport): { enough: boolean; contacted: number; holdout: number; missing: number } {
  const c = r.contacted.fans;
  const h = r.holdout.fans;
  return { enough: c >= MIN_LIFT_FANS && h >= MIN_LIFT_FANS, contacted: c, holdout: h, missing: Math.max(0, MIN_LIFT_FANS - Math.min(c, h)) };
}

/** Contacted minus hold-out. Buyer rate difference is in percentage points. */
export function liftDelta(r: LiftReport): { buyerPoints: number; starsPerFan: number } {
  return {
    buyerPoints: (r.contacted.buyerRate - r.holdout.buyerRate) * 100,
    starsPerFan: r.contacted.starsPerFan - r.holdout.starsPerFan,
  };
}

export const WINDOW_LABEL: Record<number, string> = { 24: "Within 24 hours", 72: "Within 3 days", 168: "Within 7 days" };

// ── connections ──────────────────────────────────────────────────────────────

export const CONNECTION_INFO: Record<UserbotConnection["status"], { label: string; tone: Tone; hint: string }> = {
  connected: { label: "Connected", tone: "good", hint: "The creator's own Telegram login is online and ready." },
  connecting: { label: "Connecting", tone: "info", hint: "Signing in to Telegram now." },
  disconnected: { label: "Not connected", tone: "neutral", hint: "No Telegram login is online for this creator, so nothing can be sent." },
  revoked: { label: "Signed out", tone: "crit", hint: "The creator signed this login out of Telegram. It must be set up again." },
  error: { label: "Error", tone: "crit", hint: "The login hit an error. Nothing can be sent until it is fixed." },
};

// ── avatars ──────────────────────────────────────────────────────────────────

/** Stable index from a string, so a creator keeps the same colour everywhere. */
export function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ── live feed ────────────────────────────────────────────────────────────────

export const EVENT_INFO: Record<string, { label: string; tone: Tone }> = {
  scan_eligible: { label: "Fan picked", tone: "neutral" },
  scan_excluded: { label: "Fan left out", tone: "neutral" },
  holdout_assigned: { label: "Held back", tone: "neutral" },
  claimed: { label: "Fan picked up", tone: "neutral" },
  composed: { label: "Message written", tone: "info" },
  eligibility_recheck: { label: "Safety re-check", tone: "neutral" },
  send_attempted: { label: "Sending", tone: "info" },
  send_acked: { label: "Message acknowledged", tone: "good" },
  send_failed: { label: "Send failed", tone: "crit" },
  send_uncertain: { label: "Send unclear", tone: "warn" },
  reconciled_sent: { label: "Confirmed sent", tone: "good" },
  reconciled_not_sent: { label: "Confirmed not sent", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  fan_replied: { label: "Fan replied", tone: "good" },
  bot_responded: { label: "Bot answered", tone: "info" },
  offer_sent: { label: "Offer sent", tone: "info" },
  purchase: { label: "Purchase", tone: "good" },
  opt_out: { label: "Fan opted out", tone: "crit" },
  block: { label: "Fan blocked us", tone: "crit" },
  episode_closed: { label: "Fan finished", tone: "neutral" },
  account_halt: { label: "Account halted", tone: "crit" },
  control_action: { label: "Operator action", tone: "accent" },
  session_event: { label: "Login event", tone: "neutral" },
  config_change: { label: "Setting changed", tone: "neutral" },
  run_started: { label: "Run started", tone: "info" },
  run_finished: { label: "Run finished", tone: "neutral" },
  dry_run_would_send: { label: "Would send (dry run)", tone: "info" },
};

export function eventInfo(type: string): { label: string; tone: Tone } {
  return EVENT_INFO[type] ?? { label: type.replaceAll("_", " "), tone: "neutral" };
}

// ── run timeline ─────────────────────────────────────────────────────────────

export type TimelineStep = { key: string; label: string; at: string | null; note?: string; state: "done" | "now" | "todo" | "bad" };

/** Milestones of one run, from fields the run already carries. `reviewedAt` is
 *  when the operator pressed "I reviewed this dry run" (null if not yet). */
export function buildRunTimeline(
  run: { dryRun: boolean; status: RunStatus; stopRequested: boolean; createdAt: string; createdBy: string; startedAt: string | null; finishedAt: string | null; confirmLiveAt: string | null },
  reviewedAt: string | null,
): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: "created", label: "Run created", at: run.createdAt, note: `by ${run.createdBy}`, state: "done" },
    {
      key: "started",
      label: run.dryRun ? "Dry run started" : "Sending started",
      at: run.startedAt,
      state: run.startedAt ? "done" : "todo",
    },
  ];
  const ended = run.status === "done" || run.status === "stopped" || run.status === "failed" || !!run.finishedAt;
  if (run.dryRun) {
    steps.push({ key: "dry-done", label: "Dry run finished, nothing was sent", at: run.status === "done" ? run.finishedAt : null, state: run.status === "done" ? "done" : "todo" });
    steps.push({ key: "reviewed", label: "You reviewed the dry run", at: reviewedAt, state: reviewedAt ? "done" : "todo" });
  }
  steps.push({ key: "live", label: "Went live", at: run.confirmLiveAt, state: run.confirmLiveAt ? "done" : "todo" });
  if (run.stopRequested || run.status === "stopped") {
    steps.push({ key: "end", label: "Stopped", at: run.finishedAt, note: "No new messages will be sent.", state: "bad" });
  } else if (run.status === "failed") {
    steps.push({ key: "end", label: "Failed", at: run.finishedAt, state: "bad" });
  } else if (!run.dryRun) {
    steps.push({ key: "end", label: "Finished", at: ended ? run.finishedAt : null, state: ended ? "done" : "todo" });
  }
  // The first step not yet done is "now", unless the run already ended badly.
  const next = steps.findIndex((s) => s.state === "todo");
  if (next >= 0 && !ended && (run.status === "running" || run.status === "queued" || run.status === "paused")) steps[next] = { ...steps[next], state: "now" };
  return steps;
}
