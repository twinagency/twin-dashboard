import Link from "next/link";
import { getCreatorStudioStatus } from "@/lib/creator-studio";
import { isMoxy } from "@/lib/agency-brand";
import { headers } from "next/headers";
import CreatorWorkspaceShell from "@/components/CreatorWorkspaceShell";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { isCreatorDashboardPath, isCreatorPlatformPage } from "@/lib/creator-dashboard-policy";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getViewerTerms } from "@/lib/platform-cut";
import { getFleetClones, getHeaderAllTimeStars } from "@/lib/query-cache";
import { getViewAsBannerInfo } from "@/lib/view-as-banner";
import ViewAsBanner from "@/components/ViewAsBanner";
export const dynamic = "force-dynamic";
export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (!isCreatorDashboardPath(pathname)) return <>{children}</>;
  const creator = await requireCreatorWorkspace({ allowPlatformSetup: isCreatorPlatformPage(pathname) });
  const cloneId = creator.cloneIds[0] ?? null;
  const viewAsInfo = await getViewAsBannerInfo();
  const [clones, allTimeStars] = await withDashboardAccess(creator, () => Promise.all([
        getFleetClones(),
        cloneId ? getHeaderAllTimeStars(cloneId) : Promise.resolve(0),
      ]));
  const { usdPerStar } = await withDashboardAccess(creator, () => getViewerTerms());
  const studioBrand = isMoxy(creator.name) ? "moxy" : null;
  const studioStatus = studioBrand ? await withDashboardAccess(creator, () => getCreatorStudioStatus(cloneId, creator.applicationState?.label || "Draft / unfinished")) : null;
  return (
    <CreatorWorkspaceShell
      studioBrand={studioBrand}
      studioStatus={studioStatus}
      contentHref={cloneId ? "/creator/ppvs" : "/creator/onboarding?step=content"}
      agencyName={creator.name}
      creatorName={creator.creatorName}
      clones={clones}
      activeCloneId={cloneId}
      connected={!!cloneId}
      onboardingFinished={creator.applicationSubmitted !== false}
      connectionPage={pathname === "/creator/platforms"}
      homePage={pathname === "/creator"}
      allTimeStars={allTimeStars}
      usdPerStar={usdPerStar}
    >
      {viewAsInfo && <ViewAsBanner info={viewAsInfo} />}
      {!studioBrand && pathname !== "/creator/platforms" && pathname !== "/creator" && <div className="mb-4 flex justify-end"><Link href="/creator/platforms" className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink" data-creator-platform-access>My platforms</Link></div>}
      {children}
    </CreatorWorkspaceShell>
  );
}
