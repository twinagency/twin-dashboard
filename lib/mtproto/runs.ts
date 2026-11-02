import { parseMediaBundleCampaign, mediaCampaignReviewKey, type MediaBundleCampaign } from "./media-campaign";
// lib/mtproto/runs.ts
//
// reengage_runs CRUD + the lifecycle transitions the prompt's UI walkthrough
// describes: create as dry-run -> (queue it so the worker can claim it) ->
// review -> Confirm LIVE (sets confirm_live_at) -> Stop. Every transition
// writes a reengage_events row (event_type "control_action" or
// "run_started"/"run_finished"), which is this schema's real audit trail —
// see migration 158's header and plan section N1. This module never calls
// logAdminWrite (system_logs); that stays the admin API route's job for
// external callers, layered on top of this, not a replacement for it.

import { mtDb } from "./db";
import { insertEvent } from "./events";
import { getGlobalStop } from "./global-stop";
import { getFlow } from "./flows";
import { REVIEW_KIND, checkReviewGate, computeDryRunSummary, currentAudienceSize, type DryRunSummary } from "./review";
import { RunValidationError, isMissingTable, isUuid, requireUuid, sanitizeFilters, sanitizeMessageVariants, validateCaps } from "./validate";
import {
  DEFAULT_DAILY_CAP,
  DEFAULT_HOLDOUT_PCT,
  CONFIRM_LIVE_PHRASE,
  type ReengageRun,
  type RunFilters,
  type RunStatus,
} from "./types";

type RunRow = {
  allow_recontact?: boolean;
  photo_campaign?: MediaBundleCampaign | null;
  id: string;
  created_at: string;
  created_by: string;
  status: RunStatus;
  dry_run: boolean;
  clone_ids: string[];
  filters: RunFilters;
  daily_cap: number;
  run_cap: number | null;
  holdout_pct: number;
  message_variants: string[];
  confirm_live_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  stop_requested: boolean;
  note: string | null;
  flow_id?: string | null;
};

function fromRow(r: RunRow): ReengageRun {
  return {
    id: r.id,
    allowRecontact: r.allow_recontact === true,
    photoCampaign: r.photo_campaign ?? null,
    createdAt: r.created_at,
    createdBy: r.created_by,
    status: r.status,
    dryRun: r.dry_run,
    cloneIds: r.clone_ids ?? [],
    filters: r.filters ?? {},
    dailyCap: r.daily_cap,
    runCap: r.run_cap,
    holdoutPct: r.holdout_pct,
    messageVariants: r.message_variants ?? [],
    confirmLiveAt: r.confirm_live_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    stopRequested: r.stop_requested,
    note: r.note,
    flowId: r.flow_id ?? null,
  };
}

export type CreateRunInput = {
  id?: string;
  photoCampaign?: MediaBundleCampaign;
  allowRecontact?: boolean;
  createdBy: string;
  cloneIds: string[];
  filters: RunFilters;
  dailyCap: number;
  runCap: number | null;
  holdoutPct: number;
  messageVariants?: string[];
  note?: string | null;
  /** Optional follow-up flow (mtproto_flows.id). Stored in reengage_runs.flow_id;
   *  if that column does not exist yet the run is created without it. */
  flowId?: string | null;
};

// Re-exported so existing callers/tests keep importing it from here.
export { RunValidationError };

/** Same validation the migration's CHECK constraints enforce (and the tighter
 *  10-20% hold-out policy), applied before any write so a bad request 400s
 *  with a clear message instead of a raw Postgres constraint string. */
export function validateCreateRunInput(input: CreateRunInput): void {
  if (input.allowRecontact !== undefined && typeof input.allowRecontact !== "boolean") throw new RunValidationError("Invalid recontact option");
  if (input.id) requireUuid(input.id, "campaign");
  if (input.photoCampaign) {
    if (input.cloneIds.length !== 1) throw new RunValidationError("Media campaigns require one creator");
    parseMediaBundleCampaign(input.photoCampaign, input.cloneIds[0]);
  }
  if (input.cloneIds.length === 0) throw new RunValidationError("pick at least one creator");
  if (input.cloneIds.length > 100) throw new RunValidationError("too many creators in one run");
  for (const id of input.cloneIds) requireUuid(id, "cloneIds");
  validateCaps({ dailyCap: input.dailyCap, runCap: input.runCap, holdoutPct: input.holdoutPct });
  sanitizeMessageVariants(input.messageVariants);
  if (!input.createdBy.trim() || input.createdBy.length > 200) throw new RunValidationError("createdBy is required (max 200 chars)");
  if (input.note != null && input.note.length > 500) throw new RunValidationError("note is too long (max 500 chars)");
  if (input.flowId != null && input.flowId !== "") requireUuid(input.flowId, "flow");
}

