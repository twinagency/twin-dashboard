import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CREATOR_SESSION_COOKIE } from "./creator-session";
import { creatorDashboardIdentity } from "./creator-dashboard-identity";
import { CREATOR_PORTAL_COOKIE, creatorPortal, creatorAuthPath } from "./creator-routing";
export const getCreatorWorkspace = cache(async () => creatorDashboardIdentity((await cookies()).get(CREATOR_SESSION_COOKIE)?.value));
export async function requireCreatorWorkspace() {
  const identity = await getCreatorWorkspace();
  if (!identity) redirect(creatorAuthPath(creatorPortal((await cookies()).get(CREATOR_PORTAL_COOKIE)?.value), "login"));
  if (!identity.onboarded) redirect("/creator/onboarding");
  return identity;
}
