import { headers } from "next/headers";
import type { ReactNode } from "react";
import CreatorDashboardShell from "@/components/creator/CreatorDashboardShell";
import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
import { isCreatorPublicPath } from "@/lib/creator-routing";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getHeaderAllTimeStars } from "@/lib/query-cache";

export default async function CreatorLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get("x-pathname") || "/creator";
  if (isCreatorPublicPath(path) || path === "/creator/onboarding" || path.startsWith("/creator/data/")) return <>{children}</>;
  const identity = await requireCreatorDashboard();
  const stars = identity.cloneId
    ? await withDashboardAccess(identity, () => getHeaderAllTimeStars(identity.cloneId)).catch(() => null)
    : null;
  return <CreatorDashboardShell brand={identity.name} name={identity.cloneName || identity.displayName} stars={stars}>{children}</CreatorDashboardShell>;
}
