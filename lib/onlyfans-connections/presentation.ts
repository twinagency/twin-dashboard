import type { Connection, ConnectionSync } from "./contract";

export type ConnectionState = "connected" | "paused" | "checking" | "retrying" | "reconnect" | "attention" | "unavailable";
export function connectionState(connection: Connection | null, now = Date.now()): ConnectionState {
  if (!connection) return "unavailable";
  if (connection.status === "paused") return "paused";
  if (connection.lastError === "provider_authentication_required") return "reconnect";
  if (connection.lastError === "stored_credentials_unavailable" || connection.status === "failed") return "attention";
  const expires = connection.expiresAt ? Date.parse(connection.expiresAt) : NaN;
  const valid = Number.isFinite(expires) && expires > now;
  const renewable = ["verified", "expired"].includes(connection.status) && !!connection.verifiedAt
    && [null, "provider_connection_check_retry"].includes(connection.lastError);
  if (connection.lastError === "provider_connection_check_retry" && (renewable || connection.status === "pending" && valid)) return "retrying";
  if (renewable && !valid) return "checking";
  if (!valid) return "reconnect";
  if (connection.status === "verified" && !connection.lastError) return "connected";
  return connection.status === "pending" ? "checking" : "attention";
}
export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connected: "Connected", paused: "Paused", checking: "Checking saved login", retrying: "Temporarily unavailable",
  reconnect: "Sign-in required", attention: "Connection needs attention", unavailable: "Status unavailable",
};
export const CONNECTION_DETAILS: Record<ConnectionState, string> = {
  connected: "Your account is linked. Message history syncs automatically.",
  paused: "Your account is linked. Importing and outgoing messages are paused.",
  checking: "Twin is checking the saved login. Verification must succeed before syncing continues.",
  retrying: "Twin could not complete the provider check and is retrying automatically with the saved login. This response does not confirm a logout.",
  reconnect: "The saved login needs replacing. Sign in again to resume syncing.",
  attention: "The connection could not be verified. Review its status before connecting again.",
  unavailable: "Refresh status to check this account. A status read failure does not confirm a logout.",
};
export function connectionSyncLabel(sync: ConnectionSync | undefined, state: ConnectionState): string {
  if (!sync) return "Import progress unavailable";
  if (state === "paused") return "Import paused";
  if (sync.quarantinedMessages) return "Import needs review";
  if (["checking", "retrying", "reconnect", "attention", "unavailable"].includes(state)) return "Waiting for connection";
  if (sync.lastCompleteSyncAt && !sync.recoveryRequired && sync.discoveryStatus === "complete"
    && !sync.conversationsRemaining && !sync.pendingMessages) return "Last import complete";
  return sync.discoveryStatus === "not_started" ? "Waiting for import" : "Importing history";
}
/** "AI live" only when the backend proves it. Older backends (no runner field) show nothing. */
export function connectionAiStatus(connection: Connection | null | undefined): { live: boolean; text: string } | null {
  const runner = connection?.runner;
  if (!connection || !runner || typeof connection.aiLive !== "boolean") return null;
  if (connection.aiLive && runner.state === "running" && !runner.stale) return { live: true, text: "AI live" };
  if (!runner.stale && runner.state === "held" && runner.reason === "runtime-disabled") return { live: false, text: "AI replies are switched off for this account." };
  if (!runner.stale && runner.state === "held" && runner.reason === "policy-disabled") return { live: false, text: "AI replies are paused because outgoing messages are disabled." };
  const why = runner.stale ? "status out of date" : runner.state === "unknown" ? "status unknown" : runner.state === "running" ? "sending is off"
    : runner.state === "not_supervised" ? "not started" : runner.state === "held" && runner.reason ? "held: " + runner.reason.replace(/[_:]/g, " ") : runner.state;
  return { live: false, text: "AI not running (" + why + ")" };
}

