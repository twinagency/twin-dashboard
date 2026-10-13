import { headers } from "next/headers";
import CreatorWorkspaceShell from "@/components/CreatorWorkspaceShell";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { isCreatorDashboardPath } from "@/lib/creator-dashboard-policy";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getViewerTerms } from "@/lib/platform-cut";
import { getFleetClones, getHeaderAllTimeStars } from "@/lib/query-cache";
import { getViewAsBannerInfo } from "@/lib/view-as-banner";
import ViewAsBanner from "@/components/ViewAsBanner";
export const dynamic = "force-dynamic";
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (!isCreatorDashboardPath(pathname)) return <>{children}</>;
  const creator = await requireCreatorWorkspace();
  const cloneId = creator.cloneIds[0] ?? null;
  const viewAsInfo = await getViewAsBannerInfo();
  const [clones, allTimeStars] = await withDashboardAccess(creator, () => Promise.all([
        getFleetClones(),
        cloneId ? getHeaderAllTimeStars(cloneId) : Promise.resolve(0),
      ]));
  const { usdPerStar } = await withDashboardAccess(creator, () => getViewerTerms());
  return (
    <CreatorWorkspaceShell
      agencyName={creator.name}
      creatorName={creator.creatorName}
      clones={clones}
      activeCloneId={cloneId}
      connected={!!cloneId}
      onboardingFinished={creator.applicationSubmitted !== false}
      allTimeStars={allTimeStars}
      usdPerStar={usdPerStar}
    >
      {viewAsInfo && <ViewAsBanner info={viewAsInfo} />}
      {children}
    </CreatorWorkspaceShell>
  );
}
