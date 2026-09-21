// lib/mtproto/events.ts
//
// reengage_events: insert (append-only — the table grant is select+insert
// only, see migration 158) and bounded reads for the live feed / failures
// view. Every read here is bounded by run_id, clone_id or a `ts`/`id` cursor
// — never an unfiltered full-table scan (N4: "Bound every query by time or
// an indexed column").

import { mtDb } from "./db";
import { selectAllRowsMtproto } from "./paging";
import { RunValidationError, isUuid } from "./validate";
import type { EventType, ReengageEvent } from "./types";

type EventRow = {
  id: number;
  ts: string;
  run_id: string | null;
  episode_id: string | null;
  clone_id: string | null;
  user_id: string | null;
  event_type: EventType;
  actor: string;
  detail: Record<string, unknown>;
};

function fromRow(r: EventRow): ReengageEvent {
  return {
    id: r.id,
    ts: r.ts,
    runId: r.run_id,
    episodeId: r.episode_id,
    cloneId: r.clone_id,
    userId: r.user_id,
    eventType: r.event_type,
    actor: r.actor,
    detail: r.detail ?? {},
  };
}

export type InsertEventInput = {
  runId: string | null;
  episodeId: string | null;
  cloneId: string | null;
  userId: string | null;
  eventType: EventType;
  actor: string;
  detail: Record<string, unknown>;
};

// NEVER LOG A SECRET (N: "NO secrets (sessions, codes, tokens) ever in any
// log"). Cheap best-effort guard — the worker is the one actually composing
// session events, this is a last line of defence on the dashboard's own
// writes (control_action / config_change), which never carry one, but a
// typo'd detail payload should not silently ship one either.
const SECRET_KEY_PATTERN = /session|token|password|secret|api[_-]?(key|hash|id)|auth[_-]?hash/i;
// Session-string shaped VALUES (mtcute/Telethon strings are long base64 blobs)
// are redacted too, whatever key they arrive under.
const SECRET_VALUE_PATTERN = /^[A-Za-z0-9+/_=-]{200,}$/;
export function scrubDetail(detail: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SECRET_KEY_PATTERN.test(k)) out[k] = "[redacted]";
    else if (typeof v === "string" && SECRET_VALUE_PATTERN.test(v)) out[k] = "[redacted]";
    else if (v && typeof v === "object" && !Array.isArray(v) && depth < 6) out[k] = scrubDetail(v as Record<string, unknown>, depth + 1);
    else out[k] = v;
  }
  return out;
}

export async function insertEvent(input: InsertEventInput): Promise<void> {
  const { error } = await mtDb().from("reengage_events").insert({
    run_id: input.runId,
    episode_id: input.episodeId,
    clone_id: input.cloneId,
    user_id: input.userId,
    event_type: input.eventType,
    actor: input.actor,
    detail: scrubDetail(input.detail),
  });
  if (error) {
    // Logging must never be the reason a control action fails outright, but
    // an audit gap is serious enough to be loud in the server console.
    console.error(`[mtproto] insertEvent(${input.eventType}) failed: ${error.message}`);
    throw new Error(`failed to record ${input.eventType}: ${error.message}`);
  }
}

export type ListEventsQuery = {
  runId?: string;
  cloneId?: string;
  eventType?: EventType;
  sinceIso?: string;
  /** Cursor for polling: only events with id greater than this. */
  afterId?: number;
  limit?: number;
};

/** Newest-first page for the live feed / failures view. Bounded to `limit`
 *  (default 200, hard-capped 1000) — this is a feed, not an export; CSV
 *  export of sends uses lib/mtproto/csv.ts's own paged read instead. */
export async function listEvents(q: ListEventsQuery): Promise<ReengageEvent[]> {
  const limit = Number.isFinite(q.limit) ? Math.min(1000, Math.max(1, Math.floor(q.limit as number))) : 200;
  if (q.runId && !isUuid(q.runId)) throw new RunValidationError("runId must be a valid id");
  if (q.cloneId && !isUuid(q.cloneId)) throw new RunValidationError("cloneId must be a valid id");
  if (q.afterId != null && !(Number.isInteger(q.afterId) && q.afterId >= 0)) throw new RunValidationError("afterId must be a non-negative integer");
  if (q.sinceIso && Number.isNaN(Date.parse(q.sinceIso))) throw new RunValidationError("since must be an ISO timestamp");
  let query = mtDb().from("reengage_events").select();
  if (q.runId) query = query.eq("run_id", q.runId);
  if (q.cloneId) query = query.eq("clone_id", q.cloneId);
  if (q.eventType) query = query.eq("event_type", q.eventType);
  if (q.sinceIso) query = query.gte("ts", q.sinceIso);
  if (q.afterId != null) query = query.gt("id", q.afterId);
  // Newest-first for the initial page, oldest-first after a cursor. `id` is
  // always the tiebreaker so equal timestamps order deterministically.
  const asc = q.afterId != null;
  const ordered = asc ? query.order("id", { ascending: true }) : query.order("ts", { ascending: false }).order("id", { ascending: false });
  const { data, error } = await ordered.limit(limit);
  if (error) {
    // Surface it: a feed that returns [] on error looks exactly like "no events".
    console.error(`[mtproto] listEvents failed: ${error.message}`);
    throw new Error(`could not read events: ${error.message}`);
  }
  return (data as EventRow[]).map(fromRow);
}

/** All events for one run, paged — used by the failures view and by CSV
 *  export context, bounded by run_id (indexed: reengage_events_run_ts_idx). */
export async function listAllEventsForRun(runId: string, maxRows = 20_000): Promise<{ events: ReengageEvent[]; truncated: boolean }> {
  const { rows, truncated } = await selectAllRowsMtproto<EventRow>(
    () => mtDb().from("reengage_events").select().eq("run_id", runId).order("ts", { ascending: true }).order("id", { ascending: true }) as any,
    { label: `reengage_events run=${runId}`, maxRows },
  );
  return { events: rows.map(fromRow), truncated };
}
