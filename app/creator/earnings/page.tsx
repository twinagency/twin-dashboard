import { getFlirtCreatorLocale } from "@/lib/flirt-creator-locale-server";
import { flirtCreatorCopy } from "@/lib/flirt-creator-locale";
import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { creatorShare } from "@/lib/creator-share";
import { DEMO_CLONE_ID, isZaneDemo } from "@/lib/creator-demo-policy";
export const dynamic = "force-dynamic";
export default async function CreatorEarningsPage() {
  const creator = await requireCreatorWorkspace();
  const locale = await getFlirtCreatorLocale();
  const t = flirtCreatorCopy(locale);
  const cloneId = isZaneDemo(creator) ? DEMO_CLONE_ID : creator.cloneIds[0];
  if (!cloneId) return <section className="rounded-xl border border-line bg-panel p-6"><h1 className="font-heading text-2xl font-semibold text-ink">{t("Earnings overview", "Resumo de ganhos")}</h1><p className="mt-3 text-sm text-muted">{t("Earnings and reports will become available when your creator profile is connected.", "Você poderá acompanhar ganhos e relatórios assim que seu perfil de criadora for conectado.")}</p></section>;
  return <><RevenueTooltipFix /><RevenueDashboard cloneId={cloneId} dayDetailAvailable={creatorShare(creator) >= 1} /></>;
}


