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

import { supabaseAdmin } from "@/lib/supabase";
import { insertEvent } from "./events";
import {
  DEFAULT_DAILY_CAP,
  DEFAULT_HOLDOUT_PCT,
  HARD_MAX_DAILY_CAP,
  type ReengageRun,
  type RunFilters,
  type RunStatus,
} from "./types";

type RunRow = {
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
  confirm_live_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  stop_requested: boolean;
  note: string | null;
};

function fromRow(r: RunRow): ReengageRun {
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: r.created_by,
    status: r.status,
    dryRun: r.dry_run,
    cloneIds: r.clone_ids ?? [],
    filters: r.filters ?? {},
    dailyCap: r.daily_cap,
    runCap: r.run_cap,
    holdoutPct: r.holdout_pct,
    confirmLiveAt: r.confirm_live_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    stopRequested: r.stop_requested,
    note: r.note,
  };
}

export type CreateRunInput = {
  createdBy: string;
  cloneIds: string[];
  filters: RunFilters;
  dailyCap: number;
  runCap: number | null;
  holdoutPct: number;
  note?: string | null;
};

export class RunValidationError extends Error {}

/** Same validation the migration's CHECK constraints enforce, applied client
 *  side too so a bad request 400s with a clear message instead of a raw
 *  Postgres constraint-violation string. */
export function validateCreateRunInput(input: CreateRunInput): void {
  if (input.cloneIds.length === 0) throw new RunValidationError("pick at least one creator");
  if (!Number.isFinite(input.dailyCap) || input.dailyCap <= 0 || input.dailyCap > HARD_MAX_DAILY_CAP) {
    throw new RunValidationError(`dailyCap must be between 1 and ${HARD_MAX_DAILY_CAP}`);
  }
  if (input.runCap != null && (!Number.isFinite(input.runCap) || input.runCap <= 0)) {
    throw new RunValidationError("runCap must be a positive number or unset");
  }
  if (!Number.isFinite(input.holdoutPct) || input.holdoutPct < 0 || input.holdoutPct > 50) {
    throw new RunValidationError("holdoutPct must be between 0 and 50");
  }
  if (!input.createdBy.trim()) throw new RunValidationError("createdBy is required");
}

/** Creates the run in 'draft', dry_run always true here — draft never reaches
 *  the worker (claim_reengage_run only looks at status='queued'), so a draft
 *  is inert by construction. queueRun() is the separate, explicit step that
 *  makes it live-claimable. */
export async function createDryRun(input: CreateRunInput): Promise<ReengageRun> {
  validateCreateRunInput(input);
  const { data, error } = await supabaseAdmin
    .from("reengage_runs")
    .insert({
      created_by: input.createdBy,
      status: "draft",
      dry_run: true,
      clone_ids: input.cloneIds,
      filters: input.filters,
      daily_cap: input.dailyCap,
      run_cap: input.runCap,
      holdout_pct: input.holdoutPct,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const run = fromRow(data as RunRow);
  await insertEvent({
    runId: run.id,
    cloneId: null,
    userId: null,
    episodeId: null,
    eventType: "config_change",
    actor: input.createdBy,
    detail: { action: "run_created", dryRun: true, cloneIds: input.cloneIds, filters: input.filters },
  });
  return run;
}

export async function getRun(id: string): Promise<ReengageRun | null> {
  const { data, error } = await supabaseAdmin.from("reengage_runs").select().eq("id", id).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as RunRow);
}

export async function listRuns(limit = 50): Promise<ReengageRun[]> {
  const { data, error } = await supabaseAdmin
    .from("reengage_runs")
    .select()
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) {
    console.error(`[mtproto] listRuns failed: ${error.message}`);
    return [];
  }
  return (data as RunRow[]).map(fromRow);
}

/** draft -> queued: the worker's claim_reengage_run() can now pick this up.
 *  Still dry_run=true, so nothing real sends — this is "review what it would
 *  have sent" (prompt step 4), not the live step. */
export async function queueRun(id: string, actor: string): Promise<ReengageRun> {
  const run = await getRun(id);
  if (!run) throw new RunValidationError("run not found");
  if (run.status !== "draft") throw new RunValidationError(`cannot queue a run in status "${run.status}"`);
  const { data, error } = await supabaseAdmin
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

/** The second, clearly-marked explicit action (prompt step 5). Only allowed
 *  on a run that has already been dry-run reviewed (status 'done', the
 *  worker's terminal state for a finished dry pass) — a run cannot go live
 *  straight from 'draft' or 'queued', it must have run once as a dry run
 *  first. Flips dry_run to false and re-queues so the worker performs the
 *  same plan for real. */
export async function confirmLive(id: string, actor: string): Promise<ReengageRun> {
  const run = await getRun(id);
  if (!run) throw new RunValidationError("run not found");
  if (!run.dryRun) throw new RunValidationError("this run is already live");
  if (run.status !== "done") {
    throw new RunValidationError(`confirm live requires the dry run to be reviewed first (status is "${run.status}", need "done")`);
  }
  const confirmedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("reengage_runs")
    .update({ dry_run: false, confirm_live_at: confirmedAt, status: "queued" })
    .eq("id", id)
    .eq("status", "done")
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
    detail: { action: "confirm_live", before: { dryRun: true, status: "done" }, after: { dryRun: false, status: "queued", confirmLiveAt: confirmedAt } },
  });
  return fromRow(data as RunRow);
}

/** Kill-switch layer 2 (section G): per-run stop. The claimer checks
 *  stop_requested before handing out more episodes; it does not roll back
 *  work already claimed (plan.md / migration 158 comment). */
export async function stopRun(id: string, actor: string, reason?: string): Promise<ReengageRun> {
  const { data, error } = await supabaseAdmin
    .from("reengage_runs")
    .update({ stop_requested: true, status: "stopped" })
    .eq("id", id)
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
    detail: { action: "stop_run", reason: reason ?? null },
  });
  return fromRow(data as RunRow);
}

export { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT };
