// lib/mtproto/flows.ts
//
// MTProto follow-up FLOWS: what happens after a fan replies to an MTProto
// opener. Contract: twin-bot docs/MTPROTO-FLOWS.md. Schema: twin-bot migration
// 20261015130000_mtproto_flows.sql (NOT applied anywhere by this code).
//
// OFF BY DEFAULT, TWO SWITCHES, BOTH REQUIRED (enforced by the bot and the
// worker, shown here):
//   app_settings 'mtproto_flows_enabled' = 'true'   (read-only in this file)
//   mtproto_flows.enabled = true                    (per flow)
// Nothing in the dashboard writes the global switch. setFlowEnabled() refuses
// to turn a flow on while the global switch is not exactly 'true' (or cannot
// be read), so the per-flow toggle can never be the thing that starts flows.
//
// MISSING TABLES: every READ here treats "the migration is not applied" as
// "not installed" (empty result), never an error to the page. Writes say so
// plainly instead.

import { mtDb } from "./db";
import { insertEvent } from "./events";
import { isMissingTable, isUuid, requireUuid } from "./validate";
import {
  FlowValidationError,
  FLOWS_GLOBAL_KEY,
  actionNeedsGirl,
  validateFlowName,
  validateFlowSteps,
  type Flow,
  type FlowStep,
} from "./flow-steps";

export * from "./flow-steps";

// ── rows ─────────────────────────────────────────────────────────────────────

type FlowRow = {
  id: string;
  name: string;
  clone_id: string | null;
  steps: unknown;
  enabled: boolean;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const FLOW_COLS = "id,name,clone_id,steps,enabled,archived,created_by,created_at,updated_at";

function fromRow(r: FlowRow): Flow {
  return {
    id: r.id,
    name: r.name,
    cloneId: r.clone_id ?? null,
    // A stored row is shown as stored. A malformed one shows as no steps
    // rather than crashing the page; saving re-validates.
    steps: (() => {
      try {
        return validateFlowSteps(r.steps ?? []);
      } catch {
        return [];
      }
    })(),
    enabled: r.enabled === true,
    archived: r.archived === true,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const NOT_INSTALLED = "Flows are not installed yet: the database migration for them has not been applied.";

// ── global switch (READ ONLY) ────────────────────────────────────────────────

/** Display-only read of app_settings 'mtproto_flows_enabled'. Only the exact
 *  text "true" is on. `on` is null when the read failed (unknown is never
 *  shown as off, and never treated as on). There is deliberately NO setter. */
export async function getFlowsGlobalSwitch(): Promise<{ on: boolean | null; error: string | null }> {
  try {
    const { data, error } = await mtDb().from("app_settings").select("value").eq("key", FLOWS_GLOBAL_KEY).maybeSingle();
    if (error) return { on: null, error: error.message };
    return { on: data?.value === "true", error: null };
  } catch (e) {
    return { on: null, error: e instanceof Error ? e.message : "unreadable" };
  }
}

// ── reads ────────────────────────────────────────────────────────────────────

export type FlowsRead<T> = { installed: boolean; error: string | null; data: T };

/** Newest first. Archived flows are left out unless asked for. */
export async function listFlows(opts: { includeArchived?: boolean; cloneId?: string | null } = {}): Promise<FlowsRead<Flow[]>> {
  try {
    let q = mtDb().from("mtproto_flows").select(FLOW_COLS).order("created_at", { ascending: false }).limit(500);
    if (!opts.includeArchived) q = q.eq("archived", false);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return { installed: false, error: null, data: [] };
      return { installed: true, error: error.message, data: [] };
    }
    let flows = ((data ?? []) as FlowRow[]).map(fromRow);
    if (opts.cloneId !== undefined) flows = flows.filter((f) => f.cloneId === null || f.cloneId === opts.cloneId);
    return { installed: true, error: null, data: flows };
  } catch (e) {
    return { installed: true, error: e instanceof Error ? e.message : "could not read flows", data: [] };
  }
}

export async function getFlow(id: string): Promise<FlowsRead<Flow | null>> {
  if (!isUuid(id)) return { installed: true, error: null, data: null };
  try {
    const { data, error } = await mtDb().from("mtproto_flows").select(FLOW_COLS).eq("id", id).maybeSingle();
    if (error) {
      if (isMissingTable(error)) return { installed: false, error: null, data: null };
      return { installed: true, error: error.message, data: null };
    }
    return { installed: true, error: null, data: data ? fromRow(data as FlowRow) : null };
  } catch (e) {
    return { installed: true, error: e instanceof Error ? e.message : "could not read flow", data: null };
  }
}

// ── writes ───────────────────────────────────────────────────────────────────

/** Every id a step names must be a real row of THIS clone, and a flow with no
 *  girl cannot carry media or offers (there is nothing to pick from). */
async function assertStepRefs(steps: FlowStep[], cloneId: string | null): Promise<void> {
  const need = { photos: new Set<string>(), videos: new Set<string>(), bundles: new Set<string>(), sequences: new Set<string>() };
  for (const s of steps) {
    const a = s.action;
    if (a.type === "free_media") {
      a.photoIds.forEach((x) => need.photos.add(x));
      a.videoIds.forEach((x) => need.videos.add(x));
    } else if (a.type === "bundle_offer") need.bundles.add(a.bundleId);
    else if (a.type === "sequence_offer") need.sequences.add(a.sequenceId);
  }
  const anyRef = steps.some((s) => actionNeedsGirl(s.action));
  if (!anyRef) return;
  if (!cloneId) throw new FlowValidationError("Media and offers need a flow tied to one girl. Pick a girl first.");
  const check = async (table: string, ids: Set<string>, label: string) => {
    if (ids.size === 0) return;
    const { data, error } = await mtDb().from(table).select("id,clone_id").in("id", [...ids]);
    if (error) throw new Error(`could not verify ${label}: ${error.message}`);
    const rows = (data ?? []) as { id: string; clone_id: string | null }[];
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new FlowValidationError(`a ${label} in this flow no longer exists`);
      if (row.clone_id !== cloneId) throw new FlowValidationError(`a ${label} in this flow belongs to a different girl`);
    }
  };
  await check("photos", need.photos, "photo");
  await check("videos", need.videos, "video");
  await check("photo_bundles", need.bundles, "bundle");
  await check("video_sequences", need.sequences, "video sequence");
}

async function assertCloneExists(cloneId: string): Promise<void> {
  const { data, error } = await mtDb().from("clones").select("id").eq("id", cloneId).maybeSingle();
  if (error) throw new Error(`could not verify the girl: ${error.message}`);
  if (!data) throw new FlowValidationError("that girl does not exist");
}

function writeFailed(error: { message: string }): Error {
  return isMissingTable(error) ? new FlowValidationError(NOT_INSTALLED) : new Error(error.message);
}

async function audit(actor: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await insertEvent({ runId: null, episodeId: null, cloneId: null, userId: null, eventType: "config_change", actor, detail });
  } catch (e) {
    console.error(`[mtproto-flows] audit event failed: ${e instanceof Error ? e.message : e}`);
  }
}

