import { agencyOnlyFansRequest } from "./agency-scope";
/** Called only after verifying Flirt's existing owner session, never for agency/creator logins. */
export function flirtOnlyFansRequest(path: string, method: string, serverAction: boolean): boolean {
  if (serverAction) return false;
  if (agencyOnlyFansRequest(path, method, false, true)) return true;
  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method) || /%(?:2f|5c)/i.test(path)) return false;
  return /^\/api\/onlyfans-(?:connections|content|configuration|controls|campaigns|launch)\//.test(path);
}
