import RecentHistoryStatus from "./RecentHistoryStatus";
import type { Connection } from "@/lib/onlyfans-connections/contract";
import { connectionAiStatus, connectionSyncLabel, type ConnectionState } from "@/lib/onlyfans-connections/presentation";

export default function ConnectionSyncStatus({ connection, state }: { connection: Connection; state: ConnectionState }) {
  const sync = connection.sync, ai = connectionAiStatus(connection);
  const aiLine = ai ? <p role="status" className="mt-2 text-xs font-semibold text-ink" data-of-ai-live={ai.live ? "live" : "not-running"}>{ai.text}</p> : null;
  if (connection.recentHistory) return <>{aiLine}<RecentHistoryStatus value={connection.recentHistory} /></>;
  if (!sync) return <>{aiLine}<p className="mt-2 text-xs text-muted">Import progress is not available from this server yet.</p></>;
  return <div className="mt-3 space-y-1 text-xs text-muted" data-of-sync-progress>
    {aiLine}
    <p role="status" className="font-semibold text-ink">{connectionSyncLabel(sync, state)}</p>
    {!sync.lastCompleteSyncAt ? <p>A complete history sync has not been recorded. Newer activity may be missing.</p> : null}
    <p>{sync.pages} conversation pages read · {sync.conversationsComplete} histories completed · {sync.conversationsRemaining} remaining</p>
    {sync.pendingMessages > 0 ? <p>{sync.pendingMessages} messages waiting to be saved</p> : null}
    {sync.quarantinedMessages > 0 ? <p>{sync.quarantinedMessages} conflicting messages need review</p> : null}
    <p>Last complete sync: {sync.lastCompleteSyncAt ? new Date(sync.lastCompleteSyncAt).toLocaleString() : "Not completed yet"}</p>
  </div>;
}


