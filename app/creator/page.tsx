import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
export const dynamic = "force-dynamic";
export const metadata = { title: "Creator earnings" };
export default async function CreatorHomePage() {
  const identity = await requireCreatorDashboard();
  return <>
    {!identity.cloneId && <div role="status" className="mb-5 rounded-xl border border-line bg-panel px-5 py-4 text-sm text-muted">Your onboarding is submitted. Your live earnings will appear here when your creator account is connected to its clone.</div>}
    <RevenueTooltipFix />
    {/* The actual live earnings page component, not a simplified recreation. */}
    <RevenueDashboard cloneId={identity.cloneId} />
  </>;
}
