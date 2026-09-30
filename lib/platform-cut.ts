// ── Platform cut: the master admin's percentage off gross earnings ──────────
//
// The platform (us) takes 2-60% of gross earnings, applied ALL-TIME at the
// CURRENT percentage — there is no dated history, no per-period rate. No row
// for a clone/agency means 0% (today's behaviour, unchanged until an admin
// sets one). Agencies and creators must only ever see NET (gross scaled by
// this cut); master admins keep seeing gross, the cut(s), and net.
//
// Resolution order for a clone's PLATFORM cut: clone override row, else the
// owning agency's row (via agency_creators), else 0.
//
// Owner-approved add-on: an agency may also take its OWN further cut from one
// of its creators, on top of the platform cut. A creator's net is therefore
// gross * (1 - platformPct/100) * (1 - agencyCreatorPct/100); an agency's own
// net is gross * (1 - platformPct/100) only (the agency-creator cut is what
// the agency keeps back from the creator, not something taken from the
// agency itself).
//
// Table shapes: db/migrations/186_platform_cuts.sql (twin-bot repo).
// Service-role only, RLS enabled, no public policies — same posture as
// partner_agencies/agency_creators (migration 145).
//
// Other code (this dashboard's routes, the public Twin API projections, other
// agents) imports this exact API. Do not rename any exported symbol.

import { cache } from "react";
import { supabaseAdmin } from "./supabase";
import { serviceClient } from "./supabase-service";
import { getDashboardAccess, requireCloneAccess, accessCacheKey, type DashboardAccess } from "./dashboard-access";
import { STAR_USD } from "./money";

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry<T> = { value: T; at: number };

// ── in-memory 60s caches ──────────────────────────────────────────────────
// Same "wiped on every deploy, no shared tier" posture as lib/revenue-cache.ts.
// These are tiny (one row per clone/agency) so a bounded Map is unnecessary.
const cloneCutCache = new Map<string, CacheEntry<number>>();
const agencyCutCache = new Map<string, CacheEntry<number>>();
const agencyCreatorCutCache = new Map<string, CacheEntry<number>>();
// clone_id -> owning agency_id (or null), cached alongside the above.
const cloneAgencyCache = new Map<string, CacheEntry<string | null>>();

function fresh<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) return undefined;
  return hit.value;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, { value, at: Date.now() });
}

/** Drop every cached cut. Call after any write through setCut/setAgencyCreatorCut. */
export function invalidateCutCache(): void {
  cloneCutCache.clear();
  agencyCutCache.clear();
  agencyCreatorCutCache.clear();
  cloneAgencyCache.clear();
}

// ── pure resolution logic (offline-testable, no Supabase) ────────────────
// Resolution order for the PLATFORM cut on a clone: its own row wins, else
// fall back to its owning agency's row, else 0 (no row anywhere = today's
// unchanged behaviour). Extracted so this order is a check-*.ts assertion,
// not something only provable by reading getCutPctForClone.
export function resolveClonePlatformPct(cloneRow: number | null, agencyRow: number | null): number {
  if (cloneRow != null) return cloneRow;
  if (agencyRow != null) return agencyRow;
  return 0;
}

// ── validation ────────────────────────────────────────────────────────────
const PLATFORM_MIN = 2;
const PLATFORM_MAX = 60;
const AGENCY_CREATOR_MIN = 0;
const AGENCY_CREATOR_MAX = 80;

/** Default star -> USD rate (what one Star pays out). Null in the DB means this. */
export const DEFAULT_USD_PER_STAR = STAR_USD;
export const USD_PER_STAR_MIN = 0.001;
export const USD_PER_STAR_MAX = 0.09;

/** A stored/typed rate becomes a usable one: null, junk or out-of-range falls back to the default. */
export function normalizeUsdPerStar(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (v == null || v === "" || !Number.isFinite(n) || n < USD_PER_STAR_MIN || n > USD_PER_STAR_MAX) return DEFAULT_USD_PER_STAR;
  return n;
}

