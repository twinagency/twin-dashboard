import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import { flirtCreatorCopy } from "@/lib/flirt-creator-locale";
import CreatorStudioHome from "@/components/CreatorStudioHome";
import { getCreatorStudioStatus } from "@/lib/creator-studio";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { getFleetClones } from "@/lib/query-cache";
import { flirtOnboardingOptional } from "@/lib/flirt-onboarding";
import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { creatorShare } from "@/lib/creator-share";
import { DEMO_CLONE_ID, isZaneDemo } from "@/lib/creator-demo-policy";
export const dynamic = "force-dynamic";
export default async function CreatorHomePage() {
  const creator = await requireCreatorWorkspace();
  const locale = await getFlirtCreatorLocale();
  const t = flirtCreatorCopy(locale);
  const cloneId = isZaneDemo(creator) ? DEMO_CLONE_ID : creator.cloneIds[0];
  if (flirtOnboardingOptional() && !isZaneDemo(creator)) {
    const [status, clones] = await withDashboardAccess(creator, () => Promise.all([
      getCreatorStudioStatus(cloneId || null, creator.applicationState?.label || "Draft / unfinished"), getFleetClones(),
    ]));
    return <CreatorStudioHome brand="flirt" name={creator.creatorName} cloneId={cloneId || null} photoUrl={clones.find(clone => clone.id === cloneId)?.photoUrl} status={status} readOnly={creator.readOnly} contentHref={"/creator/onboarding?step=content"} />;
  }
  if (!cloneId) return <section className="rounded-xl border border-line bg-panel p-6"><h1 className="font-heading text-2xl font-semibold text-ink">{t("Earnings overview", "Resumo de ganhos")}</h1><p className="mt-3 text-sm text-muted">{t("Earnings and reports will become available when your creator profile is connected.", "Você poderá acompanhar ganhos e relatórios assim que seu perfil de criadora for conectado.")}</p></section>;
  return <><RevenueTooltipFix /><RevenueDashboard cloneId={cloneId} dayDetailAvailable={creatorShare(creator) >= 1} /></>;
}


