import { engineActionNeedsNote, ENGINE_OPERATOR_SCHEMA, type EngineOperatorAction, type EngineOperatorResult } from "./engine-operator";
import type { EngineEnvironment } from "./engine-status";

/** Browser side of the request action route. A reply that cannot be read is unconfirmed, never a failure. */
export async function submitEngineOperatorCommand(args: { accountId: string; conversationId: string; requestId: string; action: EngineOperatorAction;
  expectedRevision: number; note?: string; environment?: EngineEnvironment; fetchImpl?: typeof fetch }): Promise<EngineOperatorResult> {
  const { accountId, conversationId, requestId, action, expectedRevision, note, environment, fetchImpl = fetch } = args;
  try {
    const response = await fetchImpl(`/api/onlyfans-controls/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/requests/${encodeURIComponent(requestId)}`, {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, expectedRevision, ...(engineActionNeedsNote(action) ? { note } : {}), ...(environment && environment !== "simulation" ? { environment } : {}) }) });
    const data = await response.json() as Record<string, unknown>;
    // Success needs a 2xx AND a recorded body; a refusal needs a non-2xx. Anything else proves nothing.
    if (response.ok && data.schemaVersion === ENGINE_OPERATOR_SCHEMA && data.ok === true && data.outcome === "recorded") return { ok: true };
    if (!response.ok && data.schemaVersion === ENGINE_OPERATOR_SCHEMA && data.ok === false && data.outcome === "refused" && typeof data.error === "string") return { ok: false, outcome: "refused", error: data.error };
    // The dashboard's own denial (lib/onlyfans/route.ts denialBody) is raised before any upstream call, so nothing was applied.
    if (!response.ok && data.schemaVersion === undefined && data.ok === false && (data.state === "denied" || data.state === "unavailable") &&
        typeof data.code === "string" && typeof data.error === "string") return { ok: false, outcome: "refused", error: data.error };
  } catch { /* A failed connection does not prove the action failed. */ }
  return { ok: false, outcome: "unconfirmed", error: "The outcome is unconfirmed. Refresh the request before taking another action." };
}
