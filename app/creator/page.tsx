import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Earnings overview · Creator dashboard" };

export default async function CreatorHomePage() {
  const creator = await requireCreatorWorkspace();
  return <><RevenueTooltipFix /><RevenueDashboard cloneId={creator.cloneIds[0] ?? null} /></>;
}
