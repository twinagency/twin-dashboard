export const AGENCY_COOKIE = "twin_agency_access";
import { portalForPath } from "./partner-portals";
import { isMoxy } from "./agency-brand";
import { AGENCY_HYBRID_CRM_READ_ROUTES, AGENCY_LIVE_CRM_ROUTES } from "./agency-management-policy";
export const isAgencyPath = (path: string) => path === "/agency" || path.startsWith("/agency/") || !!portalForPath(path);
export function agencyRequestAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (!isAgencyPath(path) || serverAction) return false;
  if (method === "GET" || method === "HEAD") return true;
  return method === "POST" && ["/agency/auth", "/agency/logout", "/agency/clone-scope", "/lynq/auth", "/link/auth", "/moxy/auth", "/jess-and-kate-ai/auth", "/tether/auth"].includes(path);
}
export function scopeAgencyClones(allowed: readonly string[], requested?: string): string[] {
  if (requested && !allowed.includes(requested)) throw new Error("Creator access denied");
  return requested ? [requested] : [...allowed];
}

export function agencyDashboardPath(path: string, agencyName?: string, canManage = false): boolean {
  if (isMoxy(agencyName) && path === "/api/models") return false;
  if (canManage && (Object.hasOwn(AGENCY_LIVE_CRM_ROUTES,path) || AGENCY_HYBRID_CRM_READ_ROUTES.has(path) || ["/api/caption","/api/compile"].includes(path))) return true;
  if (["/", "/revenue", "/analytics", "/clones", "/users", "/media", "/sequences", "/info", "/flows", "/drip", "/messages", "/logs", "/business"].includes(path)) return true;
  if (/^\/clones\/[0-9a-f-]{36}(\/fans\/[0-9a-f-]{36})?$/i.test(path)) return true;
  if (/^\/sequences\/[0-9a-f-]{36}$/i.test(path)) return true;
  return ["/api/dashboard", "/api/dashboard/day-insight", "/api/users/live", "/api/media-sign", "/api/fx", "/api/models", "/api/avatar", "/api/voice", "/api/business-account", "/api/business-connection"].includes(path);
}
