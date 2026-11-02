// lib/mtproto/halt-server.ts
//
// The bounded-read half of lib/mtproto/halt.ts, split out 2026-09-22 so a
// "use client" component (components/mtproto/LiveFeed.tsx, via
// event-format.ts) can import the pure halt helpers without also pulling
// lib/mtproto/db.ts -> lib/supabase.ts -> next/headers into the client
// bundle. Server-only: every caller here is a server component, route
// handler or test.

import { mtDb } from "./db";
import { isAutoHalted, buildAutoHaltInfo, pickHaltEvent, type HaltEventLike } from "./halt";
import type { AutoHaltInfo, UserbotConnection } from "./types";

/** Newest-first account_halt events for the given creators, bounded by clone_id
 *  (indexed) and the last 30 days. Throws on a read error: "no halt info" must
 *  never look like "no halt". A missing table reads as none. */
export async function listHaltEvents(cloneIds: string[]): Promise<Array<HaltEventLike & { clone_id: string | null }>> {
  if (cloneIds.length === 0) return [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await mtDb()
    .from("reengage_events")
    .select("id,clone_id,ts,event_type,detail")
    .in("clone_id", cloneIds)
    .eq("event_type", "account_halt")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .order("id", { ascending: false })
    .limit(2_000);
  if (error) {
    if (/does not exist|could not find the table|PGRST205|42P01/i.test(`${error.code ?? ""} ${error.message}`)) return [];
    throw new Error(`could not read account_halt events: ${error.message}`);
  }
  return data as Array<HaltEventLike & { clone_id: string | null }>;
}

/** cloneId -> AutoHaltInfo for every connection that is auto-halted right now. */
export async function autoHaltsFor(connections: UserbotConnection[]): Promise<Map<string, AutoHaltInfo>> {
  const halted = connections.filter((c) => isAutoHalted(c));
  const out = new Map<string, AutoHaltInfo>();
  if (halted.length === 0) return out;
  let events: Array<HaltEventLike & { clone_id: string | null }> = [];
  try {
    events = await listHaltEvents(halted.map((c) => c.cloneId));
  } catch (e) {
    console.error(`[mtproto] ${e instanceof Error ? e.message : e}`);
    // Still flag the row AUTO-HALTED (from paused_reason alone), just without the numbers.
  }
  for (const c of halted) {
    const info = buildAutoHaltInfo(c.pausedReason, pickHaltEvent(c.pausedReason as string, events.filter((e) => e.clone_id === c.cloneId)));
    if (info) out.set(c.cloneId, info);
  }
  return out;
}