/** True only for "reengage_runs.flow_id does not exist" (migration for flows not applied). */
export function isMissingFlowIdColumn(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const msg = String(err?.message ?? e ?? "");
  if (!/flow_id/.test(msg)) return false;
  return err?.code === "42703" || err?.code === "PGRST204" || /does not exist|could not find/i.test(msg);
}

/** A chosen flow must exist, not be archived, and fit the run's creators: a
 *  flow tied to one girl only goes on a run for exactly that girl. A disabled
 *  flow is allowed (it stays inert until both switches are on). */
async function assertUsableFlow(flowId: string, cloneIds: string[]): Promise<void> {
  const r = await getFlow(flowId);
  if (!r.installed) throw new RunValidationError("flows are not installed yet, so a follow-up flow cannot be attached");
  if (r.error) throw new Error(`could not verify the flow: ${r.error}`);
  const flow = r.data;
  if (!flow) throw new RunValidationError("that follow-up flow does not exist");
  if (flow.archived) throw new RunValidationError("that follow-up flow is archived");
  if (flow.cloneId && (cloneIds.length !== 1 || cloneIds[0] !== flow.cloneId)) {
    throw new RunValidationError("that follow-up flow belongs to one girl and can only be used on a run for her alone");
  }
}

/** Every creator must be a real, active clone. A run for a paused clone is
 *  refused rather than queued: the bot side is switched off for it. */
async function assertUsableCreators(cloneIds: string[]): Promise<void> {
  const { data, error } = await mtDb().from("clones").select("id,status").in("id", cloneIds);
  if (error) throw new Error(`could not verify creators: ${error.message}`);
  const found = new Map((data ?? []).map((r: { id: string; status: string | null }) => [r.id, r.status]));
  for (const id of cloneIds) {
    if (!found.has(id)) throw new RunValidationError(`creator ${id} does not exist`);
    if (found.get(id) === "paused") throw new RunValidationError(`creator ${id} is paused; unpause it before running a campaign`);
  }
}

/** Creates the run in 'draft', dry_run always true here (there is no dryRun
 *  field on CreateRunInput and no confirm_live_at is ever written by this
 *  path) — draft never reaches the worker (claim_reengage_run only looks at
 *  status='queued'), so a draft is inert by construction. queueRun() is the
 *  separate, explicit step that makes it claimable, and confirmLive() is the
 *  only code that can ever make a run non-dry. */
export async function createDryRun(input: CreateRunInput): Promise<ReengageRun> {
  const cloneIds = input.cloneIds.map((id) => (isUuid(id) ? id.toLowerCase() : id));
  validateCreateRunInput({ ...input, cloneIds });
  const filters = sanitizeFilters(input.filters, cloneIds);
  const messageVariants = sanitizeMessageVariants(input.messageVariants);
  await assertUsableCreators(cloneIds);
  const flowId = input.flowId ? input.flowId.toLowerCase() : null;
  if (flowId) await assertUsableFlow(flowId, cloneIds);
  const baseRow = {
    ...(input.id ? { id: input.id } : {}),
    ...(input.photoCampaign ? { photo_campaign: parseMediaBundleCampaign(input.photoCampaign, cloneIds[0]) } : {}),
    allow_recontact: input.allowRecontact === true,
    created_by: input.createdBy,
    status: "draft",
    dry_run: true,
    clone_ids: cloneIds,
    filters,
    daily_cap: input.dailyCap,
    run_cap: input.runCap,
    holdout_pct: input.holdoutPct,
    message_variants: messageVariants,
    note: input.note ?? null,
  };
  let flowSkipped = false;
  let res = await mtDb().from("reengage_runs").insert((flowId ? { ...baseRow, flow_id: flowId } : baseRow) as typeof baseRow).select().single();
  if (res.error && flowId && isMissingFlowIdColumn(res.error)) {
    // The flows migration is not applied yet: create the run without the flow
    // rather than breaking run creation (same idea as OPTIONAL_COLUMNS).
    flowSkipped = true;
    res = await mtDb().from("reengage_runs").insert(baseRow).select().single();
  }
  const { data, error } = res;
  if (error) throw new Error(error.message);
  const run = fromRow(data as RunRow);
  await insertEvent({
    runId: run.id,
    cloneId: null,
    userId: null,
    episodeId: null,
    eventType: "config_change",
    actor: input.createdBy,
    detail: { action: "run_created", dryRun: true, allowRecontact: input.allowRecontact === true, cloneIds, filters, dailyCap: input.dailyCap, runCap: input.runCap, holdoutPct: input.holdoutPct, messageVariants, ...(flowId ? { flowId, flowSkipped } : {}) },
  });
  return run;
}

