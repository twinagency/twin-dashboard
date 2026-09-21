import { withAdmin, ok } from "@/lib/api-route";
import { listConnections } from "@/lib/mtproto/connections";
import { listCreators } from "@/lib/mtproto/clones";
import { autoHaltsFor } from "@/lib/mtproto/halt";
import { computeSafetySnapshots } from "@/lib/mtproto/safety";

export const dynamic = "force-dynamic";

// Connection + safety snapshot per creator (N2.7/N2.8), read-only.
export const GET = withAdmin(async () => {
  const creators = await listCreators();
  const [connections, safety] = await Promise.all([listConnections(), computeSafetySnapshots(creators)]);
  // autoHalt: per paused_reason 'auto_halt_spike:*' connection, the readable halt reason and tripped rate/threshold.
  const halts = await autoHaltsFor(connections);
  return ok({ connections: connections.map((c) => ({ ...c, autoHalt: halts.get(c.cloneId) ?? null })), safety });
});
