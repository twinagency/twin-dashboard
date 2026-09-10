import BusinessAccountManager from "@/app/business/BusinessAccountManager";
import { ReadOnlyEditor } from "@/components/DashboardAccessProvider";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
export const dynamic = "force-dynamic";
export default async function CreatorBusinessPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  if (!id) return <p className="rounded-xl border border-line bg-panel p-5 text-muted">Your Telegram Business connection will appear here once your AI creator profile is connected.</p>;
  return <ReadOnlyEditor><BusinessAccountManager cloneId={id} /></ReadOnlyEditor>;
}
