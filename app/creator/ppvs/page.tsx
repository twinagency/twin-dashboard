import CloneMediaPage from "@/components/CloneMediaPage";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";

export default async function CreatorPpvsPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  if (!id) return <Card className="p-10 text-center text-sm text-muted">Your Pay Per View library will appear here when your AI creator profile is connected.</Card>;
  return <CloneMediaPage cloneId={id} creatorMode />;
}
