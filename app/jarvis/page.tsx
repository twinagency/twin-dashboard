import JarvisWorkspace from "@/components/JarvisWorkspace";
import { getCloneScope } from "@/lib/clone-scope";

export const dynamic = "force-dynamic";

export default async function JarvisPage() {
  const cloneId = await getCloneScope();
  return <JarvisWorkspace cloneId={cloneId} />;
}
