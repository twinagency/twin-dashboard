import RevenueDashboard from "@/components/RevenueDashboard";
import { getCloneScope } from "@/lib/clone-scope";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const cloneId = await getCloneScope();
  return <RevenueDashboard cloneId={cloneId} />;
}
