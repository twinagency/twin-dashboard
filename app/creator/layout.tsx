import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import CreatorPageFrame from "@/components/creator/CreatorPageFrame";
import { getCreatorDashboardIdentity } from "@/lib/creator-dashboard-access";
import { isCreatorPublicPath } from "@/lib/creator-routing";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getHeaderAllTimeStars } from "@/lib/query-cache";

export default async function CreatorLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get("x-pathname") || "/creator";
  if (isCreatorPublicPath(path) || path.startsWith("/creator/data/")) return <>{children}</>;
  const identity = await getCreatorDashboardIdentity();
  if (!identity) redirect("/creator-auth/logout");
  const stars = identity.cloneId && identity.ready
    ? await withDashboardAccess(identity, () => getHeaderAllTimeStars(identity.cloneId)).catch(() => null)
    : null;
  // Protected page readiness checks run in each page, while the client frame
  // switches the chrome on navigation without freezing the onboarding layout.
  return <CreatorPageFrame brand={identity.name} name={identity.cloneName || identity.displayName} stars={stars}>{children}</CreatorPageFrame>;
}
