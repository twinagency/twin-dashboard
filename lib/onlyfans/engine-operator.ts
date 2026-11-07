import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";

export const ENGINE_OPERATOR_SCHEMA = "of-engine-operator.v1";
export const ENGINE_OPERATOR_HEADER = "X-OnlyFans-Engine-Operator-Version";
export type EngineOperatorAction = "request_handover" | "accept_handover" | "complete" | "decline";
export const isEngineOperatorAction = (value: unknown): value is EngineOperatorAction =>
  typeof value === "string" && ["request_handover", "accept_handover", "complete", "decline"].includes(value);
export type EngineOperatorResult = { ok: true } | { ok: false; outcome: "refused" | "unconfirmed"; error: string };
type Submission = { accountId: string; conversationId: string; requestId: string; action: EngineOperatorAction;
  expectedRevision: number; commandKey: string; actor: string; note?: string };

/** A missing or malformed acknowledgement is uncertain, never a failed write. */
export function createEngineOperatorBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  return async (command: Submission): Promise<EngineOperatorResult & { status?: number }> => {
    try {
      const response = await call(options.baseUrl.replace(/\/+$/, "") +
        `/onlyfans/control/v1/accounts/${encodeURIComponent(command.accountId)}/conversations/${encodeURIComponent(command.conversationId)}/requests/${encodeURIComponent(command.requestId)}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}`,
          [ENGINE_OPERATOR_HEADER]: ENGINE_OPERATOR_SCHEMA },
        body: JSON.stringify({ action: command.action, expectedRevision: command.expectedRevision,
          commandKey: command.commandKey, actor: command.actor,
          ...(command.action === "request_handover" ? { target: command.actor } : {}),
          ...(["complete", "decline"].includes(command.action) ? { evidenceRef: `synthetic:operator:${command.note}` } : {}) }),
      });
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status,
        outcome: "refused", error: response.status === 409 ? "The request changed or is held. Refresh and review it before trying again." : "The request action was not accepted." };
      if (response.ok) {
        const ack = await response.json() as Record<string, unknown>;
        const expectedStatus = { request_handover: "handover_pending", accept_handover: "handover_accepted", complete: "completed", decline: "declined" }[command.action];
        if (ack && ack.schemaVersion === ENGINE_OPERATOR_SCHEMA && ack.ok === true && ack.accountId === command.accountId &&
            ack.conversationId === command.conversationId && ack.requestId === command.requestId && ack.action === command.action &&
            ack.commandKey === command.commandKey && ack.status === expectedStatus && ack.recordedRevision === command.expectedRevision + 1 &&
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
