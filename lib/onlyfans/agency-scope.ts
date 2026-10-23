import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../onlyfans-preview/types";
/** Server-created narrowing. Never populate this from browser headers or JSON. */
export const AGENCY_SCOPE_HEADER = "X-OnlyFans-Agency-Scope";
export const AGENCY_ACCESS_HEADER = "X-OnlyFans-Access-Version";
export const AGENCY_ACCESS_VERSION = "of-agency.v1";
export type AgencyGrant = { creatorIds: string[]; actor: string; canManage: boolean };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function agencyGrant(identity: { id: string; userId?: string; cloneIds: string[]; canManage?: boolean }, canManage: boolean): AgencyGrant | null {
  if (!uuid.test(identity.id) || !identity.userId || !uuid.test(identity.userId) || identity.cloneIds.some(id => !uuid.test(id))) return null;
  return { creatorIds: [...new Set(identity.cloneIds.map(id => id.toLowerCase()))].sort(),
    actor: `agency-user:${identity.id.toLowerCase()}:${identity.userId.toLowerCase()}`, canManage: canManage && identity.canManage === true };
}

/** Both the preflight and every response must confirm scope support. This
 * prevents a rolling release from sending agency writes to an older service. */
export function agencyScopedFetch(grant: AgencyGrant, options: { baseUrl: string; token: string }, fetchImpl: typeof fetch = fetch): typeof fetch {
  const scope = JSON.stringify(grant);
  const base = options.baseUrl.replace(/\/+$/, "");
  let ready: Promise<boolean> | undefined;
  const refused = () => Response.json({ ok: false, code: "agency_scope_unavailable", error: "Scoped agency access is not available. Refresh before trying again." }, { status: 503 });
  return async (input, init) => {
    const url = String(input);
    if (!url.startsWith(base + "/onlyfans/") || scope.length > 12288 || (!grant.canManage && !["GET", "HEAD"].includes(init?.method ?? "GET"))) return refused();
    ready ??= fetchImpl(base + "/onlyfans/agency/v1/api/v1/status", { method: "GET", cache: "no-store", redirect: "error", credentials: "omit",
      signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${options.token}`, "X-OnlyFans-Schema-Version": ONLYFANS_PREVIEW_SCHEMA_VERSION, [AGENCY_SCOPE_HEADER]: scope } })
      .then(response => response.ok && response.headers.get(AGENCY_ACCESS_HEADER) === AGENCY_ACCESS_VERSION).catch(() => false);
    if (!await ready) return refused();
    const headers = new Headers(init?.headers);
    headers.set(AGENCY_SCOPE_HEADER, scope);
    const response = await fetchImpl(base + "/onlyfans/agency/v1" + url.slice((base + "/onlyfans").length), { ...init, headers });
    if (response.headers.get(AGENCY_ACCESS_HEADER) !== AGENCY_ACCESS_VERSION) { await response.body?.cancel(); return refused(); }
    return response;
  };
}

/** Explicit route list: connections, operator diagnostics and combined earnings
 * remain under their original owners. Future routes default to unavailable. */
export function agencyOnlyFansRequest(path: string, method: string, serverAction: boolean, canManage: boolean): boolean {
  if (serverAction) return false;
  // Next keeps percent escapes in pathname; conversation IDs contain a colon.
  // Decode once for the route policy without allowing encoded path separators.
  if (/%(?:2f|5c)/i.test(path)) return false;
  try { path = decodeURIComponent(path); } catch { return false; }
  if (["GET", "HEAD"].includes(method) && /^\/onlyfans(?:\/(?:accounts|inbox|content|sales|settings|campaigns|launch(?:\/(?:automation|memory))?))?\/?$/.test(path)) return true;
  const api = /^\/api\/onlyfans\/accounts(?:\/[A-Za-z0-9._:-]{1,64}\/(?:conversations(?:\/[A-Za-z0-9._:-]{1,64}(?:\/handover)?)?|workspace\/(?:content|sales|settings)))?\/?$/.test(path);
  const purpose = /^\/api\/onlyfans-(?:controls|configuration|content|campaigns)\/accounts\/[A-Za-z0-9._:-]{1,64}(?:\/.*)?$/.test(path);
  // Launch routes have a section before /accounts. Whitelist delivered routes
  // and their methods explicitly; future launch endpoints remain default-deny.
  const launchRead = /^\/api\/onlyfans-launch\/(?:abc\/accounts\/[A-Za-z0-9._:-]{1,64}\/(?:access|readiness|purchases(?:\/evidence)?|personality(?:\/history|\/revisions\/[1-9][0-9]{0,9})?)|memory\/accounts\/[A-Za-z0-9._:-]{1,64}\/fans(?:\/[1-9][0-9]{0,17})?|automation\/accounts\/[A-Za-z0-9._:-]{1,64}\/(?:follow-ups(?:\/[a-f0-9-]{36})?|settings|emergency-stop))\/?$/.test(path);
  const launchPost = /^\/api\/onlyfans-launch\/(?:abc\/accounts\/[A-Za-z0-9._:-]{1,64}\/command|automation\/accounts\/[A-Za-z0-9._:-]{1,64}\/(?:follow-ups|settings|emergency-stop)|memory\/accounts\/[A-Za-z0-9._:-]{1,64}\/(?:fans\/[1-9][0-9]{0,17}\/)?backfill)\/?$/.test(path);
  const launchPatch = /^\/api\/onlyfans-launch\/memory\/accounts\/[A-Za-z0-9._:-]{1,64}\/fans\/[A-Za-z0-9._:-]{1,64}\/?$/.test(path);
  if ((launchRead && ["GET", "HEAD"].includes(method)) ||
      (canManage && ((launchPost && method === "POST") || (launchPatch && method === "PATCH")))) return true;
  return (api && ["GET", "HEAD"].includes(method)) || (purpose && (["GET", "HEAD"].includes(method) || (method === "POST" && canManage)));
}
