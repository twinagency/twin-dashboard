// lib/mtproto/episodes.ts
//
// reengage_episodes reads: the funnel (eligible -> holdout -> contacted ->
// acknowledged -> replied), the sends table, and per-fan lookups. Every read is
// bounded by run_id or clone_id (both indexed — reengage_episodes_run_state_idx,
// reengage_episodes_clone_state_sent_idx), never an unfiltered scan.

import { mtDb } from "./db";
import { selectAllRowsMtproto } from "./paging";
import type { EpisodeState, FunnelCounts, ReengageEpisode } from "./types";

type EpisodeRow = {
  id: string;
  run_id: string;
  clone_id: string;
  user_id: string;
  telegram_id: number;
  episode_start_inbound_at: string;
  state: EpisodeState;
  dry_run: boolean | null;
  prepared_text: string | null;
  acked_text: string | null;
  tg_message_id: number | null;
  claimed_by: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  error_code: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(r: EpisodeRow): ReengageEpisode {
  return {
    id: r.id,
    runId: r.run_id,
    cloneId: r.clone_id,
    userId: r.user_id,
    telegramId: r.telegram_id,
    episodeStartInboundAt: r.episode_start_inbound_at,
    state: r.state,
    dryRun: r.dry_run !== false,
    preparedText: r.prepared_text,
    ackedText: r.acked_text,
    tgMessageId: r.tg_message_id,
    claimedBy: r.claimed_by,
    claimedAt: r.claimed_at,
    sentAt: r.sent_at,
    errorCode: r.error_code,
    skipReason: r.skip_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** All episodes for one run, paged and bounded by run_id. Used by the funnel,
 *  the sends table and CSV export — one read, several views over the result. */
export async function listEpisodesForRun(runId: string, maxRows = 50_000): Promise<{ episodes: ReengageEpisode[]; truncated: boolean }> {
  try {
    const { rows, truncated } = await selectAllRowsMtproto<EpisodeRow>(
      () => mtDb().from("reengage_episodes").select().eq("run_id", runId).order("created_at", { ascending: true }).order("id", { ascending: true }) as any,
      { label: `reengage_episodes run=${runId}`, maxRows },
    );
    return { episodes: rows.map(fromRow), truncated };
  } catch (e) {
    console.warn(`[mtproto] reengage_episodes unavailable (migration 158 applied?): ${e instanceof Error ? e.message : e}`);
    return { episodes: [], truncated: false };
  }
}

const SENT_STATES: EpisodeState[] = ["acked", "replied"];

/** A send Telegram actually accepted: acked (or later replied) AND carrying a
 *  message id. A dry run's "would send" marks an episode acked too but with no
 *  tg_message_id, so this is what separates real sends from simulated ones. */
export function isRealSend(ep: ReengageEpisode): boolean {
  return !ep.dryRun && SENT_STATES.includes(ep.state) && ep.tgMessageId != null && ep.sentAt != null;
}

/** Acked (real or dry "would send"), never failed/uncertain/cancelled. */
export function isAckedSend(ep: ReengageEpisode): boolean {
  return !ep.dryRun && SENT_STATES.includes(ep.state) && ep.sentAt != null;
}

const fanKey = (ep: ReengageEpisode) => `${ep.cloneId}:${ep.userId}`;

/** Funnel counts derived purely from episode state (stars/bought come from
 *  lib/mtproto/attribution.ts, which needs a star_transactions join the
 *  episodes table alone can't give).
 *
 *  eligible/holdout count episodes (assignment is per episode); contacted,
 *  acknowledged and replied count UNIQUE fans from ACKED sends only, so a failed,
 *  uncertain, cancelled or merely-claimed episode never inflates them and a
 *  fan with two episodes in one run counts once. contacted >= acknowledged >=
 *  replied by construction. */
export function funnelFromEpisodes(episodes: ReengageEpisode[]): Omit<FunnelCounts, "bought" | "stars"> {
  let eligible = 0;
  let holdout = 0;
  const contacted = new Set<string>();
  const acknowledged = new Set<string>();
  const replied = new Set<string>();
  for (const ep of episodes) {
    if (ep.dryRun) continue; // simulated episodes are not part of the real funnel
    if (ep.state === "holdout") holdout += 1;
    else eligible += 1;
    if (isAckedSend(ep)) contacted.add(fanKey(ep));
    if (isRealSend(ep)) acknowledged.add(fanKey(ep));
    if (ep.state === "replied" && isRealSend(ep)) replied.add(fanKey(ep));
  }
  return { eligible: eligible + holdout, holdout, contacted: contacted.size, acknowledged: acknowledged.size, replied: replied.size };
}

export async function getEpisode(id: string): Promise<ReengageEpisode | null> {
  const { data, error } = await mtDb().from("reengage_episodes").select().eq("id", id).maybeSingle();
  if (error || !data) return null;
  return fromRow(data as EpisodeRow);
}

/** Full ordered history for one fan (per-fan timeline, N2.5) — every episode
 *  this clone/fan pair has ever had, oldest first. Bounded by (clone_id,
 *  user_id), a small set by construction (one episode per silence stretch). */
export async function listEpisodesForFan(cloneId: string, userId: string): Promise<ReengageEpisode[]> {
  const { data, error } = await mtDb()
    .from("reengage_episodes")
    .select()
    .eq("clone_id", cloneId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.warn(`[mtproto] listEpisodesForFan failed: ${error.message}`);
    return [];
  }
  return (data as EpisodeRow[]).map(fromRow);
}
