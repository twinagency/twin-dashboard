import { getDashboardAccess, withDashboardAccess, accessCacheKey, requireCloneAccess, type DashboardAccess } from "./dashboard-access";
// One cache in front of the two slowest reads in this codebase.
//
// THE THING THAT SHAPES THIS FILE: getDashboard() + getAnalytics() together take
// tens of seconds on the real fleet. They page every star_transaction,
// usage_event and user row in the window through selectAllRows() and roll them
// up in memory. That was instant at 39 fans and 1.9k messages; after the
// 2026-08-09/10 cutover it is ~30k fans and ~1.2M messages, and the Revenue page
// went from opening instantly to opening in a minute.
//
// Nothing here changes what the numbers ARE. It changes who waits for them:
//
//   - a warm read returns the cached rollup immediately, with its age
//   - an ordinary stale read returns immediately and kicks off ONE background
//     refresh; the live dashboard instead waits for that same single flight
//   - only a cold read (nothing cached for this window yet) waits on Supabase
//
// The single-flight map is the part that actually matters. The Revenue page
// polls, the admin API is polled by Rosai, and both hit the same windows. With
// a minute-long query and no single-flight, every poll during that minute opens
// another identical query and the box ends up running a dozen at once. That is
// how it was behaving before this file existed.
//
// This is deliberately the same shape as rosai's app/core/revenue.py, which had
// to solve the identical problem one layer up, against this API.
//
// WIPED ON EVERY DEPLOY. This Map lives in the single long-lived container's
// process (twin-ops/deploy.sh, `--memory=1g`), so a deploy or any container
// restart starts cold and the first Revenue open after it waits the full
// minute-plus. That is EXPECTED, not a bug — there is no shared cache tier and
// deliberately no Redis. Same for the unstable_cache entries in
// lib/query-cache.ts.

import { readRevenueSections, type RevenueSections } from "./revenue-sections";
import { getAnalytics } from "./analytics-data";
import { getDashboard, type DateRange, type Period } from "./dashboard-data";
import { resolveRevenueWindow } from "./revenue-window";

export type RevenueRollup = RevenueSections;

export type CachedRevenue = RevenueRollup & {
  /** Exact shared window used by the cached dashboard and analytics reads. */
  reportWindow: DateRange;
  /** Epoch ms the underlying queries actually ran. */
  cachedAt: number;
  /** Seconds since then. 0 on a cold read. */
  ageSeconds: number;
  /** True when this copy is past TTL and a refresh is running behind it. */
  stale: boolean;
};

// One minute. The page's headline tiles are operational numbers, including who
// is reachable right now, so a 5–10 minute snapshot is too old to call live.
// The single-flight below keeps a whole fleet from starting duplicate work.
const TTL_MS = 60 * 1000;

// Preset periods are a closed set, but a custom range is any two dates the
// calendar picker allows, so the key space is unbounded and the payloads are
// large. Bounded with plain oldest-first eviction rather than a real LRU: the
// access pattern here is a handful of hot windows, not a working set worth
// tracking.
const MAX_ENTRIES = 48;

type Entry = { fetchedAt: number; value: RevenueRollup; reportWindow: DateRange };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();

function keyOf(period: Period, cloneId: string | null, range?: DateRange): string {
  // The clone only scopes analytics (getDashboard always covers the fleet), but
  // it still belongs in the key: the cached value holds both halves, so a
  // fleet-wide entry cannot serve a clone-scoped read.
  const window = range ? `${range.startMs}-${range.endMs}` : period;
  return `${window}|${cloneId ?? "fleet"}`;
}

function evictIfFull() {
  while (cache.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, entry] of cache) {
      if (entry.fetchedAt < oldestAt) {
        oldestAt = entry.fetchedAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

function refresh(key: string, period: Period, cloneId: string | null, range?: DateRange, dashboardCloneIds?: string[] | null): Promise<Entry> {
  const running = inflight.get(key);
  if (running) return running;

  const run = (async () => {
    // Resolve this once, at one instant. The dashboard and analytics halves
    // render together, so they must not independently choose a calendar vs
    // rolling window (or even drift a few milliseconds apart at the end).
    const nowMs = Date.now();
    const sharedRange = await resolveRevenueWindow(period, range, nowMs);
    const value = await readRevenueSections(
      getDashboard(period, sharedRange, nowMs, dashboardCloneIds),
      getAnalytics(period, cloneId, sharedRange, undefined, nowMs, dashboardCloneIds),
    );
    const entry: Entry = { fetchedAt: Date.now(), value, reportWindow: sharedRange };
    if (!cache.has(key)) evictIfFull();
    cache.set(key, entry);
    return entry;
  })();

  inflight.set(key, run);
  // Always clear the slot, including on failure. A rejected refresh that stayed
  // in the map would wedge this window forever, serving a snapshot that can
  // never be replaced.
  run.finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  }).catch(() => {});

  return run;
}