export async function getRun(id: string): Promise<ReengageRun | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await mtDb().from("reengage_runs").select().eq("id", id).maybeSingle();
  if (error) throw new Error(`could not read run: ${error.message}`);
  if (!data) return null;
  return fromRow(data as RunRow);
}

export async function listRuns(limit = 50): Promise<ReengageRun[]> {
  const { data, error } = await mtDb()
    .from("reengage_runs")
    .select()
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.floor(limit))) : 50);
  if (error) {
    if (isMissingTable(error)) return []; // migration 158 not applied yet
    throw new Error(`could not read runs: ${error.message}`); // never render "no runs" for an unreadable table
  }
  return (data as RunRow[]).map(fromRow);
}

/** draft -> queued: the worker's claim_reengage_run() can now pick this up.
 *  Still dry_run=true, so nothing real sends — this is "review what it would
 *  have sent" (prompt step 4), not the live step. */
export async function queueRun(id: string, actor: string): Promise<ReengageRun> {
  requireUuid(id, "runId");
  const run = await getRun(id);
  if (!run) throw new RunValidationError("run not found");
  if (run.status !== "draft") throw new RunValidationError(`cannot queue a run in status "${run.status}"`);
  const { data, error } = await mtDb()
    .from("reengage_runs")
    .update({ status: "queued" })
    .eq("id", id)
    .eq("status", "draft")
    .select()
    .single();
  if (error) throw new Error(error.message);
  await insertEvent({
    runId: id,
    cloneId: null,
    userId: null,
    episodeId: null,
    eventType: "control_action",
    actor,
    detail: { action: "queue_run", before: "draft", after: "queued" },
  });
  return fromRow(data as RunRow);
}

/** Records "a human reviewed this finished dry run" as a control_action event
 *  {kind:'dry_run_reviewed', run_id, would_send_count, ...}. The counts stored
 *  are the ones computed NOW from the episodes, never client-supplied, so
 *  confirmLive() can later prove nothing changed. Latest review wins. */
export async function recordDryRunReview(id: string, actor: string): Promise<DryRunSummary> {
  requireUuid(id, "runId");
  const run = await getRun(id);
  if (!run) throw new RunValidationError("run not found");
  if (!run.dryRun || run.confirmLiveAt) throw new RunValidationError("this run is already live; there is no dry run to review");
  if (run.status !== "done") throw new RunValidationError(`the dry run is not finished (status "${run.status}", need "done")`);
  if (run.stopRequested) throw new RunValidationError("this run was stopped; create a new run instead");
  const summary = await computeDryRunSummary(id);
  if (summary.truncated) throw new RunValidationError("the dry run is too large to review completely; narrow the audience");
  if (summary.wouldSendCount === 0) throw new RunValidationError("the dry run would send nothing; there is nothing to review or take live");
  const audienceSize = await currentAudienceSize(run);
  await insertEvent({
    runId: id,
    cloneId: null,
    userId: null,
    episodeId: null,
    eventType: "control_action",
    actor,
    detail: {
      kind: REVIEW_KIND,
      run_id: id,
      would_send_count: summary.wouldSendCount,
      holdout_count: summary.holdoutCount,
      episode_count: summary.episodeCount,
      excluded_total: summary.excludedTotal,
      audience_size: audienceSize,
      ...(mediaCampaignReviewKey(run) ? { media_campaign_key: mediaCampaignReviewKey(run) } : {}),
    },
  });
  return summary;
}

/** The second, clearly-marked explicit action (prompt step 5). Only allowed
 *  on a run that has already been dry-run reviewed (status 'done', the
 *  worker's terminal state for a finished dry pass) — a run cannot go live
 *  straight from 'draft' or 'queued', it must have run once as a dry run
 *  first. Sets dry_run=false + confirm_live_at (the ONLY place either is ever
 *  written) and re-queues.
 *
 *  `typed` is the operator's typed confirmation. It is checked HERE, not in the
 *  form, so no caller (a server action replayed from another page, the admin
 *  API, a script) can go live without supplying it. */
