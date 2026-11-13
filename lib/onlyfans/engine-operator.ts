import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { isEngineEnvironment, type EngineEnvironment } from "./engine-status";
import { ENGINE_OPERATOR_HEADER, ENGINE_OPERATOR_SCHEMA, engineActionNeedsNote, type EngineOperatorAction, type EngineOperatorResult } from "./engine-operator-core";

export * from "./engine-operator-core";

/** The audit string stored with a resolution. Synthetic only in the simulation; a real operator string everywhere else. */
export function engineOperatorEvidenceRef(environment: EngineEnvironment, note: string): string {
  return environment === "simulation" ? `synthetic:operator:${note}` : `operator:${environment}:${note}`;
}
export { isEngineEnvironment };
type Submission = { accountId: string; conversationId: string; requestId: string; action: EngineOperatorAction;
  expectedRevision: number; commandKey: string; actor: string; note?: string; environment: EngineEnvironment };

/** A missing or malformed acknowledgement is uncertain, never a failed write. */
export function createEngineOperatorBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  return async (command: Submission): Promise<EngineOperatorResult & { status?: number }> => {
    // Never defaulted: a command that names no environment would otherwise store simulation evidence against real work.
    if (!isEngineEnvironment(command.environment)) return { ok: false, status: 400, outcome: "refused", error: "The request action was not accepted." };
    try {
      const response = await call(options.baseUrl.replace(/\/+$/, "") +
        `/onlyfans/control/v1/accounts/${encodeURIComponent(command.accountId)}/conversations/${encodeURIComponent(command.conversationId)}/requests/${encodeURIComponent(command.requestId)}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}`,
          [ENGINE_OPERATOR_HEADER]: ENGINE_OPERATOR_SCHEMA },
        body: JSON.stringify({ action: command.action, expectedRevision: command.expectedRevision,
          commandKey: command.commandKey, actor: command.actor,
          ...(command.action === "request_handover" ? { target: command.actor } : {}),
          ...(engineActionNeedsNote(command.action) ? { evidenceRef: engineOperatorEvidenceRef(command.environment, command.note ?? "") } : {}) }),
      });
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status,
        outcome: "refused", error: response.status === 409 ? "The request changed or is held. Refresh and review it before trying again." : "The request action was not accepted." };
      if (response.ok) {
        const ack = await response.json() as Record<string, unknown>;
        const expectedStatus = { request_handover: "handover_pending", accept_handover: "handover_accepted", complete: "completed", decline: "declined", mark_reconciled: null }[command.action];
        if (ack && ack.schemaVersion === ENGINE_OPERATOR_SCHEMA && ack.ok === true && ack.accountId === command.accountId &&
            ack.conversationId === command.conversationId && ack.requestId === command.requestId && ack.action === command.action &&
            ack.commandKey === command.commandKey && (expectedStatus === null ? typeof ack.status === "string" : ack.status === expectedStatus) && ack.recordedRevision === command.expectedRevision + 1 &&
            typeof ack.owner === "string" && typeof ack.nextStep === "string" && typeof ack.replayed === "boolean") return { ok: true };
      }
    } catch { /* The backend may have committed before the connection failed. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The outcome is unconfirmed. Refresh the request before taking another action." };
  };
}
export function configuredEngineOperatorBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTROL");
  return options ? createEngineOperatorBackend({ ...options, fetchImpl }) : null;
}
