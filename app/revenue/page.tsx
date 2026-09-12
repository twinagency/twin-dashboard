import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { CAT_PRESENTATION_QUERY_KEY, isCatDemoRequest } from "@/lib/cat-demo-policy";
import { getCloneScope } from "@/lib/clone-scope";
import { getDashboardAccess } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const [cloneId, access, query] = await Promise.all([getCloneScope(), getDashboardAccess(), searchParams]);
  const params = new URLSearchParams();
  for (const value of Array.isArray(query.view) ? query.view : query.view ? [query.view] : []) params.append(CAT_PRESENTATION_QUERY_KEY, value);
  const demoMode = isCatDemoRequest(params, access, cloneId) ? "cat" as const : null;
  return (
    <>
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} demoMode={demoMode} />
    </>
  );
}
