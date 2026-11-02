import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { getCloneScope } from "@/lib/clone-scope";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { usesAgencyOverview, isMoxy } from "@/lib/agency-brand";
import { getAgencyOverview } from "@/lib/agency-overview";
import AgencyOverview from "@/components/agency-overview/AgencyOverview";
import { redirect } from "next/navigation";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import CombinedEarnings from "@/components/CombinedEarnings";

export const dynamic = "force-dynamic";

export default async function RevenuePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const cloneId = await getCloneScope();
  const access = await getDashboardAccess();
  // Overview is the compact summary. Earnings opens the full ledger in the
  // same operator shell instead of redirecting into another channel's menu.
  if (!access) {
    if (!await hasInternalAdminAccess()) redirect("/twin");
    return <div className="min-w-0 space-y-6" data-detailed-earnings>
      <header><h1>Earnings</h1><p className="mt-2 text-sm text-muted">Channel breakdowns, transactions and detailed reporting.</p></header>
      <CombinedEarnings embedded />
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} />
    </div>;
  }
  if (access && usesAgencyOverview(access.name)) {
    const combinedRevenue = isMoxy(access.name) && (await searchParams)?.workspace !== "telegram";
    const overviewCloneId = combinedRevenue ? null : cloneId;
    return <AgencyOverview key={overviewCloneId ?? 'agency'} cloneId={overviewCloneId} combinedRevenue={combinedRevenue} initialCreators={await getAgencyOverview()} />;
  }
  return (
    <>
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} />
    </>
  );
}
