import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { agencyIdentity, agencyIdentityById, type AgencyIdentity } from "./agency-identity";
import { AGENCY_COOKIE } from "./agency-policy";
import { CREATOR_SESSION_COOKIE } from "./creator-session";
import { creatorDashboardIdentity, creatorDashboardIdentityById } from "./creator-dashboard-identity";
import { CREATOR_AUDIENCE_HEADER, isCreatorDashboardPath } from "./creator-dashboard-policy";
import { activeViewAs } from "./view-as";

export type DashboardAccess = AgencyIdentity | null; // null = independently gated internal admin/bearer/CLI
const scope = new AsyncLocalStorage<{ access: DashboardAccess }>();
export function withDashboardAccess<T>(access: DashboardAccess, fn: () => T): T {
  return scope.run({ access }, fn);
}
const requestAccess = cache(async (): Promise<DashboardAccess> => {
  let jar;
  try { jar = await cookies(); } catch (error) {
    if (error instanceof Error && /outside a request scope/.test(error.message)) return null;
    throw error;
  }
  const requestHeaders = await headers();
  const creatorAudience = requestHeaders.get(CREATOR_AUDIENCE_HEADER) === "creator"
    || isCreatorDashboardPath(requestHeaders.get("x-pathname"));
  const viewAs = await activeViewAs(jar);
  if (creatorAudience) {
    // Middleware strips caller-supplied audience headers. Independently verify
    // the cookie and current database ownership here as defense in depth.
    const creator = (await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value))
      ?? (viewAs?.targetType === "creator" ? await creatorDashboardIdentityById(viewAs.targetId) : null);
    if (!creator || !creator.onboarded) throw new Error("Creator session unavailable. Please sign in again.");
    return creator;
  }
  const token = jar.get(AGENCY_COOKIE)?.value;
  if (!token) {
    // No real agency cookie. Fall through to a "view as agency" identity if a
    // valid one is present; otherwise null (= internal admin), exactly as before.
    return viewAs?.targetType === "agency" ? await agencyIdentityById(viewAs.targetId) : null;
  }
  const agency = await agencyIdentity(token);
  if (!agency) throw new Error("Agency session expired. Please sign in again.");
  return agency;
});
export function getDashboardAccess(): Promise<DashboardAccess> {
  const active = scope.getStore();
  return active ? Promise.resolve(active.access) : requestAccess();
}
export function accessCacheKey(access: DashboardAccess): string {
  return access ? `agency:${access.id}:${[...access.cloneIds].sort().join(",")}${access.canManage === true ? ":manage" : ""}` : "admin";
}
export async function requireCloneAccess(id: string | null | undefined): Promise<void> {
  const access = await getDashboardAccess();
  if (access && id && !access.cloneIds.includes(id)) throw new Error("Creator access denied");
}
