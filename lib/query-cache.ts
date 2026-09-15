import { getDashboardAccess, withDashboardAccess, accessCacheKey } from "./dashboard-access";
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { chartColorForClone, profileImagePathForClone } from "@/lib/colors";
import { getTwinVersion, type TwinVersion } from "@/lib/twin-version";

// Shared caching layer for the reads every page load repeats.
//
// TWO DIFFERENT CACHES LIVE HERE, and confusing them is how this file breaks:
//
//   React cache()      per-REQUEST memoization. One render tree = one call, no
//                      matter how many components ask. Never outlives the
//                      request, so it cannot serve stale data and cannot leak
//                      across operators. Always safe.
//
//   unstable_cache()   cross-request, process/data-cache lifetime, with a TTL.
//                      This is the one that can be wrong, so every entry here
//                      declares its TTL and its tags, and any scoping value
//                      (clone id) is passed as an EXPLICIT key part.
//
// THE KEYING RULE — read before adding anything:
//   An unstable_cache callback must never read cookies() or headers(), directly
//   or through a helper. Next.js will throw if it does, but the more dangerous
//   version is subtler: a value *derived* from a cookie before the callback and
//   then closed over WITHOUT appearing in the key. That entry gets stored under
//   a key that does not mention the scope, and the next operator with a
//   different clone selected is served it. Ronan's whole fleet view is
//   clone-scoped, so this is not a theoretical leak.
//
//   The enforcement pattern used throughout this file: build the cached
//   function inside a wrapper and put the scoping value in `keyParts`, so the
//   key literally cannot drift from what the closure captured. Do not hoist
//   these to module scope with the argument only passed at call time.
//
// WIPED ON EVERY DEPLOY. Both caches live inside the single long-lived
// container (twin-ops/deploy.sh, `--memory=1g`), so a deploy — or any container
// restart — starts cold and the first page load after it pays full price. That
// is EXPECTED, not a bug: there is no shared cache tier and deliberately no
// Redis. The only thing to watch for is memory, which is why nothing here
// caches large row arrays (star_transactions, usage_events, users). The heavy
// rollups keep their own bounded, TTL'd cache in lib/revenue-cache.ts.

/** Tags for targeted invalidation from server actions. See invalidateCloneCaches(). */
export const CACHE_TAGS = {
  /** The fleet clone list, clone-existence checks, anything reading `clones`. */
  clones: "clones",
  /** The twin_versions row behind the sidebar chip and update popup. */
  twinVersion: "twin-version",
  /** Money readouts cached here (currently the header all-time stars). */
  revenue: "revenue",
} as const;

// TTLs, in seconds. Deliberately few and named, so the next person picks one
// rather than inventing a number.
const TTL = {
  /** Config-shaped data: changes only when an operator saves a form. */
  config: 300,
  /** Money. Matches the 60s in lib/revenue-cache.ts — that is the precedent for
   *  how stale a number on this dashboard is ever allowed to be. */
  money: 60,
} as const;

/**
 * unstable_cache with the key spelled out at the call site.
 *
 * `keyParts` must contain EVERY value the callback closes over that changes the
 * result — above all any clone id. `fn` takes no arguments on purpose: there is
 * no second channel through which an unkeyed value can reach it.
 */
async function cached<T>(keyParts: string[], tags: string[], ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const access = await getDashboardAccess();
  return unstable_cache(() => withDashboardAccess(access, fn), [...keyParts, accessCacheKey(access)], { revalidate: ttlSeconds, tags })();
}

// ── Clones ───────────────────────────────────────────────────────────────────

export type FleetClone = { id: string; name: string; color: string; photoUrl?: string };

type FleetCloneRow = { id: string; name: string; color: string; photoPath?: string };

/**
 * The fleet clone list plus each clone's cover-photo STORAGE PATH.
 *
 * Cache key: ["fleet-clones"] — fleet-wide, not scoped to anything, so there is
 * nothing per-operator to key on. Tag: clones. TTL: 300s.
 *
 * Two DB round trips (clones, then photos) collapse to zero on a warm read.
 * ~11 clones and one path each: kilobytes, not megabytes.
 */
function fleetCloneRows(): Promise<FleetCloneRow[]> {
  return cached(["fleet-clones"], [CACHE_TAGS.clones], TTL.config, async () => {
    const { data } = await supabaseAdmin
      .from("clones")
      .select("id,name,intake")
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as { id: string; name: string; intake: unknown }[];

    const firstPath = new Map<string, string>();
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      for (const clone of rows) {
        const customPath = profileImagePathForClone(clone.intake);
        if (customPath) firstPath.set(clone.id, customPath);
      }
      const { data: photos } = await supabaseAdmin
        .from("photos")
        .select("clone_id, storage_path")
        .in("clone_id", ids)
        .order("created_at", { ascending: true });
      for (const p of photos ?? []) {
        if (p.clone_id && !firstPath.has(p.clone_id)) firstPath.set(p.clone_id, p.storage_path);
      }
    }

    return rows.map((c, i) => ({
      id: c.id,
      name: c.name,
      color: chartColorForClone(c.intake, i),
      photoPath: firstPath.get(c.id),
    }));
  });
}

/**
 * The fleet clone list with SIGNED avatar URLs, for the sidebar and TopBar.
 *
 * Signing is deliberately OUTSIDE the cross-request cache and only memoized
 * per-request. A signed URL expires an hour after it is minted; an
 * unstable_cache entry has no such bound — Next serves a stale entry until the
 * next request comes in to trigger revalidation, so an idle dashboard reopened
 * hours later would render an entry full of expired URLs and every avatar would
 * 403. Caching the paths (which never expire) and re-signing per request keeps
 * that impossible while still removing the two DB round trips.
 *
 * Never throws: the app shell renders with an empty clone list if the DB or
 * storage is unreachable, exactly as it did before this cache existed.
 */
