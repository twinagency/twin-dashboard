import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { CONTROL_HEADER, CONTROL_SCHEMA } from "./controls";
import { parseBulkAck, type BulkRequest } from "./bulk-controls";

export function createBulkControlBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  return async (command: BulkRequest & { accountId: string; actor: string; commandKey: string }) => {
    try {
      const response = await call(options.baseUrl.replace(/\/+$/, "") +
        `/onlyfans/control/v1/accounts/${encodeURIComponent(command.accountId)}/bulk-conversations`, {
        method: "POST", timeoutMs: 25_000, headers: { "Content-Type": "application/json",
          Authorization: `Bearer ${options.token}`, [CONTROL_HEADER]: CONTROL_SCHEMA },
        body: JSON.stringify({ action: command.action, items: command.items, actor: command.actor, commandKey: command.commandKey }),
      });
      if (response.ok) {
        const ack = parseBulkAck(await response.json(), command);
        if (ack) return { ok: true as const, ack };
      }
    } catch { /* Some per-fan transactions may have committed before a lost response. */ }
    return { ok: false as const, status: 502, outcome: "unconfirmed" as const,
      error: "This batch was not fully confirmed. Some changes may be saved. Refresh before continuing." };
  };
}
export function configuredBulkControlBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTROL");
  return options ? createBulkControlBackend({ ...options, fetchImpl }) : null;
}
