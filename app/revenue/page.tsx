import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { getCloneScope } from "@/lib/clone-scope";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { usesAgencyOverview } from "@/lib/agency-brand";
import { getAgencyOverview } from "@/lib/agency-overview";
import AgencyOverview from "@/components/agency-overview/AgencyOverview";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RevenuePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const cloneId = await getCloneScope();
  const access = await getDashboardAccess();
  // Internal earnings now lives in the Dashboard overview. Partner and creator
  // reporting keeps its existing access rules, revenue shares and presentation.
  if (!access) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams ?? {})) {
      if (typeof value === "string") query.set(key, value);
    }
    query.set("workspace", "telegram");
    redirect(`/dashboard?${query}`);
  }
  if (access && usesAgencyOverview(access.name)) return <AgencyOverview key={cloneId ?? 'agency'} cloneId={cloneId} initialCreators={await getAgencyOverview()} />;
  return (
    <>
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} />
    </>
  );
}