export type FlowInput = { name: string; cloneId: string | null; steps: unknown };

/** New flows are ALWAYS created off (enabled false) and not archived: there is
 *  no input for either. */
export async function createFlow(input: FlowInput, actor: string): Promise<Flow> {
  const name = validateFlowName(input.name);
  const cloneId = input.cloneId ? requireUuid(input.cloneId, "girl").toLowerCase() : null;
  const steps = validateFlowSteps(input.steps ?? []);
  if (cloneId) await assertCloneExists(cloneId);
  await assertStepRefs(steps, cloneId);
  const { data, error } = await mtDb()
    .from("mtproto_flows")
    .insert({ name, clone_id: cloneId, steps, enabled: false, archived: false, created_by: actor })
    .select(FLOW_COLS)
    .single();
  if (error) throw writeFailed(error);
  const flow = fromRow(data as FlowRow);
  await audit(actor, { action: "flow_created", flowId: flow.id, name, cloneId, steps: steps.length });
  return flow;
}

/** Edits name, girl and steps. Never touches enabled/archived. A flow that is
 *  ON cannot be saved with no steps. Running enrollments keep their frozen
 *  snapshot, so editing never changes a fan already in the flow. */
export async function updateFlow(id: string, input: FlowInput, actor: string): Promise<Flow> {
  requireUuid(id, "flow");
  const current = await getFlow(id);
  if (!current.installed) throw new FlowValidationError(NOT_INSTALLED);
  if (current.error) throw new Error(current.error);
  const existing = current.data;
  if (!existing) throw new FlowValidationError("flow not found");
  if (existing.archived) throw new FlowValidationError("this flow is archived and cannot be edited");
  const name = validateFlowName(input.name);
  const cloneId = input.cloneId ? requireUuid(input.cloneId, "girl").toLowerCase() : null;
  const steps = validateFlowSteps(input.steps ?? []);
  if (existing.enabled && steps.length === 0) throw new FlowValidationError("a flow that is On needs at least one step. Turn it Off first");
  if (cloneId) await assertCloneExists(cloneId);
  await assertStepRefs(steps, cloneId);
  const { data, error } = await mtDb()
    .from("mtproto_flows")
    .update({ name, clone_id: cloneId, steps, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("archived", false)
    .select(FLOW_COLS)
    .single();
  if (error) throw writeFailed(error);
  const flow = fromRow(data as FlowRow);
  await audit(actor, { action: "flow_updated", flowId: id, name, cloneId, steps: steps.length });
  return flow;
}

/** Archive hides the flow and forces it Off. Never deleted: runs and
 *  enrollments point at it (ON DELETE RESTRICT). */
export async function archiveFlow(id: string, actor: string): Promise<Flow> {
  requireUuid(id, "flow");
  const { data, error } = await mtDb()
    .from("mtproto_flows")
    .update({ archived: true, enabled: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(FLOW_COLS)
    .single();
  if (error) throw writeFailed(error);
  await audit(actor, { action: "flow_archived", flowId: id });
  return fromRow(data as FlowRow);
}

/** Turning a flow OFF always works. Turning it ON needs: the global switch
 *  exactly on (an unreadable switch counts as off), a flow that is not
 *  archived, and at least one step. */
export async function setFlowEnabled(id: string, enabled: boolean, actor: string): Promise<Flow> {
  requireUuid(id, "flow");
  const current = await getFlow(id);
  if (!current.installed) throw new FlowValidationError(NOT_INSTALLED);
  if (current.error) throw new Error(current.error);
  const existing = current.data;
  if (!existing) throw new FlowValidationError("flow not found");
  if (enabled) {
    const g = await getFlowsGlobalSwitch();
    if (g.on !== true) {
      throw new FlowValidationError(g.on === null ? "cannot turn a flow On: the global flows switch could not be read" : "cannot turn a flow On while the global flows switch is Off");
    }
    if (existing.archived) throw new FlowValidationError("an archived flow cannot be turned On");
    if (existing.steps.length === 0) throw new FlowValidationError("add at least one step before turning the flow On");
  }
  const { data, error } = await mtDb()
    .from("mtproto_flows")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(FLOW_COLS)
    .single();
  if (error) throw writeFailed(error);
  const flow = fromRow(data as FlowRow);
  if (flow.enabled !== enabled) throw new Error(`the flow switch did not take effect (reads ${flow.enabled}); try again`);
  await audit(actor, { action: enabled ? "flow_enabled" : "flow_disabled", flowId: id, before: { enabled: existing.enabled }, after: { enabled: flow.enabled } });
  return flow;
}

// ── stats ────────────────────────────────────────────────────────────────────

export interface StepStats {
  sent: number;
  failed: number;
  purchased: number;
  stars: number;
}
export interface FlowStats {
  enrolled: number;
  replied: number;
  completed: number;
  stopped: number;
  expired: number;
  stars: number;
  /** keyed by step_index */
  steps: Record<number, StepStats>;
  truncated: boolean;
}

export const emptyFlowStats = (): FlowStats => ({ enrolled: 0, replied: 0, completed: 0, stopped: 0, expired: 0, stars: 0, steps: {}, truncated: false });
export const emptyStepStats = (): StepStats => ({ sent: 0, failed: 0, purchased: 0, stars: 0 });

const EVENT_PAGE = 1000;
const EVENT_MAX_PAGES = 50;

type EventRow = { flow_id: string; step_index: number | null; event: string; detail: Record<string, unknown> | null };

function starsOf(detail: Record<string, unknown> | null): number {
  const n = Number(detail?.stars);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Stats for several flows in one paged read of mtproto_flow_events.
 *  `installed` is false (and every map entry empty) when the table is absent. */
export async function flowStatsMany(flowIds: string[]): Promise<{ installed: boolean; error: string | null; stats: Map<string, FlowStats> }> {
  const stats = new Map<string, FlowStats>();
  const ids = flowIds.filter(isUuid);
  for (const id of ids) stats.set(id, emptyFlowStats());
  if (ids.length === 0) return { installed: true, error: null, stats };
  try {
    for (let page = 0; page < EVENT_MAX_PAGES; page++) {
      const { data, error } = await mtDb()
        .from("mtproto_flow_events")
        .select("flow_id,step_index,event,detail")
        .in("flow_id", ids)
        .order("id", { ascending: true })
        .range(page * EVENT_PAGE, page * EVENT_PAGE + EVENT_PAGE - 1);
      if (error) {
        if (isMissingTable(error)) return { installed: false, error: null, stats: new Map(ids.map((i) => [i, emptyFlowStats()])) };
        return { installed: true, error: error.message, stats };
      }
      const rows = (data ?? []) as EventRow[];
      for (const r of rows) {
        const s = stats.get(r.flow_id);
        if (!s) continue;
        const step = r.step_index != null ? (s.steps[r.step_index] ??= emptyStepStats()) : null;
        switch (r.event) {
          case "enrolled": s.enrolled++; break;
          case "replied": s.replied++; break;
          case "completed": s.completed++; break;
          case "stopped": s.stopped++; break;
          case "expired": s.expired++; break;
          case "step_sent": if (step) step.sent++; break;
          case "step_failed": if (step) step.failed++; break;
          case "purchased": {
            const stars = starsOf(r.detail);
            if (step) {
              step.purchased++;
              step.stars += stars;
            }
            s.stars += stars;
            break;
          }
        }
      }
      if (rows.length < EVENT_PAGE) return { installed: true, error: null, stats };
    }
    for (const s of stats.values()) s.truncated = true; // hit the row ceiling: counts are a lower bound
    return { installed: true, error: null, stats };
  } catch (e) {
    return { installed: true, error: e instanceof Error ? e.message : "could not read flow events", stats };
  }
}

export async function flowStats(flowId: string): Promise<{ installed: boolean; error: string | null; stats: FlowStats }> {
  const r = await flowStatsMany([flowId]);
  return { installed: r.installed, error: r.error, stats: r.stats.get(flowId) ?? emptyFlowStats() };
}
