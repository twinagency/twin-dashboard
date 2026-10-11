import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { getCloneScope } from "@/lib/clone-scope";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isMoxy } from "@/lib/agency-brand";
import { getAgencyOverview } from "@/lib/agency-overview";
import AgencyOverview from "@/components/agency-overview/AgencyOverview";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const cloneId = await getCloneScope();
  const access = await getDashboardAccess();
  if (access && isMoxy(access.name)) return <AgencyOverview key={cloneId ?? 'agency'} cloneId={cloneId} initialCreators={await getAgencyOverview()} />;
  return (
    <>
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} />
    </>
  );
}
