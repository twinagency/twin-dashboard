import { headers } from "next/headers";
import CreatorWorkspaceShell from "@/components/CreatorWorkspaceShell";
import CreatorDemoBanner from "@/components/CreatorDemoBanner";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { isCreatorDashboardPath } from "@/lib/creator-dashboard-policy";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getFleetClones, getHeaderAllTimeStars } from "@/lib/query-cache";
import { isZaneDemo } from "@/lib/creator-demo-policy";
import { creatorDemoData } from "@/lib/creator-demo-data";
import { getViewAsBannerInfo } from "@/lib/view-as-banner";
import ViewAsBanner from "@/components/ViewAsBanner";
export const dynamic = "force-dynamic";
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (!isCreatorDashboardPath(pathname)) return <>{children}</>;
  const creator = await requireCreatorWorkspace();
  const cloneId = creator.cloneIds[0] ?? null;
  const demo = isZaneDemo(creator);
  const viewAsInfo = await getViewAsBannerInfo();
  const [clones, allTimeStars] = demo
    ? [[], creatorDemoData("1D").balance.lifetimeStars]
    : await withDashboardAccess(creator, () => Promise.all([
        getFleetClones(),
        cloneId ? getHeaderAllTimeStars(cloneId) : Promise.resolve(0),
      ]));
  return (
    <CreatorWorkspaceShell
      agencyName={creator.name}
      creatorName={creator.creatorName}
      clones={clones}
      activeCloneId={cloneId}
      connected={!!cloneId || demo}
      allTimeStars={allTimeStars}
    >
      {demo && <CreatorDemoBanner />}
      {viewAsInfo && <ViewAsBanner info={viewAsInfo} />}
      {children}
    </CreatorWorkspaceShell>
  );
}
