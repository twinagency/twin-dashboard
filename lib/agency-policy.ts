export const AGENCY_COOKIE = "twin_agency_access";
export const isAgencyPath = (path: string) => path === "/agency" || path.startsWith("/agency/") || path === "/lynq" || path.startsWith("/lynq/");
export function agencyRequestAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (!isAgencyPath(path) || serverAction) return false;
  if (method === "GET" || method === "HEAD") return true;
  return method === "POST" && ["/agency/auth", "/agency/logout", "/agency/clone-scope", "/lynq/auth"].includes(path);
}
export function scopeAgencyClones(allowed: readonly string[], requested?: string): string[] {
  if (requested && !allowed.includes(requested)) throw new Error("Creator access denied");
  return requested ? [requested] : [...allowed];
}

export function agencyDashboardPath(path: string): boolean {
  if (["/", "/revenue", "/analytics", "/clones", "/users", "/media", "/info", "/flows", "/drip", "/messages", "/logs", "/business"].includes(path)) return true;
  if (/^\/clones\/[0-9a-f-]{36}(\/fans\/[0-9a-f-]{36})?$/i.test(path)) return true;
  return ["/api/dashboard", "/api/dashboard/day-insight", "/api/users/live", "/api/media-sign", "/api/fx", "/api/models", "/api/avatar", "/api/voice", "/api/business-account", "/api/business-connection"].includes(path);
}
