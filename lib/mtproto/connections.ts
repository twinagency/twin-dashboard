// lib/mtproto/connections.ts
//
// userbot_connections: one row per creator's mtcute session (migration 158).
// session_ref is a local filename/label only, never a secret — see that
// migration's header. This module never reads or writes anything shaped like
// a session string; it only reads/writes status, pause and daily_cap.

import { mtDb } from "./db";
import { insertEvent } from "./events";
import { getCreator } from "./clones";
import { autoHaltKind, buildAutoHaltInfo, listHaltEvents, pickHaltEvent, resumePhraseFor, resumePhraseOk, shortId } from "./halt";
import { RunValidationError, isMissingTable, requireUuid } from "./validate";
import { HARD_MAX_DAILY_CAP, type ConnectionStatus, type UserbotConnection } from "./types";

type ConnectionRow = {
  clone_id: string;
  status: ConnectionStatus;
  tg_user_id: number | null;
  dc_id: number | null;
  last_seen_at: string | null;
  paused: boolean;
  paused_reason: string | null;
  daily_cap: number;
  session_ref: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(r: ConnectionRow): UserbotConnection {
  return {
    cloneId: r.clone_id,
    status: r.status,
    tgUserId: r.tg_user_id,
    dcId: r.dc_id,
    lastSeenAt: r.last_seen_at,
    paused: r.paused,
    pausedReason: r.paused_reason,
    dailyCap: r.daily_cap,
    sessionRef: r.session_ref,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** All connections, one row per creator that has ever had a session. A
 *  creator with no row yet reads as "disconnected" by the caller (see
 *  connectionFor's default), not an error — most creators won't have
 *  connected a userbot session on day one. */
export async function listConnections(): Promise<UserbotConnection[]> {
  try {
    const { data, error } = await mtDb().from("userbot_connections").select();
    if (error) throw error;
    return (data as ConnectionRow[]).map(fromRow);
  } catch (e) {
    if (isMissingTable(e)) {
      console.warn(`[mtproto] userbot_connections not created yet (migration 158 not applied)`);
      return [];
    }
    // Do NOT return [] here: that would render every creator as "active,
    // not paused" when the truth is unknown.
    throw new Error(`could not read userbot_connections: ${(e as { message?: string })?.message ?? e}`);
  }
}

export function connectionFor(cloneId: string, connections: UserbotConnection[]): UserbotConnection {
  return (
    connections.find((c) => c.cloneId === cloneId) ?? {
      cloneId,
      status: "disconnected",
      tgUserId: null,
      dcId: null,
      lastSeenAt: null,
      paused: false,
      pausedReason: null,
      dailyCap: 30,
      sessionRef: null,
      createdAt: "",
      updatedAt: "",
    }
  );
}

export async function getConnection(cloneId: string): Promise<UserbotConnection | null> {
  const { data, error } = await mtDb().from("userbot_connections").select().eq("clone_id", cloneId).maybeSingle();
  if (error) throw new Error(`could not read connection: ${error.message}`);
  return data ? fromRow(data as ConnectionRow) : null;
}

/** Pause or resume one creator's connection.
 *
 *  RESUMING A SPIKE AUTO-HALT (paused_reason 'auto_halt_spike:*') needs the
 *  typed phrase `RESUME <clone name or short id>`, checked HERE server-side (the
 *  form and the API only collect it). The control_action event then records who,
 *  and before/after including the halt reason and the numbers that tripped it.
 *  Resuming a manual pause is unchanged (no phrase). Pausing is always one call;
 *  pausing an already auto-halted creator keeps the auto-halt reason. */
export async function setConnectionPaused(cloneId: string, paused: boolean, reason: string | null, actor: string, confirmText?: string | null): Promise<void> {
  requireUuid(cloneId, "cloneId");
  let cleanReason = reason ? reason.slice(0, 500) : null;
  // getConnection throws on a read error: never resume (or pause) blind.
  const before = await getConnection(cloneId);
  const wasAutoHalt = !!before?.paused && autoHaltKind(before.pausedReason) !== null;
  let haltInfo: ReturnType<typeof buildAutoHaltInfo> = null;
  let phrase: string | null = null;
  if (!paused && wasAutoHalt) {
    const creator = await getCreator(cloneId);
    if (!resumePhraseOk(confirmText, creator?.name, cloneId)) {
      throw new RunValidationError(
        `this creator was AUTO-HALTED (${before!.pausedReason}). Type "${resumePhraseFor(creator?.name ?? shortId(cloneId))}" (or "RESUME ${shortId(cloneId)}") to resume it`,
      );
    }
    phrase = (confirmText ?? "").trim().replace(/\s+/g, " ");
    try {
      const events = await listHaltEvents([cloneId]);
      haltInfo = buildAutoHaltInfo(before!.pausedReason, pickHaltEvent(before!.pausedReason as string, events));
    } catch {
      haltInfo = buildAutoHaltInfo(before!.pausedReason, null); // reason still recorded; numbers unavailable
    }
  }
  if (paused && wasAutoHalt) cleanReason = before!.pausedReason; // a manual pause must not erase why it auto-halted
  const { error } = await mtDb()
    .from("userbot_connections")
    .upsert({ clone_id: cloneId, paused, paused_reason: paused ? cleanReason : null }, { onConflict: "clone_id" });
  if (error) throw new Error(`could not ${paused ? "pause" : "resume"} connection: ${error.message}`);
  try {
    await insertEvent({
      runId: null,
      episodeId: null,
      cloneId,
      userId: null,
      eventType: "control_action",
      actor,
      detail: {
        action: paused ? "pause_connection" : "resume_connection",
        reason: cleanReason,
        before: { paused: before?.paused ?? false, pausedReason: before?.pausedReason ?? null, ...(haltInfo ? { autoHalt: haltInfo } : {}) },
        after: { paused, pausedReason: paused ? cleanReason : null },
        ...(phrase ? { confirmed: true, confirmText: phrase, resumedAutoHalt: before!.pausedReason } : {}),
      },
    });
  } catch (e) {
    throw new Error(`connection WAS ${paused ? "paused" : "resumed"}, but the audit event failed: ${e instanceof Error ? e.message : e}`);
  }
}

export async function setConnectionDailyCap(cloneId: string, dailyCap: number, actor: string): Promise<void> {
  requireUuid(cloneId, "cloneId");
  if (!Number.isInteger(dailyCap) || dailyCap <= 0 || dailyCap > HARD_MAX_DAILY_CAP) {
    throw new RunValidationError(`dailyCap must be a whole number between 1 and ${HARD_MAX_DAILY_CAP}`);
  }
  const before = await getConnection(cloneId);
  const { error } = await mtDb().from("userbot_connections").upsert({ clone_id: cloneId, daily_cap: dailyCap }, { onConflict: "clone_id" });
  if (error) throw new Error(error.message);
  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId,
    userId: null,
    eventType: "config_change",
    actor,
    detail: { action: "set_daily_cap", before: { dailyCap: before?.dailyCap ?? 30 }, after: { dailyCap } },
  });
}
