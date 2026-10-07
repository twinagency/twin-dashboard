import Link from "next/link";
import CloneMediaPage from "@/components/CloneMediaPage";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";

export default async function CreatorPpvsPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  if (!id) return <Card className="space-y-3 p-6 text-sm text-muted">
    <h1 className="text-lg font-semibold text-ink">Pay Per View</h1>
    <p>Your Pay Per View catalogue will become available when your AI creator profile is connected.</p>
    <p>Your onboarding uploads are already available separately. You can review saved files and add more content there.</p>
    <Link href="/creator/onboarding?step=content" className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">Open saved uploads</Link>
  </Card>;
  return <CloneMediaPage cloneId={id} creatorMode creatorReadOnly={creator.readOnly} />;
}
