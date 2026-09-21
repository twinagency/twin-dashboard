// lib/mtproto/safety.ts
//
// SAFETY / RATE panel (N2.7): sends today vs daily cap, FloodWait/PeerFlood
// count, last error, account health, connection status per creator. Reads
// are bounded to "today" (a UTC day boundary) plus a fixed lookback for the
// "days clean" figure — never an unfiltered scan of reengage_events.

import { supabaseAdmin } from "@/lib/supabase";
import type { CreatorLite, SafetySnapshot } from "./types";
import { connectionFor, listConnections } from "./connections";

const RESTRICTION_EVENT_TYPES = ["send_failed", "account_halt"] as const;
const LOOKBACK_DAYS = 30;

function startOfUtcDay(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

type RestrictionEvent = { clone_id: string | null; ts: string; event_type: string; detail: Record<string, unknown> };

async function sentTodayByClone(cloneIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cloneIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from("reengage_episodes")
    .select("clone_id")
    .in("clone_id", cloneIds)
    .not("sent_at", "is", null)
    .gte("sent_at", startOfUtcDay())
    .limit(10_000);
  if (error) {
    console.warn(`[mtproto] sentTodayByClone failed: ${error.message}`);
    return out;
  }
  for (const row of (data ?? []) as { clone_id: string }[]) out.set(row.clone_id, (out.get(row.clone_id) ?? 0) + 1);
  return out;
}

async function restrictionEvents(cloneIds: string[]): Promise<RestrictionEvent[]> {
  if (cloneIds.length === 0) return [];
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("reengage_events")
    .select("clone_id,ts,event_type,detail")
    .in("clone_id", cloneIds)
    .in("event_type", RESTRICTION_EVENT_TYPES as unknown as string[])
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(5_000);
  if (error) {
    console.warn(`[mtproto] restrictionEvents unavailable (migration 158 applied?): ${error.message}`);
    return [];
  }
  return data as RestrictionEvent[];
}

function isFloodOrPeerFlood(detail: Record<string, unknown>): boolean {
  const code = String(detail?.errorCode ?? detail?.code ?? "").toUpperCase();
  return code.includes("FLOOD_WAIT") || code.includes("PEER_FLOOD");
}

export async function computeSafetySnapshots(creators: CreatorLite[]): Promise<SafetySnapshot[]> {
  const cloneIds = creators.map((c) => c.id);
  const [connections, sentToday, restrictions] = await Promise.all([
    listConnections(),
    sentTodayByClone(cloneIds),
    restrictionEvents(cloneIds),
  ]);
  const todayStart = new Date(startOfUtcDay()).getTime();

  return creators.map((creator) => {
    const conn = connectionFor(creator.id, connections);
    const cloneEvents = restrictions.filter((e) => e.clone_id === creator.id);
    const floodWaitCount = cloneEvents.filter((e) => new Date(e.ts).getTime() >= todayStart && isFloodOrPeerFlood(e.detail)).length;
    const last = cloneEvents[0]; // already ordered ts desc
    const lastRestrictionMs = cloneEvents.length ? new Date(cloneEvents[0].ts).getTime() : null;
    return {
      cloneId: creator.id,
      cloneName: creator.name,
      sentToday: sentToday.get(creator.id) ?? 0,
      dailyCap: conn.dailyCap,
      floodWaitCount,
      lastError: last ? String((last.detail as Record<string, unknown>)?.errorCode ?? last.event_type) : null,
      lastErrorAt: last?.ts ?? null,
      connectionStatus: conn.status,
      daysCleanSinceRestriction: lastRestrictionMs != null ? Math.floor((Date.now() - lastRestrictionMs) / 86_400_000) : null,
    };
  });
}
