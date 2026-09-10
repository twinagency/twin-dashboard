import { headers } from "next/headers";
import CreatorWorkspaceShell from "@/components/CreatorWorkspaceShell";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { isCreatorDashboardPath } from "@/lib/creator-dashboard-policy";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getHeaderAllTimeStars } from "@/lib/query-cache";

export const dynamic = "force-dynamic";
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (!isCreatorDashboardPath(pathname)) return <>{children}</>;
  const creator = await requireCreatorWorkspace();
  const cloneId = creator.cloneIds[0] ?? null;
  const allTimeStars = cloneId ? await withDashboardAccess(creator, () => getHeaderAllTimeStars(cloneId)) : 0;
  return <CreatorWorkspaceShell agencyName={creator.name} creatorName={creator.creatorName} connected={!!cloneId} allTimeStars={allTimeStars}>{children}</CreatorWorkspaceShell>;
}
