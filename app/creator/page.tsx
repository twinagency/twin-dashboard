import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { DEMO_CLONE_ID, isZaneDemo } from "@/lib/creator-demo-policy";
export const dynamic = "force-dynamic";
export default async function CreatorHomePage() {
  const creator = await requireCreatorWorkspace();
  const cloneId = isZaneDemo(creator) ? DEMO_CLONE_ID : creator.cloneIds[0];
  if (!cloneId) return <section className="rounded-xl border border-line bg-panel p-6"><h1 className="font-heading text-2xl font-semibold text-ink">Earnings overview</h1><p className="mt-3 text-sm text-muted">Earnings and reports will become available when your creator profile is connected.</p></section>;
  return <><RevenueTooltipFix /><RevenueDashboard cloneId={cloneId} dayDetailAvailable={isZaneDemo(creator)} /></>;
}

