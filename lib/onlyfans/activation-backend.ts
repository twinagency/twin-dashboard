/** Server-only transport for administrator activation commands. Reads use the read credential, writes the control credential. */
import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { CONTROL_HEADER, CONTROL_SCHEMA } from "./controls";

export const ACTIVATION_OPERATIONS = ["activate", "enable-existing", "future-conversations", "operating-limits", "model-credential", "model-check"] as const;
export type ActivationOperation = typeof ACTIVATION_OPERATIONS[number];
export type ActivationCommandResult =
  | { ok: true; command: Record<string, unknown> }
  | { ok: false; status: number; outcome: "refused" | "unconfirmed" | "unavailable"; code: string; error: string; blockers?: string[] };

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function createActivationCommandBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const send = createBackendTransport(options.fetchImpl);
  return async (accountId: string, operation: ActivationOperation, body: Record<string, unknown>): Promise<ActivationCommandResult> => {
    try {
      const response = await send(`${options.baseUrl.replace(/\/+$/, "")}/onlyfans/control/v1/accounts/${encodeURIComponent(accountId)}/activation/${operation}`, {
        method: "POST", timeoutMs: operation === "enable-existing" ? 60_000 : operation === "model-check" ? 15_000 : 15_000,
        headers: { Authorization: `Bearer ${options.token}`, [CONTROL_HEADER]: CONTROL_SCHEMA, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok && object(json) && json.schemaVersion === CONTROL_SCHEMA && json.ok === true && json.accountId === accountId && object(json.command)) {
        if (operation !== "model-check" && json.command.commandKey !== body.commandKey) throw Error("mismatched acknowledgement");
        return { ok: true, command: json.command };
      }
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) {
        const code = object(json) && typeof json.code === "string" && /^[a-z_]{1,60}$/.test(json.code) ? json.code : "refused";
        const blockers = object(json) && Array.isArray(json.blockers) ? json.blockers.filter((b): b is string => typeof b === "string" && /^[a-z_]{1,60}$/.test(b)).slice(0, 12) : undefined;
        const error = object(json) && typeof json.error === "string" && json.error.length <= 300 ? json.error : "The account action was not accepted.";
        return { ok: false, status: response.status, outcome: response.status === 503 ? "unavailable" : "refused", code, error, ...(blockers ? { blockers } : {}) };
      }
    } catch { /* A missing acknowledgement never proves a write failed. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", code: "outcome_unconfirmed",
      error: "The outcome is not confirmed. Refresh the account status before repeating the action." };
  };
}
export function configuredActivationCommandBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTROL");
  return options ? createActivationCommandBackend({ ...options, fetchImpl }) : null;
}
