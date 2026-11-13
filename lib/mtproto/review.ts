// lib/mtproto/review.ts
//
// The DRY-RUN REVIEW GATE's read side. confirmLive() (runs.ts) refuses unless a
// human recorded "I reviewed this dry run" for the run AND nothing they
// reviewed has changed since. This module computes what they review and what
// "changed" means; runs.ts records the review and enforces the gate.
//
// Storage: no schema change. A review is a reengage_events row of type
// control_action with detail { kind: "dry_run_reviewed", run_id,
// would_send_count, holdout_count, episode_count, excluded_total,
// audience_size, audience_digest }. reviewed_at is the event's ts, reviewed_by its actor. The
// table is append-only; the LATEST review event wins.
//
// Every read here is strict: an unreadable table throws (the gate then
// refuses), it never degrades to "0 rows, nothing changed".

import { hash } from "node:crypto";
import { mediaCampaignReviewKey } from "./media-campaign";
import { mtDb } from "./db";
import { computeAudience } from "./audience";
import { listEvents } from "./events";
import { listConnections } from "./connections";
import { selectAllRowsMtproto } from "./paging";
import type { ReengageRun } from "./types";

export const REVIEW_KIND = "dry_run_reviewed";
export const MAX_SAMPLE = 25;

export type DryRunCounts = {
  /** Simulated sends: dry episodes that reached acked (a "would send"). */
  wouldSendCount: number;
  /** Dry episodes assigned to the hold-out. */
  holdoutCount: number;
  /** All dry episodes of the run, any state. */
  episodeCount: number;
  /** scan_excluded events + skipped/cancelled dry episodes. */
  excludedTotal: number;
};

export type SampleMessage = { who: string; text: string };

export type DryRunSummary = DryRunCounts & {
  runId: string;
  excludedByReason: Record<string, number>;
  /** Up to 25 composed messages, fan names redacted. */
  sample: SampleMessage[];
  /** When names could not be read, sample texts are withheld rather than shown unredacted. */
  sampleWithheld: boolean;
  wouldSendByClone: { cloneId: string; count: number }[];
  truncated: boolean;
};

type DryEpisodeRow = {
  id: string;
  clone_id: string;
  /** NULL once the fan row was deleted (migration 163). */
  user_id: string | null;
  telegram_id: number | null;
  state: string;
  dry_run: boolean | null;
  prepared_text: string | null;
  acked_text: string | null;
  skip_reason: string | null;
  error_code: string | null;
  tg_message_id: number | null;
};

/** "M. ...a1b2" : first initial of the fan's name plus the last 4 of the id. */
export function redactFan(name: string | null | undefined, userId: string | null, telegramId?: number | null): string {
  // A deleted fan (user_id NULL, migration 163) has no name to read, and its
  // users.id is gone: label it as such with the last 4 of the telegram id.
  if (userId == null) return `deleted fan …${telegramId != null ? String(telegramId).slice(-4) : "????"}`;
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  return `${initial}. …${userId.slice(-4)}`;
}

/** Removes every name part (2+ chars) from a composed message. */
export function redactText(text: string, name: string | null | undefined): string {
  let out = text;
  const parts = (name ?? "").split(/\s+/).filter((p) => p.length >= 2);
  for (const part of parts) {
    const esc = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(esc, "gi"), "[name]");
  }
  return out;
}