export async function confirmLive(id: string, actor: string, typed: string | null | undefined): Promise<ReengageRun> {
  if ((typed ?? "").trim() !== CONFIRM_LIVE_PHRASE) {
    throw new RunValidationError(`type ${CONFIRM_LIVE_PHRASE} to confirm going live`);
  }
  requireUuid(id, "runId");
  const run = await getRun(id);
  if (!run) throw new RunValidationError("run not found");
  if (!run.dryRun || run.confirmLiveAt) throw new RunValidationError("this run is already live");
  if (run.status !== "done") {
    throw new RunValidationError(`confirm live requires the dry run to be reviewed first (status is "${run.status}", need "done")`);
  }
  if (run.stopRequested) throw new RunValidationError("this run was stopped; create a new run instead");
  // Never arm a live send while the fleet-wide stop is on, or when its state
  // cannot be read (fail closed).
  let globallyStopped: boolean;
  try {
    globallyStopped = await getGlobalStop();
  } catch (e) {
    throw new RunValidationError(`cannot confirm live: global stop state unreadable (${e instanceof Error ? e.message : e})`);
  }
  if (globallyStopped) throw new RunValidationError("GLOBAL STOP is active; lift it before confirming a live run");

  // REVIEW GATE: a recorded human review, dry-run counts unchanged since, and
  // an audience no larger than what was reviewed. Checked immediately before
  // the conditional update below, which itself only matches a still-'done',
  // still-dry, not-stopped run, so two concurrent confirms cannot both win.
  const gate = await checkReviewGate(run);
  if (!gate.ok) throw new RunValidationError(gate.reason);

  const confirmedAt = new Date().toISOString();
  const { data, error } = await mtDb()
    .from("reengage_runs")
    .update({ dry_run: false, confirm_live_at: confirmedAt, status: "queued" })
    .eq("id", id)
    .eq("status", "done")
    .eq("dry_run", true)
    .eq("stop_requested", false)
    .select()
    .single();
  if (error) throw new Error(`confirm live did not apply (the run changed underneath it; reload and try again): ${error.message}`);
  await insertEvent({
    runId: id,
    cloneId: null,
    userId: null,
    episodeId: null,
    eventType: "control_action",
    actor,
    detail: { action: "confirm_live", reviewed_event_id: gate.review.eventId, reviewed_would_send_count: gate.review.counts.wouldSendCount, before: { dryRun: true, status: "done", confirmLiveAt: null }, after: { dryRun: false, status: "queued", confirmLiveAt: confirmedAt } },
  });
  return fromRow(data as RunRow);
}

const STOPPABLE: RunStatus[] = ["draft", "queued", "running", "paused"];

/** Kill-switch layer 2 (section G): per-run stop. The claimer checks
 *  stop_requested before handing out more episodes; it does not roll back
 *  work already claimed (plan.md / migration 158 comment). Refuses a run that
 *  is already finished, and always writes a control_action with before/after.
 *  If the stop applied but the audit row failed, the error says so (the stop
 *  itself is never undone or hidden). */
export async function stopRun(id: string, actor: string, reason?: string): Promise<ReengageRun> {
  requireUuid(id, "runId");
  const before = await getRun(id);
  if (!before) throw new RunValidationError("run not found");
  if (!STOPPABLE.includes(before.status)) {
    throw new RunValidationError(`cannot stop a run in status "${before.status}"`);
  }
  const { data, error } = await mtDb()
    .from("reengage_runs")
    .update({ stop_requested: true, status: "stopped" })
    .eq("id", id)
    .in("status", STOPPABLE)
    .select()
    .single();
  if (error) throw new Error(`stop failed: ${error.message}`);
  const after = fromRow(data as RunRow);
  if (!after.stopRequested || after.status !== "stopped") throw new Error("stop did not take effect; press Stop again");
  try {
    await insertEvent({
      runId: id,
      cloneId: null,
      userId: null,
      episodeId: null,
      eventType: "control_action",
      actor,
      detail: {
        action: "stop_run",
        reason: reason?.slice(0, 500) ?? null,
        before: { status: before.status, stopRequested: before.stopRequested },
        after: { status: after.status, stopRequested: after.stopRequested },
      },
    });
  } catch (e) {
    throw new Error(`run WAS stopped, but the audit event failed: ${e instanceof Error ? e.message : e}`);
  }
  return after;
}

export { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT };

