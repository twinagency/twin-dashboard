import { withAdmin, ok } from "@/lib/api-route";
import { listConnections } from "@/lib/mtproto/connections";
import { listCreators } from "@/lib/mtproto/clones";
import { computeSafetySnapshots } from "@/lib/mtproto/safety";

export const dynamic = "force-dynamic";

// Connection + safety snapshot per creator (N2.7/N2.8), read-only.
export const GET = withAdmin(async () => {
  const creators = await listCreators();
  const [connections, safety] = await Promise.all([listConnections(), computeSafetySnapshots(creators)]);
  return ok({ connections, safety });
});