export async function computeDryRunSummary(runId: string): Promise<DryRunSummary> {
  const ep = await selectAllRowsMtproto<DryEpisodeRow>(
    () =>
      mtDb()
        .from("reengage_episodes")
        .select("id,clone_id,user_id,telegram_id,state,dry_run,prepared_text,acked_text,skip_reason,error_code,tg_message_id")
        .eq("run_id", runId)
        .eq("dry_run", true)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }) as any,
    { label: `dry-run episodes run=${runId}`, maxRows: 50_000, throwOnError: true },
  );
  const ex = await selectAllRowsMtproto<{ detail: Record<string, unknown> | null }>(
    () =>
      mtDb()
        .from("reengage_events")
        .select("detail")
        .eq("run_id", runId)
        .eq("event_type", "scan_excluded")
        .order("id", { ascending: true }) as any,
    { label: `scan_excluded events run=${runId}`, maxRows: 100_000, throwOnError: true },
  );

  const excludedByReason: Record<string, number> = {};
  const bump = (k: string) => (excludedByReason[k] = (excludedByReason[k] ?? 0) + 1);
  for (const e of ex.rows) bump(typeof e.detail?.reason === "string" ? (e.detail.reason as string) : "other");

  let wouldSend = 0;
  let holdout = 0;
  const wouldSendRows: DryEpisodeRow[] = [];
  const byClone = new Map<string, number>();
  for (const r of ep.rows) {
    if (r.state === "holdout") holdout += 1;
    else if (r.state === "acked" && r.tg_message_id == null) {
      wouldSend += 1;
      wouldSendRows.push(r);
      byClone.set(r.clone_id, (byClone.get(r.clone_id) ?? 0) + 1);
    } else if (r.state === "skipped" || r.state === "cancelled") bump(r.skip_reason ?? r.state);
  }
  const excludedTotal = Object.values(excludedByReason).reduce((a, b) => a + b, 0);

  // Sample: first MAX_SAMPLE would-sends, names redacted. Names come from users
  // (ids bounded to <= 25); if they cannot be read the texts are withheld.
  const picked = wouldSendRows.slice(0, MAX_SAMPLE);
  let sampleWithheld = false;
  const names = new Map<string, string | null>();
  const pickedIds = [...new Set(picked.map((r) => r.user_id).filter((u): u is string => u != null))];
  if (pickedIds.length > 0) {
    const { data, error } = await mtDb().from("users").select("id,name").in("id", pickedIds);
    if (error) sampleWithheld = true;
    else for (const u of (data ?? []) as { id: string; name: string | null }[]) names.set(u.id, u.name);
  }
  const sample: SampleMessage[] = sampleWithheld
    ? []
    : picked.map((r) => ({
        who: redactFan(r.user_id != null ? names.get(r.user_id) : null, r.user_id, r.telegram_id),
        // A deleted fan's name is unknown, so the text cannot be redacted: withhold it
        // rather than show a message that may still contain the name.
        text: r.user_id == null ? "[text withheld: the fan was deleted, so the name cannot be removed]" : redactText(r.acked_text ?? r.prepared_text ?? "", names.get(r.user_id)),
      }));

  return {
    runId,
    wouldSendCount: wouldSend,
    holdoutCount: holdout,
    episodeCount: ep.rows.length,
    excludedTotal,
    excludedByReason,
    sample,
    sampleWithheld,
    wouldSendByClone: [...byClone.entries()].map(([cloneId, count]) => ({ cloneId, count })),
    truncated: ep.truncated || ex.truncated,
  };
}

export function countsOf(s: DryRunCounts): DryRunCounts {
  return { wouldSendCount: s.wouldSendCount, holdoutCount: s.holdoutCount, episodeCount: s.episodeCount, excludedTotal: s.excludedTotal };
}

/** The audience that passes every filter right now (before hold-out and
 *  caps): its size and a digest of WHO is in it (sorted clone:user keys), so
 *  an equal-size swap reads as changed. Throws when the read is incomplete. */
export async function currentAudience(run: ReengageRun): Promise<{ size: number; digest: string }> {
  const { preview: p, members } = await computeAudience(
    { ...run.filters, cloneIds: run.cloneIds },
    { dailyCap: run.dailyCap, runCap: run.runCap, holdoutPct: run.holdoutPct, allowRecontact: run.allowRecontact },
  );
  if (p.truncated) throw new Error("audience read was incomplete (row ceiling); cannot compare it to the reviewed dry run");
  const digest = hash("sha256", [...members].sort().join("\n"), "hex"); // one-shot: no .update( (check K11 scans this file)
  return { size: p.eligible + p.holdout + p.excluded.cap_reached, digest };
}

export async function currentAudienceSize(run: ReengageRun): Promise<number> {
  return (await currentAudience(run)).size;
}

