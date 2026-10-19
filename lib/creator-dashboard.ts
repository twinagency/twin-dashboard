import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CREATOR_SESSION_COOKIE } from "./creator-session";
import { creatorDashboardIdentity, creatorDashboardIdentityById } from "./creator-dashboard-identity";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "./creator-routing";
import { activeViewAs } from "./view-as";

export const getCreatorWorkspace = cache(async () => {
  const jar = await cookies();
  const real = await creatorDashboardIdentity(jar.get(CREATOR_SESSION_COOKIE)?.value);
  if (real) return real;
  const viewAs = await activeViewAs(jar);
  return viewAs?.targetType === "creator" ? creatorDashboardIdentityById(viewAs.targetId) : null;
});
export async function requireCreatorWorkspace(options?: { allowPlatformSetup?: boolean }) {
  const identity = await getCreatorWorkspace();
  if (!identity) redirect(creatorLoginPath(identity, (await cookies()).get(CREATOR_PORTAL_COOKIE)?.value));
  if (!identity.onboarded && !options?.allowPlatformSetup) redirect("/creator/onboarding");
  return identity;
}
