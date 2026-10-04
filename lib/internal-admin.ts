import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { CREATOR_SESSION_COOKIE } from "./creator-session";
import { AGENCY_COOKIE } from "./agency-policy";

/** Null dashboard access is not proof of an authenticated internal administrator. */
export async function hasInternalAdminAccess(): Promise<boolean> {
  const jar = await cookies();
  // Login clears other audience cookies. Mixed contexts must start a clean login.
  if (jar.get(CREATOR_SESSION_COOKIE)?.value || jar.get(AGENCY_COOKIE)?.value) return false;
  try { return await verifySessionToken(jar.get(SESSION_COOKIE)?.value); }
  catch { return false; }
}
export async function requireInternalAdmin(): Promise<void> {
  if (!await hasInternalAdminAccess()) throw new Error("Administrator access required");
}
