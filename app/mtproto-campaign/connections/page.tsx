import { listCreators } from "@/lib/mtproto/clones";
import { connectionFor, listConnections } from "@/lib/mtproto/connections";
import { autoHaltsFor, resumePhraseFor, shortId } from "@/lib/mtproto/halt";
import ConnectionsTable from "@/components/mtproto/ConnectionsTable";

export const dynamic = "force-dynamic";

// Connection panel (N2.8): session status, last seen, pause/resume, daily
// cap, per creator. Reconnect/disconnect/QR login themselves are actions the
// twin-userbot worker performs against Telegram, not this dashboard — this
// page only reads/writes the userbot_connections row twin-userbot also
// reads, matching the "dashboard writes a request, worker acts on it" split
// the whole area is built around.
export default async function MtprotoConnectionsPage() {
  const [creators, connections] = await Promise.all([listCreators(), listConnections()]);
  const halts = await autoHaltsFor(connections);
  const rows = creators.map((c) => ({
    creator: c,
    connection: connectionFor(c.id, connections),
    autoHalt: halts.get(c.id) ?? null,
    resumePhrase: resumePhraseFor(c.name || shortId(c.id)),
  }));

  return (
    <div className="dashboard-page">
      <h1 className="mb-1 text-2xl font-semibold">Connections</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        One MTProto session per creator. Pausing here stops that creator&apos;s sends without touching any other creator or the Business Bot.
      </p>
      <ConnectionsTable rows={rows} />
    </div>
  );
}
