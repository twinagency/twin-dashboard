import { connectionFor, listConnections } from "@/lib/mtproto/connections";
import { autoHaltsFor, resumePhraseFor, shortId } from "@/lib/mtproto/halt";
import ConnectionsTable from "@/components/mtproto/ConnectionsTable";
import { getCreators, getSafety } from "@/components/mtproto/data";

export const dynamic = "force-dynamic";

// Connection panel (N2.8): session status, last seen, pause/resume, daily
// cap, per creator. Reconnect/disconnect/QR login themselves are actions the
// twin-userbot worker performs against Telegram, not this dashboard — this
// page only reads/writes the userbot_connections row twin-userbot also
// reads, matching the "dashboard writes a request, worker acts on it" split
// the whole area is built around.
export default async function MtprotoConnectionsPage() {
  const [creators, connections, safety] = await Promise.all([getCreators(), listConnections(), getSafety()]);
  const halts = await autoHaltsFor(connections);
  const sentToday = new Map(safety.snapshots.map((s) => [s.cloneId, s.sentToday]));
  const rows = creators.map((c) => ({
    creator: c,
    connection: connectionFor(c.id, connections),
    autoHalt: halts.get(c.id) ?? null,
    resumePhrase: resumePhraseFor(c.name || shortId(c.id)),
    sentToday: safety.error ? null : (sentToday.get(c.id) ?? 0),
  }));

  return <ConnectionsTable rows={rows} />;
}
