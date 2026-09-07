export const AGENCY_COOKIE = "twin_agency_access";
export const isAgencyPath = (path: string) => path === "/agency" || path.startsWith("/agency/");
export function agencyRequestAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (!isAgencyPath(path) || serverAction) return false;
  if (method === "GET" || method === "HEAD") return true;
  return method === "POST" && ["/agency/auth", "/agency/logout"].includes(path);
}
export function scopeAgencyClones(allowed: readonly string[], requested?: string): string[] {
  if (requested && !allowed.includes(requested)) throw new Error("Creator access denied");
  return requested ? [requested] : [...allowed];
}