/**
 * The revenue rollup for one window, from cache when there is one.
 *
 * Only the first call for a given window awaits Supabase. After that this
 * returns in microseconds unless a caller explicitly requests the fresh copy.
 */
// Finding B: getDashboard()/getAnalytics() have no access model of their own
// — they render whatever clone ids they're handed, fleet-wide by default
// (see getDashboard's doc comment). A real agency/creator (or an admin
// viewing as one) must narrow to the single requested clone when there is
// one, else to their WHOLE roster — never the fleet. Only the master admin
// (access === null) gets an unrestricted (null) scope, which is the existing
// "always fleet" admin dashboard behavior and is unchanged by this.
//
// A pure decision, exported so the fix itself — not just its plumbing — has
// a direct, offline unit test (scripts/check-platform-cut.ts B-series).
export function resolveDashboardCloneScope(access: DashboardAccess, cloneId: string | null): string[] | null {
  if (!access) return null;
  return cloneId ? [cloneId] : [...access.cloneIds];
}

export async function getRevenueRollup(
  period: Period,
  cloneId: string | null,
  range?: DateRange,
  options?: { awaitFresh?: boolean; force?: boolean },
): Promise<CachedRevenue> {
  const access = await getDashboardAccess();
  await requireCloneAccess(cloneId);
  const key = `${accessCacheKey(access)}|${keyOf(period, cloneId, range)}`;
  const cached = cache.get(key);
  const dashboardCloneIds = resolveDashboardCloneScope(access, cloneId);

  if (cached) {
    const ageMs = Date.now() - cached.fetchedAt;
    const stale = ageMs > TTL_MS;
    if (options?.force) {
      const entry = await withDashboardAccess(access, () => refresh(key, period, cloneId, range, dashboardCloneIds));
      return { ...entry.value, reportWindow: entry.reportWindow, cachedAt: entry.fetchedAt, ageSeconds: 0, stale: false };
    }
    if (stale) {
      // Ordinary callers receive the last good snapshot while one refresh is
      // running. The live dashboard opts into awaitFresh so its once-a-minute
      // poll instead waits for that same single-flight refresh to finish.
      const updating = withDashboardAccess(access, () => refresh(key, period, cloneId, range, dashboardCloneIds));
      if (options?.awaitFresh) {
        const entry = await updating;
        return { ...entry.value, reportWindow: entry.reportWindow, cachedAt: entry.fetchedAt, ageSeconds: 0, stale: false };
      }
      updating.catch((e) => {
        console.error(`[revenue-cache] background refresh of ${key} failed:`, e);
      });
    }
    return { ...cached.value, reportWindow: cached.reportWindow, cachedAt: cached.fetchedAt, ageSeconds: Math.round(ageMs / 1000), stale };
  }

  // Cold. Nothing to serve, so this one waits. Errors propagate so the route can
  // return a 500 rather than an empty dashboard that reads as "you earned zero".
  const entry = await withDashboardAccess(access, () => refresh(key, period, cloneId, range, dashboardCloneIds));
  return { ...entry.value, reportWindow: entry.reportWindow, cachedAt: entry.fetchedAt, ageSeconds: 0, stale: false };
}

/**
 * Drop everything. For the "Refresh" affordance and for tests.
 *
 * Server actions that mutate clone config should NOT call this directly — call
 * invalidateCloneCaches() in lib/query-cache.ts, which clears this map and
 * revalidates the tagged unstable_cache entries in one go. Wiring only one of
 * the two leaves the dashboard half-stale, which is worse than either alone
 * because the header and the tiles then disagree.
 */
export function clearRevenueCache() {
  cache.clear();
}

