import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { cookies } from "next/headers";
import { agencyIdentity, type AgencyIdentity } from "./agency-identity";
import { AGENCY_COOKIE } from "./agency-policy";
import { SESSION_COOKIE, verifySessionToken } from "./session";
export type DashboardAccess = AgencyIdentity | null; // null = internal admin/bearer/CLI
const scope = new AsyncLocalStorage<{ access: DashboardAccess }>();
export function withDashboardAccess<T>(access: DashboardAccess, fn: () => T): T {
  return scope.run({ access }, fn);
}
const requestAccess = cache(async (): Promise<DashboardAccess> => {
  let jar;
  try { jar = await cookies(); } catch (error) {
    // Offline scripts have no request. Other errors (including cache misuse)
    // must fail closed instead of accidentally granting fleet access.
    if (error instanceof Error && /outside a request scope/.test(error.message)) return null;
    throw error;
  }
  const token = jar.get(AGENCY_COOKIE)?.value;
  if (!token) return null; // public auth endpoints and separately gated bearer APIs
  const agency = await agencyIdentity(token);
  if (!agency) throw new Error("Agency session expired. Please sign in again.");
  return agency;
});
export function getDashboardAccess(): Promise<DashboardAccess> {
  const active = scope.getStore();
  return active ? Promise.resolve(active.access) : requestAccess();
}
export function accessCacheKey(access: DashboardAccess): string {
  return access ? `agency:${access.id}:${[...access.cloneIds].sort().join(",")}` : "admin";
}
export async function requireCloneAccess(id: string | null | undefined): Promise<void> {
  const access = await getDashboardAccess();
  if (access && id && !access.cloneIds.includes(id)) throw new Error("Creator access denied");
}
