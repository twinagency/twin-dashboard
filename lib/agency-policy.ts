export const AGENCY_COOKIE = "twin_agency_access";
import { portalForPath } from "./partner-portals";
import { isMoxy } from "./agency-brand";
import { AGENCY_LIVE_CRM_ROUTES } from "./agency-management-policy";
export const isAgencyPath = (path: string) => path === "/agency" || path.startsWith("/agency/") || !!portalForPath(path);
export function agencyRequestAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (!isAgencyPath(path) || serverAction) return false;
  if (method === "GET" || method === "HEAD") return true;
  return method === "POST" && ["/agency/auth", "/agency/logout", "/agency/clone-scope", "/agency/creator-invites/manage", "/agency/creators/link", "/lynq/auth", "/link/auth", "/moxy/auth", "/jess-and-kate-ai/auth", "/tether/auth"].includes(path);
}
export function scopeAgencyClones(allowed: readonly string[], requested?: string): string[] {
  if (requested && !allowed.includes(requested)) throw new Error("Creator access denied");
  return requested ? [requested] : [...allowed];
}

// Prospect-agency preview login ("Twin Technologies", admin1): Earnings and the
// creator list only. Enforced here, so middleware 403s everything else too.
export const PARTNER_PREVIEW_AGENCY = "Twin Technologies";
export const isPartnerPreview = (agencyName?: string) => agencyName === PARTNER_PREVIEW_AGENCY;
// Edit (creator config, read only) was added back 2026-10-01: GET only, since
// agencyRequestAllowed blocks every server action for agency sessions.
const PREVIEW_PATHS = ["/", "/revenue", "/clones", "/api/dashboard", "/api/dashboard/day-insight", "/api/users/live", "/api/fx", "/api/avatar", "/api/media-sign", "/api/models", "/api/voice", "/api/business-account", "/api/business-connection"];

export function agencyDashboardPath(path: string, agencyName?: string, canManage = false): boolean {
  if (path === '/api/agency-overview') return isMoxy(agencyName);
  if (isPartnerPreview(agencyName)) return PREVIEW_PATHS.includes(path) || /^\/clones\/[0-9a-f-]{36}$/i.test(path);
  if (isMoxy(agencyName) && (path === "/api/models" || path === "/crm" || path.startsWith("/crm/"))) return false;
  if (canManage && (Object.hasOwn(AGENCY_LIVE_CRM_ROUTES,path) || ["/api/caption","/api/compile"].includes(path))) return true;
  if (["/", "/revenue", "/analytics", "/sales-health", "/clones", "/users", "/media", "/sequences", "/info", "/flows", "/drip", "/messages", "/logs", "/business", "/agency/creators", "/agency/creator-invites"].includes(path)) return true;
  if (/^\/clones\/[0-9a-f-]{36}(\/fans\/[0-9a-f-]{36})?$/i.test(path)) return true;
  if (/^\/sequences\/[0-9a-f-]{36}$/i.test(path)) return true;
  return ["/api/dashboard", "/api/dashboard/day-insight", "/api/users/live", "/api/media-sign", "/api/fx", "/api/models", "/api/avatar", "/api/voice", "/api/business-account", "/api/business-connection"].includes(path);
}
