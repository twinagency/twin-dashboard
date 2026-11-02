// lib/mtproto/funnel.ts
//
// Composes episodes.ts (state-derived funnel steps) with attribution.ts
// (purchase-derived bought/stars) into the one FunnelCounts the Overview /
// run detail pages render (N2.1: "eligible -> holdout | contacted ->
// acknowledged -> replied -> bought -> Stars"). Bought/stars here are the N3
// attribution (replied AND bought within the window) at the widest window
// (7d), so bought <= replied always holds; the Lift panel shows 24h/72h/7d
// side by side for anyone who needs the narrower cut.

import { computeLift } from "./attribution";
import { episodeFanKey, funnelFromEpisodes, isAckedSend } from "./episodes";
import { mtDb } from "./db";
import { selectAllRowsMtproto } from "./paging";
import { isMissingTable } from "./validate";
import { ATTRIBUTION_WINDOWS_HOURS, type CreatorLite, type FunnelCounts, type LiftReport, type OptOutReport, type OptOutRow, type ReengageEpisode } from "./types";

/** Pass an already-computed `lift` to avoid a second star_transactions read. */
export async function computeFunnel(episodes: ReengageEpisode[], lift?: LiftReport[]): Promise<FunnelCounts> {
  const base = funnelFromEpisodes(episodes);
  const reports = lift ?? (await computeLift(episodes));
  const widest = reports.find((l) => l.windowHours === ATTRIBUTION_WINDOWS_HOURS[ATTRIBUTION_WINDOWS_HOURS.length - 1]);
  return {
    ...base,
    bought: widest?.contacted.attributedBuyers ?? 0,
    stars: widest?.contacted.attributedStars ?? 0,
    partial: reports.some((r) => r.partial) || undefined,
  };
}

// ── opted out, per creator ───────────────────────────────────────────────────
//
// Count and rate from opt_out events (the worker's reply scan writes one per
// fan who answered a re-engagement send with stop/unsubscribe). Denominator is
// the unique fans with an acked real send in the same episodes (the funnel's
// "Contacted"), and only opt-outs by those fans count, so the rate can never
// exceed 100% and an opt-out from another run is not attributed here.

/** reengage_events has no telegram_id column. user_id goes NULL when the fan row
 *  is deleted (migration 163), so an event is tied to its fan through
 *  episode_id first (the episode carries telegram_id) and through user_id only
 *  as a fallback. An event with neither cannot be attributed and is ignored,
 *  never guessed. */
export type OptOutEventLike = { clone_id: string | null; user_id: string | null; episode_id?: string | null };

/** Pure. Fans are counted by (clone_id, telegram_id). */
export function optOutReport(episodes: ReengageEpisode[], events: OptOutEventLike[], creators: Pick<CreatorLite, "id" | "name">[]): OptOutReport {
  const contacted = new Map<string, Set<string>>(); // clone -> fan keys
  for (const ep of episodes) {
    if (!isAckedSend(ep)) continue;
    const set = contacted.get(ep.cloneId) ?? new Set<string>();
    set.add(episodeFanKey(ep));
    contacted.set(ep.cloneId, set);
  }
  const keyByEpisode = new Map<string, string>();
  const keyByUser = new Map<string, string>(); // `${clone}:${users.id}` -> fan key
  for (const ep of episodes) {
    keyByEpisode.set(ep.id, episodeFanKey(ep));
    if (ep.userId != null) keyByUser.set(`${ep.cloneId}:${ep.userId}`, episodeFanKey(ep));
  }
  const opted = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.clone_id) continue;
    const key = (e.episode_id ? keyByEpisode.get(e.episode_id) : undefined) ?? (e.user_id ? keyByUser.get(`${e.clone_id}:${e.user_id}`) : undefined);
    if (!key) continue;
    if (!contacted.get(e.clone_id)?.has(key)) continue;
    const set = opted.get(e.clone_id) ?? new Set<string>();
    set.add(key);
    opted.set(e.clone_id, set);
  }
  const nameOf = new Map(creators.map((c) => [c.id, c.name]));
  const row = (cloneId: string, cloneName: string, c: number, o: number): OptOutRow => ({ cloneId, cloneName, contacted: c, optedOut: o, rate: c > 0 ? o / c : null });
  const perCreator = [...contacted.entries()]
    .map(([id, set]) => row(id, nameOf.get(id) ?? id, set.size, opted.get(id)?.size ?? 0))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.cloneName.localeCompare(b.cloneName));
  const totC = perCreator.reduce((a, r) => a + r.contacted, 0);
  const totO = perCreator.reduce((a, r) => a + r.optedOut, 0);
  return { total: row("all", "All creators", totC, totO), perCreator };
}

/** Reads the opt_out events for the episodes' creators (bounded by clone_id and
 *  by the earliest real send) and builds the report. A failed read is returned
 *  as `error`, never as zero opt-outs. */
export async function computeOptOuts(episodes: ReengageEpisode[], creators: Pick<CreatorLite, "id" | "name">[]): Promise<OptOutReport> {
  const real = episodes.filter(isAckedSend);
  const empty = optOutReport(episodes, [], creators);
  if (real.length === 0) return empty;
  const cloneIds = [...new Set(real.map((e) => e.cloneId))];
  const since = real.reduce((m, e) => (e.sentAt && e.sentAt < m ? e.sentAt : m), real[0].sentAt as string);
  try {
    const { rows, truncated } = await selectAllRowsMtproto<{ id: number; clone_id: string | null; user_id: string | null; episode_id: string | null }>(
      () =>
        mtDb()
          .from("reengage_events")
          .select("id,clone_id,user_id,episode_id")
          .eq("event_type", "opt_out")
          .in("clone_id", cloneIds)
          .gte("ts", since)
          .order("id", { ascending: true }) as any,
      { label: "reengage_events opt_out", maxRows: 50_000, throwOnError: true },
    );
    const rep = optOutReport(episodes, rows, creators);
    return truncated ? { ...rep, partial: true } : rep;
  } catch (e) {
    if (isMissingTable(e)) return empty;
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}
