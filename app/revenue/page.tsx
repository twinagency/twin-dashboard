import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { getCloneScope } from "@/lib/clone-scope";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { getCreatorOverview, getOverviewAudience } from "@/lib/creator-overview";
import { getFleetClones } from "@/lib/query-cache";
import FlirtSharedOverview from "@/components/overview/FlirtSharedOverview";
import CreatorOverview from "@/components/overview/CreatorOverview";
import { getAgencyOverview } from "@/lib/agency-overview";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const cloneId = await getCloneScope();
  const access = await getDashboardAccess();
  if (access?.name.trim().toLowerCase() === "flirt" && !access.id.startsWith('creator:')) {
    const agency = await getAgencyOverview();
    return <FlirtSharedOverview key={cloneId ?? "all"} cloneId={cloneId} initialAgency={agency} />;
  }
  if (cloneId && access?.name.trim().toLowerCase() === "flirt") {
    const presentation = await getCreatorOverview(cloneId);
    if (presentation) {
      const [audience, creators] = await Promise.all([getOverviewAudience(cloneId), getFleetClones()]);
      return <CreatorOverview key={cloneId} initialPresentation={presentation} initialAudience={audience} creators={creators.map(({id,name})=>({id,name}))} />;
    }
  }
  const creators = !access ? await getFleetClones() : [];
  return (
    <>
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} sharedOverview={!access ? { creators, creatorsHref: "/clones", chatHref: "/users", brand: "flirt" } : undefined} />
    </>
  );
}