function assertRange(pct: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(pct) || pct < min || pct > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}`);
  }
}

// ── owning agency lookup (for clone override -> agency fallback) ─────────
// A clone can be assigned to more than one agency (e.g. Toochi), so this
// returns every owner. Callers take the HIGHEST cut across them, which never
// shows anyone more than any one owner's arrangement allows.
async function agencyIdsForClone(cloneId: string): Promise<string[]> {
  const cached = fresh(cloneAgencyCache, cloneId);
  if (cached !== undefined) return cached ? cached.split(",") : [];
  const { data, error } = await serviceClient()
    .from("agency_creators")
    .select("agency_id")
    .eq("clone_id", cloneId);
  if (error) throw new Error(`Could not resolve owning agency for clone ${cloneId}: ${error.message}`);
  const ids = [...new Set((data ?? []).map((r) => String(r.agency_id)))].sort();
  setCache(cloneAgencyCache, cloneId, ids.length ? ids.join(",") : null);
  return ids;
}

/**
 * The PLATFORM cut for one clone: its own override row, else its agency's
 * row, else 0. This is the number that turns a creator's or agency's gross
 * into what they're SHOWN — never skip it on a money path.
 */
export async function getCutPctForClone(cloneId: string): Promise<number> {
  // Internal projection metadata is private, but required to calculate net
  // earnings. Authorize even cached lookups before using the service client.
  await requireCloneAccess(cloneId);
  const cached = fresh(cloneCutCache, cloneId);
  if (cached !== undefined) return cached;

  const { data, error } = await serviceClient()
    .from("platform_cuts")
    .select("cut_pct")
    .eq("clone_id", cloneId)
    .maybeSingle();
  if (error) throw new Error(`Could not read platform cut for clone ${cloneId}: ${error.message}`);

  const cloneRow = data ? Number(data.cut_pct) : null;
  let agencyRow: number | null = null;
  if (cloneRow == null) {
    const agencyIds = await agencyIdsForClone(cloneId);
    agencyRow = agencyIds.length ? Math.max(...(await Promise.all(agencyIds.map((id) => readAgencyPlatformCut(id))))) : null;
  }
  const pct = resolveClonePlatformPct(cloneRow, agencyRow);
  setCache(cloneCutCache, cloneId, pct);
  return pct;
}

/** The PLATFORM cut for one agency: its own row, else 0. */
export async function getCutPctForAgency(agencyId: string): Promise<number> {
  if (await getDashboardAccess()) throw new Error("Administrator access required");
  return readAgencyPlatformCut(agencyId);
}

// Only called after validating the creator and resolving its actual owners,
// or by the independently gated admin lookup above. Never a raw agency read.
async function readAgencyPlatformCut(agencyId: string): Promise<number> {
  const cached = fresh(agencyCutCache, agencyId);
  if (cached !== undefined) return cached;

  const { data, error } = await serviceClient()
    .from("platform_cuts")
    .select("cut_pct")
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error) throw new Error(`Could not read platform cut for agency ${agencyId}: ${error.message}`);

  const pct = data ? Number(data.cut_pct) : 0;
  setCache(agencyCutCache, agencyId, pct);
  return pct;
}

/**
 * The AGENCY'S OWN further cut taken from one of its creators, on top of the
 * platform cut. 0 if no row (independent creators, or an agency that has not
 * set one, both mean "the agency keeps nothing extra back").
 */
export async function getAgencyCreatorCutPct(cloneId: string): Promise<number> {
  await requireCloneAccess(cloneId);
  const cached = fresh(agencyCreatorCutCache, cloneId);
  if (cached !== undefined) return cached;

  const { data, error } = await serviceClient()
    .from("agency_creator_cuts")
    .select("cut_pct")
    .eq("clone_id", cloneId);
  if (error) throw new Error(`Could not read agency-creator cut for clone ${cloneId}: ${error.message}`);

  // Several owning agencies may each set a cut; the creator sees the lowest net.
  const pct = (data ?? []).reduce((max, r) => Math.max(max, Number(r.cut_pct) || 0), 0);
  setCache(agencyCreatorCutCache, cloneId, pct);
  return pct;
}

/** value * (1 - pct/100). The one true scaling formula — every money path
 *  that shows an agency or a creator a number must run it through this. */
export function applyCut(value: number, pct: number): number {
  return value * (1 - pct / 100);
}

/**
 * A creator's net, given gross and both cuts stacked: platform first, then
 * the agency's own cut off what's left. Order matters — it is NOT
 * gross * (1 - (platformPct + agencyPct)/100).
 */
export function applyStackedCut(value: number, platformPct: number, agencyCreatorPct: number): number {
  return applyCut(applyCut(value, platformPct), agencyCreatorPct);
}

// ── viewer terms: ONE multiplier + ONE star rate per logged-in account ────
//
// starMult is what fraction of gross earnings this viewer keeps
// ((1-platform/100) * (1-agencyCreator/100)); usdPerStar is the rate their
// star figures convert to money at. Admins are {1, 0.013}. The multiplier is
// applied at the data layer (lib/agency-fetch.ts) so gross never reaches a
// non-admin browser; a cut lookup failure THROWS, it never falls back to gross.

export type ViewerTerms = { starMult: number; usdPerStar: number };

export function computeStarMult(platformPct: number, agencyCreatorPct: number): number {
  return (1 - platformPct / 100) * (1 - agencyCreatorPct / 100);
}

type CutRowLite = { cut_pct: number | string | null; usd_per_star: number | string | null };

async function readCutRows(column: "agency_id" | "clone_id", ids: string[]): Promise<CutRowLite[]> {
  if (!ids.length) return [];
  const { data, error } = await serviceClient().from("platform_cuts").select("cut_pct,usd_per_star").in(column, ids);
  if (error) throw new Error(`Could not read platform cut: ${error.message}`);
  return (data ?? []) as CutRowLite[];
}

/** Of several rows (multiple owning agencies) take the highest cut; its rate goes with it. */
function pickRow(rows: CutRowLite[]): { pct: number; usdPerStar: number } | null {
  let best: { pct: number; usdPerStar: number } | null = null;
  for (const r of rows) {
    const pct = Number(r.cut_pct) || 0;
    if (!best || pct > best.pct) best = { pct, usdPerStar: normalizeUsdPerStar(r.usd_per_star) };
  }
  return best;
}

async function creatorTerms(cloneId: string): Promise<ViewerTerms> {
  const cloneRow = pickRow(await readCutRows("clone_id", [cloneId]));
  let base = cloneRow;
  if (!base) {
    const owners = await agencyIdsForClone(cloneId);
    base = pickRow(await readCutRows("agency_id", owners));
  }
  const { data, error } = await serviceClient().from("agency_creator_cuts").select("cut_pct").eq("clone_id", cloneId);
  if (error) throw new Error(`Could not read agency-creator cut for clone ${cloneId}: ${error.message}`);
  const acPct = (data ?? []).reduce((max, r) => Math.max(max, Number(r.cut_pct) || 0), 0);
  return {
    starMult: computeStarMult(base?.pct ?? 0, acPct),
    usdPerStar: base?.usdPerStar ?? DEFAULT_USD_PER_STAR,
  };
}

async function termsForAccess(access: NonNullable<DashboardAccess>): Promise<ViewerTerms> {
  if ((access as { kind?: string }).kind === "creator") {
    if (!access.cloneIds.length) throw new Error("No creator assigned to resolve an earnings split");
    // Several assigned clones: show the one with the lowest net, never more than any allows.
    const all = await Promise.all(access.cloneIds.map(creatorTerms));
    return all.reduce((lo, t) => (t.starMult < lo.starMult ? t : lo));
  }
  const row = pickRow(await readCutRows("agency_id", [access.id]));
  return { starMult: computeStarMult(row?.pct ?? 0, 0), usdPerStar: row?.usdPerStar ?? DEFAULT_USD_PER_STAR };
}

// React cache() keys on primitive args, so it is per request AND per identity.
const termsMemo = cache(async (id: string, kind: string, cloneIdsCsv: string): Promise<ViewerTerms> =>
  termsForAccess({ id, kind, cloneIds: cloneIdsCsv ? cloneIdsCsv.split(",") : [] } as unknown as NonNullable<DashboardAccess>));

// Test seam only (offline checks have no database). null = real lookup.
let termsOverride: ((access: NonNullable<DashboardAccess>) => Promise<ViewerTerms>) | null = null;
export function __setViewerTermsOverrideForTests(fn: typeof termsOverride): void { termsOverride = fn; }

/** Terms for an access identity (null = admin). Throws if the cut cannot be resolved. */
export async function getViewerTermsFor(access: DashboardAccess): Promise<ViewerTerms> {
  if (access && termsOverride) return termsOverride(access);
  if (!access) return { starMult: 1, usdPerStar: DEFAULT_USD_PER_STAR };
  return termsMemo(access.id, (access as { kind?: string }).kind ?? "agency", [...access.cloneIds].sort().join(","));
}

/** Terms for the current viewer. Works inside withDashboardAccess / unstable_cache. */
export async function getViewerTerms(): Promise<ViewerTerms> {
  return getViewerTermsFor(await getDashboardAccess());
}

/** accessCacheKey + the viewer's terms, so a cached NET value can never outlive a cut change. */
export async function viewerCacheKey(access: DashboardAccess): Promise<string> {
  const base = accessCacheKey(access);
  if (!access) return base;
  const t = await getViewerTermsFor(access);
  return `${base}|m${t.starMult}|r${t.usdPerStar}`;
}

// ── admin listing/editing (platform cuts) ─────────────────────────────────

export type CutRow = { kind: "agency" | "clone"; id: string; name: string; cutPct: number | null; usdPerStar: number | null };

/** Every agency and every clone, each with its platform_cuts row if one exists. */
export async function listCuts(): Promise<CutRow[]> {
  const [agenciesRes, clonesRes, cutsRes] = await Promise.all([
    supabaseAdmin.from("partner_agencies").select("id,name").order("name", { ascending: true }),
    supabaseAdmin.from("clones").select("id,name").order("name", { ascending: true }),
    supabaseAdmin.from("platform_cuts").select("agency_id,clone_id,cut_pct,usd_per_star"),
  ]);
  if (agenciesRes.error) throw new Error(`Could not list agencies: ${agenciesRes.error.message}`);
  if (clonesRes.error) throw new Error(`Could not list clones: ${clonesRes.error.message}`);
  if (cutsRes.error) throw new Error(`Could not list platform cuts: ${cutsRes.error.message}`);

  const cutByAgency = new Map<string, number>();
  const cutByClone = new Map<string, number>();
  const rateByAgency = new Map<string, number>();
  const rateByClone = new Map<string, number>();
  for (const row of cutsRes.data ?? []) {
    const rate = row.usd_per_star == null ? null : Number(row.usd_per_star);
    if (row.agency_id) { cutByAgency.set(row.agency_id, Number(row.cut_pct)); if (rate != null) rateByAgency.set(row.agency_id, rate); }
    if (row.clone_id) { cutByClone.set(row.clone_id, Number(row.cut_pct)); if (rate != null) rateByClone.set(row.clone_id, rate); }
  }

  const rows: CutRow[] = [];
  for (const a of agenciesRes.data ?? []) {
    rows.push({ kind: "agency", id: a.id, name: a.name, cutPct: cutByAgency.get(a.id) ?? null, usdPerStar: rateByAgency.get(a.id) ?? null });
  }
  for (const c of clonesRes.data ?? []) {
    rows.push({ kind: "clone", id: c.id, name: c.name, cutPct: cutByClone.get(c.id) ?? null, usdPerStar: rateByClone.get(c.id) ?? null });
  }
  return rows;
}

/**
 * Set (or clear, with pct null) the PLATFORM cut for one agency or one clone.
 * Exactly one of agencyId/cloneId must be given. Validated server-side
 * against the 2-60 range regardless of what the caller already checked.
 */
export async function setCut(
  target: { agencyId?: string; cloneId?: string },
  pct: number | null,
  by: string,
  usdPerStar: number | null = null,
): Promise<void> {
  const { agencyId, cloneId } = target;
  if ((agencyId == null) === (cloneId == null)) {
    throw new Error("setCut requires exactly one of agencyId or cloneId");
  }

  if (pct === null) {
    const query = supabaseAdmin.from("platform_cuts").delete();
    const { error } = agencyId ? await query.eq("agency_id", agencyId) : await query.eq("clone_id", cloneId!);
    if (error) throw new Error(`Could not clear platform cut: ${error.message}`);
    invalidateCutCache();
    return;
  }

  assertRange(pct, PLATFORM_MIN, PLATFORM_MAX, "Platform cut");
  // null = "use the default 0.013"; anything else must be in range (no silent clamping).
  if (usdPerStar !== null) assertRange(usdPerStar, USD_PER_STAR_MIN, USD_PER_STAR_MAX, "Dollars per star");

  const row: { agency_id: string | null; clone_id: string | null; cut_pct: number; usd_per_star: number | null; updated_at: string; updated_by: string } = agencyId
    ? { agency_id: agencyId, clone_id: null, cut_pct: pct, usd_per_star: usdPerStar, updated_at: new Date().toISOString(), updated_by: by }
    : { agency_id: null, clone_id: cloneId!, cut_pct: pct, usd_per_star: usdPerStar, updated_at: new Date().toISOString(), updated_by: by };
  const { error } = await supabaseAdmin
    .from("platform_cuts")
    .upsert(row, { onConflict: agencyId ? "agency_id" : "clone_id" });
  if (error) throw new Error(`Could not set platform cut: ${error.message}`);
  invalidateCutCache();
}

// ── admin listing/editing (agency-creator cuts) ────────────────────────────

export type AgencyCreatorCutRow = { cloneId: string; name: string; cutPct: number | null };

/** Every creator belonging to this agency, with its agency_creator_cuts row if one exists. */
export async function listAgencyCreatorCuts(agencyId: string): Promise<AgencyCreatorCutRow[]> {
  const { data: creatorLinks, error: linkErr } = await supabaseAdmin
    .from("agency_creators")
    .select("clone_id")
    .eq("agency_id", agencyId);
  if (linkErr) throw new Error(`Could not list creators for agency ${agencyId}: ${linkErr.message}`);

  const cloneIds = (creatorLinks ?? []).map((r) => r.clone_id as string);
  if (cloneIds.length === 0) return [];

  const [clonesRes, cutsRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name").in("id", cloneIds),
    supabaseAdmin.from("agency_creator_cuts").select("clone_id,cut_pct").eq("agency_id", agencyId),
  ]);
  if (clonesRes.error) throw new Error(`Could not list clones: ${clonesRes.error.message}`);
  if (cutsRes.error) throw new Error(`Could not list agency-creator cuts: ${cutsRes.error.message}`);

  const cutByClone = new Map<string, number>();
  for (const row of cutsRes.data ?? []) cutByClone.set(row.clone_id as string, Number(row.cut_pct));

  return (clonesRes.data ?? []).map((c) => ({
    cloneId: c.id,
    name: c.name,
    cutPct: cutByClone.get(c.id) ?? null,
  }));
}

/**
 * Set (or clear, with pct null) the AGENCY'S OWN cut off one of its
 * creators. Validated: 0-80 range, and that the clone actually belongs to
 * this agency (agency_creators) — an agency may not set a cut on a creator
 * it does not own.
 */
export async function setAgencyCreatorCut(
  agencyId: string,
  cloneId: string,
  pct: number | null,
  by: string,
): Promise<void> {
  // Validate before touching the network: fail fast on bad input rather than
  // spend a round trip verifying ownership for a value we'll reject anyway.
  if (pct !== null) assertRange(pct, AGENCY_CREATOR_MIN, AGENCY_CREATOR_MAX, "Agency-creator cut");

  const { data: link, error: linkErr } = await supabaseAdmin
    .from("agency_creators")
    .select("clone_id")
    .eq("agency_id", agencyId)
    .eq("clone_id", cloneId)
    .maybeSingle();
  if (linkErr) throw new Error(`Could not verify agency-creator link: ${linkErr.message}`);
  if (!link) throw new Error("That creator does not belong to this agency");

  if (pct === null) {
    const { error } = await supabaseAdmin
      .from("agency_creator_cuts")
      .delete()
      .eq("agency_id", agencyId)
      .eq("clone_id", cloneId);
    if (error) throw new Error(`Could not clear agency-creator cut: ${error.message}`);
    invalidateCutCache();
    return;
  }

  const { error } = await supabaseAdmin.from("agency_creator_cuts").upsert(
    {
      agency_id: agencyId,
      clone_id: cloneId,
      cut_pct: pct,
      updated_at: new Date().toISOString(),
      updated_by: by,
    },
    { onConflict: "agency_id,clone_id" },
  );
  if (error) throw new Error(`Could not set agency-creator cut: ${error.message}`);
  invalidateCutCache();
}
