import CreatorStudioHelp from "@/components/CreatorStudioHelp";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
export const dynamic = "force-dynamic";
export default async function CreatorHelpPage() {
  const creator = await requireCreatorWorkspace();
  return <CreatorStudioHelp brandName={creator.name} />;
}