export const getFleetClones = cache(async (): Promise<FleetClone[]> => {
  try {
    const rows = await fleetCloneRows();
    const entries = rows.filter((r) => r.photoPath).map((r) => [r.id, r.photoPath!] as const);
    const photoByClone = new Map<string, string>();
    if (entries.length) {
      const { data: signed } = await supabaseAdmin.storage
        .from("media")
        .createSignedUrls(entries.map((e) => e[1]), 3600);
      (signed ?? []).forEach((s, i) => {
        if (s.signedUrl) photoByClone.set(entries[i][0], s.signedUrl);
      });
    }
    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, photoUrl: photoByClone.get(r.id) }));
  } catch {
    return [];
  }
});

/**
 * Does this clone id still exist? Backs the stale-cookie guard in
 * lib/clone-scope.ts.
 *
 * Cache key: ["clone-exists", id] — the id is an explicit key part, so one
 * clone's answer can never be served for another. Tag: clones. TTL: 300s.
 * A deleted clone stays "valid" for at most 300s, which costs a page render of
 * empty data and then falls back to All — the same behaviour a stale cookie
 * already had before this cache existed.
 */
export const cloneExists = cache(async (id: string): Promise<boolean> => {
  try {
    return await cached(["clone-exists", id], [CACHE_TAGS.clones], TTL.config, async () => {
      const { data } = await supabaseAdmin.from("clones").select("id").eq("id", id).maybeSingle();
      return Boolean(data);
    });
  } catch {
    // A DB blip must not silently reset the operator's clone selection.
    return true;
  }
});

// ── Twin version ─────────────────────────────────────────────────────────────

/**
 * The current Twin version row (sidebar chip + update popup).
 *
 * Cache key: ["twin-version"]. Tag: twin-version. TTL: 300s. Written only by
 * tools/twin-release.ts when a release is cut, and a release restarts the
 * container anyway, so this is effectively never stale in practice.
 */
export const getCachedTwinVersion = cache((): Promise<TwinVersion | null> =>
  cached(["twin-version"], [CACHE_TAGS.twinVersion], TTL.config, getTwinVersion),
);

// ── Money ────────────────────────────────────────────────────────────────────

/**
 * All-time cash + stars for the TopBar readout, scoped by the clone switcher.
 *
 * Cache key: ["header-all-time-stars", cloneId ?? "fleet"] — the clone id is an
 * EXPLICIT key part and the cached closure is built per call, so the fleet
 * total and a clone's total can never be served for one another.
 *
 * TTL: 60s, matching lib/revenue-cache.ts. This is a money number, so it gets
 * the same staleness bound as the rest of the money on this dashboard and no
 * more — an all-time total moving by one purchase inside a minute is invisible
 * at this magnitude, but a 5-minute number would not be defensible.
 *
 * Aggregated in SQL by the revenue_all_time_stars RPC (migration 135); this
 * caches the single scalar it returns, never rows.
 */
export type HeaderAllTimeStarsResult = {
  stars: number | null;
  available: boolean;
};

/** Same cached ledger read as getHeaderAllTimeStars(), but preserves whether
 * Supabase actually returned a value. Use this on surfaces where showing a
 * genuine zero and showing a failed read as zero would mean different things. */
export function getHeaderAllTimeStarsResult(cloneId: string | null): Promise<HeaderAllTimeStarsResult> {
  return cached(
    ["header-all-time-stars", cloneId ?? "fleet"],
    [CACHE_TAGS.revenue],
    TTL.money,
    async () => {
      try {
        const { data, error } = await supabaseAdmin.rpc("revenue_all_time_stars", { p_clone: cloneId ?? null });
        if (error) return { stars: null, available: false };
        const stars = Number(data ?? 0);
        return Number.isFinite(stars)
          ? { stars, available: true }
          : { stars: null, available: false };
      } catch {
        return { stars: null, available: false };
      }
    },
  );
}

export async function getHeaderAllTimeStars(cloneId: string | null): Promise<number> {
  // Preserve the long-standing TopBar/layout contract: those callers continue
  // to render zero when the ledger cannot be reached.
  return (await getHeaderAllTimeStarsResult(cloneId)).stars ?? 0;
}

// ── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Drop everything derived from clone config. Call this from any server action
 * that writes to `clones` (create/update/delete/pause/toggle/dial, and the
 * settings-page fan-out that updates many clones at once).
 *
 * revalidatePath() alone is NOT enough: it re-renders the route but does not
 * reliably clear tagged unstable_cache entries, so without this a renamed or
 * newly-created clone would keep missing from the sidebar for up to 300s.
 *
 * SERVER ACTIONS / ROUTE HANDLERS ONLY — revalidateTag throws during render.
 */
export async function invalidateCloneCaches() {
  revalidateTag(CACHE_TAGS.clones);
  revalidateTag(CACHE_TAGS.revenue);
  // Dynamic so the heavy rollup modules behind revenue-cache (analytics-data,
  // dashboard-data, select-all) stay out of the root layout's module graph —
  // this file is imported by app/layout.tsx, which must stay cheap to load.
  const { clearRevenueCache } = await import("./revenue-cache");
  clearRevenueCache();
}

/** Drop the cached Twin version row. For tools/twin-release.ts's write path. */
export function invalidateTwinVersionCache() {
  revalidateTag(CACHE_TAGS.twinVersion);
}

