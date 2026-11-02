import { isMoxy } from "@/lib/agency-brand";
import RevenueDashboard from "@/components/RevenueDashboard";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
export const dynamic = "force-dynamic";
export default async function CreatorEarningsPage() {
  const creator = await requireCreatorWorkspace();
  const cloneId = creator.cloneIds[0];
  if (!cloneId) return <section className="rounded-xl border border-line bg-panel p-6"><h1 className="font-heading text-2xl font-semibold text-ink">Earnings overview</h1><p className="mt-3 text-sm text-muted">Earnings and reports will become available when your creator profile is connected.</p><a href={isMoxy(creator.name) ? "/creator" : "/creator/onboarding"} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-ink hover:bg-muted/10">{isMoxy(creator.name) ? "Back to overview" : "Return to onboarding"}</a><a href="/creator/onboarding?step=content" className="mt-3 inline-flex min-h-11 items-center px-5 text-sm font-semibold text-ink underline">Review saved content</a></section>;
  return <><RevenueTooltipFix /><RevenueDashboard cloneId={cloneId} /></>;
}
