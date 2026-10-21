import type { Connection } from "@/lib/onlyfans-connections/contract";
import { connectionSyncLabel, type ConnectionState } from "@/lib/onlyfans-connections/presentation";

export default function ConnectionSyncStatus({ connection, state }: { connection: Connection; state: ConnectionState }) {
  const sync = connection.sync;
  if (!sync) return <p className="mt-2 text-xs text-muted">Import progress is not available from this server yet.</p>;
  return <div className="mt-3 space-y-1 text-xs text-muted" data-of-sync-progress>
    <p role="status" className="font-semibold text-ink">{connectionSyncLabel(sync, state)}</p>
    <p>{sync.pages} conversation pages read · {sync.conversationsComplete} histories completed · {sync.conversationsRemaining} remaining</p>
    {sync.pendingMessages > 0 ? <p>{sync.pendingMessages} messages waiting to be saved</p> : null}
    {sync.quarantinedMessages > 0 ? <p>{sync.quarantinedMessages} conflicting messages need review</p> : null}
    <p>Last complete sync: {sync.lastCompleteSyncAt ? new Date(sync.lastCompleteSyncAt).toLocaleString() : "Not completed yet"}</p>
  </div>;
}
