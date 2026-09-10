import BusinessAccountManager from "@/app/business/BusinessAccountManager";
import { ReadOnlyEditor } from "@/components/DashboardAccessProvider";
import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
export const dynamic = "force-dynamic";
export default async function CreatorBusinessPage() {
  const identity = await requireCreatorDashboard();
  if (!identity.cloneId) return <div className="rounded-xl border border-line bg-panel p-6"><h1 className="text-2xl font-semibold">Business</h1><p className="mt-3 text-sm text-muted">Your Telegram Business connection will appear when your clone is connected.</p></div>;
  return <><p className="mb-4 text-sm text-muted">Your connected Telegram Business profile. Operational changes are managed by your agency.</p><ReadOnlyEditor><BusinessAccountManager cloneId={identity.cloneId} /></ReadOnlyEditor></>;
}
