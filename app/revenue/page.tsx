import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { getCloneScope } from "@/lib/clone-scope";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const cloneId = await getCloneScope();
  return (
    <>
      <RevenueTooltipFix />
      <RevenueDashboard cloneId={cloneId} />
    </>
  );
}
