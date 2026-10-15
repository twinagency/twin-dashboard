import CreatorStudioHome from "@/components/CreatorStudioHome";
import { getCreatorStudioStatus } from "@/lib/creator-studio";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getFleetClones } from "@/lib/query-cache";
import { isMoxy } from "@/lib/agency-brand";
import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
export const dynamic = "force-dynamic";
export default async function CreatorHomePage() {
  const creator = await requireCreatorWorkspace();
  const cloneId = creator.cloneIds[0];
  if (isMoxy(creator.name)) {
    const [status, clones] = await withDashboardAccess(creator, () => Promise.all([
      getCreatorStudioStatus(cloneId || null, creator.applicationState?.label || "Draft / unfinished"), getFleetClones(),
    ]));
    return <CreatorStudioHome brand="moxy" name={creator.creatorName} cloneId={cloneId || null} photoUrl={clones.find(clone => clone.id === cloneId)?.photoUrl} status={status} readOnly={creator.readOnly} contentHref={cloneId ? "/creator/ppvs" : "/creator/onboarding?step=content"} />;
  }
  if (!cloneId) return <section className="rounded-xl border border-line bg-panel p-6"><h1 className="font-heading text-2xl font-semibold text-ink">Earnings overview</h1><p className="mt-3 text-sm text-muted">Earnings and reports will become available when your creator profile is connected.</p><a href="/creator/onboarding" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-ink hover:bg-muted/10">Return to onboarding</a><a href="/creator/onboarding?step=content" className="mt-3 inline-flex min-h-11 items-center px-5 text-sm font-semibold text-ink underline">Review saved content</a></section>;
  return <><RevenueTooltipFix /><RevenueDashboard cloneId={cloneId} /></>;
}