export type ReviewRecord = {
  mediaCampaignKey?: string;
  eventId: number;
  reviewedAt: string;
  reviewedBy: string;
  counts: DryRunCounts;
  audienceSize: number;
  /** Absent on a review recorded before the digest existed: the gate refuses it. */
  audienceDigest?: string;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The newest dry_run_reviewed event for the run, or null. Throws on a read error. */
export async function latestReview(runId: string): Promise<ReviewRecord | null> {
  const events = await listEvents({ runId, eventType: "control_action", limit: 1000 }); // newest first
  for (const e of events) {
    const d = e.detail;
    if (d.kind !== REVIEW_KIND || d.run_id !== runId) continue;
    const w = num(d.would_send_count);
    const h = num(d.holdout_count);
    const n = num(d.episode_count);
    const x = num(d.excluded_total);
    const a = num(d.audience_size);
    if (w === null || h === null || n === null || x === null || a === null) continue; // malformed: not a valid review
    return { ...(typeof d.media_campaign_key === "string" ? { mediaCampaignKey: d.media_campaign_key } : {}), ...(typeof d.audience_digest === "string" ? { audienceDigest: d.audience_digest } : {}), eventId: e.id, reviewedAt: e.ts, reviewedBy: e.actor, counts: { wouldSendCount: w, holdoutCount: h, episodeCount: n, excludedTotal: x }, audienceSize: a };
  }
  return null;
}

export type ReviewVerdict = { ok: true; review: ReviewRecord } | { ok: false; reason: string };

/** The gate itself: a review exists, the dry-run counts are identical to what
 *  was reviewed, and the audience is the same fans that were reviewed. */
export async function checkReviewGate(run: ReengageRun): Promise<ReviewVerdict> {
  let review: ReviewRecord | null;
  try {
    review = await latestReview(run.id);
  } catch (e) {
    return { ok: false, reason: `cannot confirm live: review record unreadable (${e instanceof Error ? e.message : e})` };
  }
  if (!review) return { ok: false, reason: 'cannot go live: nobody has reviewed this dry run. Open the run and press "I reviewed this dry run" first' };

  try {
    const key = mediaCampaignReviewKey(run);
    if (key && key !== review.mediaCampaignKey) return { ok: false, reason: "Campaign content or delivery choices changed. Review this dry run again" };
  } catch { return { ok: false, reason: "Campaign content is invalid. Cannot confirm live" }; }

  let now: DryRunSummary;
  try {
    now = await computeDryRunSummary(run.id);
  } catch (e) {
    return { ok: false, reason: `cannot confirm live: dry-run counts unreadable (${e instanceof Error ? e.message : e})` };
  }
  if (now.truncated) return { ok: false, reason: "cannot confirm live: the dry run is too large to verify completely" };
  const a = review.counts;
  const b = countsOf(now);
  if (a.wouldSendCount !== b.wouldSendCount || a.holdoutCount !== b.holdoutCount || a.episodeCount !== b.episodeCount || a.excludedTotal !== b.excludedTotal) {
    return {
      ok: false,
      reason: `the dry-run numbers changed since it was reviewed (would-send ${a.wouldSendCount} -> ${b.wouldSendCount}, hold-out ${a.holdoutCount} -> ${b.holdoutCount}, excluded ${a.excludedTotal} -> ${b.excludedTotal}). Review it again`,
    };
  }

  let audience: { size: number; digest: string };
  try {
    audience = await currentAudience(run);
  } catch (e) {
    return { ok: false, reason: `cannot confirm live: audience unreadable (${e instanceof Error ? e.message : e})` };
  }
  if (audience.size > review.audienceSize) {
    return { ok: false, reason: `the audience grew since the review (${review.audienceSize} -> ${audience.size}). A live run may never be larger than what was reviewed; review again` };
  }
  if (audience.digest !== review.audienceDigest) {
    return { ok: false, reason: "the fans in the audience changed since the review (someone joined or left). Review it again" };
  }
  return { ok: true, review };
}

export type SendPlanRow = {
  cloneId: string;
  wouldSend: number;
  runDailyCap: number;
  creatorDailyCap: number | null;
  /** 0 when the creator is paused. */
  firstDay: number;
  /** The creator's connection is paused (manual or auto-halt): "paused: not sent". */
  paused: boolean;
  pausedReason: string | null;
};
export type SendPlan = {
  perClone: SendPlanRow[];
  /** Most that can go out on day one: sum of per-creator min(would-send, run daily cap, creator cap), then capped by the run cap. */
  firstDayTotal: number;
  /** Most the whole run can send: would-send total capped by the run cap. */
  runTotal: number;
  runCap: number | null;
};

/** Exact ceilings for what confirming live would send, from the reviewed
 *  dry run: min of run cap, daily cap and each creator's own cap. */
export async function computeSendPlan(run: ReengageRun, summary: DryRunSummary): Promise<SendPlan> {
  const conns = await listConnections();
  const capOf = new Map(conns.map((c) => [c.cloneId, c.dailyCap]));
  const connOf = new Map(conns.map((c) => [c.cloneId, c]));
  const perClone: SendPlanRow[] = summary.wouldSendByClone.map(({ cloneId, count }) => {
    const creatorDailyCap = capOf.get(cloneId) ?? null;
    const conn = connOf.get(cloneId);
    const paused = conn?.paused === true;
    return {
      cloneId, wouldSend: count, runDailyCap: run.dailyCap, creatorDailyCap,
      firstDay: paused ? 0 : Math.min(count, run.dailyCap, creatorDailyCap ?? Infinity),
      paused, pausedReason: paused ? conn?.pausedReason ?? null : null,
    };
  });
  const runCap = run.runCap ?? Infinity;
  const firstDayTotal = Math.min(perClone.reduce((a, r) => a + r.firstDay, 0), runCap);
  const runTotal = Math.min(perClone.reduce((a, r) => a + (r.paused ? 0 : r.wouldSend), 0), runCap);
  return { perClone, firstDayTotal, runTotal, runCap: run.runCap };
}

