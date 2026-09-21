// lib/mtproto/connections.ts
//
// userbot_connections: one row per creator's mtcute session (migration 158).
// session_ref is a local filename/label only, never a secret — see that
// migration's header. This module never reads or writes anything shaped like
// a session string; it only reads/writes status, pause and daily_cap.

import { supabaseAdmin } from "@/lib/supabase";
import { insertEvent } from "./events";
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
    const { data, error } = await supabaseAdmin.from("userbot_connections").select();
    if (error) throw error;
    return (data as ConnectionRow[]).map(fromRow);
  } catch (e) {
    console.warn(`[mtproto] userbot_connections unavailable (migration 158 applied?): ${e instanceof Error ? e.message : e}`);
    return [];
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

export async function setConnectionPaused(cloneId: string, paused: boolean, reason: string | null, actor: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("userbot_connections")
    .upsert({ clone_id: cloneId, paused, paused_reason: reason }, { onConflict: "clone_id" });
  if (error) throw new Error(error.message);
  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId,
    userId: null,
    eventType: "control_action",
    actor,
    detail: { action: paused ? "pause_connection" : "resume_connection", reason },
  });
}

export async function setConnectionDailyCap(cloneId: string, dailyCap: number, actor: string): Promise<void> {
  if (!Number.isFinite(dailyCap) || dailyCap <= 0 || dailyCap > HARD_MAX_DAILY_CAP) {
    throw new Error(`dailyCap must be between 1 and ${HARD_MAX_DAILY_CAP}`);
  }
  const { error } = await supabaseAdmin.from("userbot_connections").upsert({ clone_id: cloneId, daily_cap: dailyCap }, { onConflict: "clone_id" });
  if (error) throw new Error(error.message);
  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId,
    userId: null,
    eventType: "config_change",
    actor,
    detail: { action: "set_daily_cap", dailyCap },
  });
}
