import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
/** Server-owned write credential, separate from the read-only backend port. */
import { CONTROL_HEADER, CONTROL_SCHEMA, parseControlAck, type ControlAction, type ControlReply } from "./controls";

export type ControlSubmission = {
  accountId: string; conversationId: string; action: ControlAction;
  expectedRevision: number; commandKey: string; actor: string;
  body?: string;
  catalogItemId?: number | null;
};

export function createControlBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  return async (command: ControlSubmission): Promise<ControlReply> => {
    try {
      const result = await call(options.baseUrl.replace(/\/+$/, "") +
        `/onlyfans/control/v1/accounts/${encodeURIComponent(command.accountId)}/conversations/${encodeURIComponent(command.conversationId)}`, {
        method: "POST", headers: { "Content-Type": "application/json",
          Authorization: `Bearer ${options.token}`, [CONTROL_HEADER]: CONTROL_SCHEMA },
        body: JSON.stringify({ action: command.action, expectedRevision: command.expectedRevision,
          commandKey: command.commandKey, actor: command.actor,
          ...(command.action === "manual_message" ? { body: command.body,
            ...(command.catalogItemId !== undefined ? { catalogItemId: command.catalogItemId } : {}) } : {}) }),
      });
      if ([400, 401, 403, 404, 409, 413, 503].includes(result.status)) {
        return { ok: false, status: result.status, outcome: "refused", error: result.status === 409
          ? "The conversation changed or has an active hold. Refresh before trying again."
          : "The conversation control was not accepted." };
      }
      if (result.ok) {
        const ack = parseControlAck(await result.json(), command);
        if (ack) return { ok: true, ack };
      }
    } catch { /* A lost reply does not prove the transaction failed. */ }
    return { ok: false, status: 502, outcome: "unconfirmed",
      error: "The outcome is not confirmed. Refresh the conversation or retry the same request." };
  };
}

export function configuredControlBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTROL");
  return options ? createControlBackend({ ...options, fetchImpl }) : null;
}
