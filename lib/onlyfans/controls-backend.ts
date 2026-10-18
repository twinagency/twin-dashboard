/** Server-owned write credential, separate from the read-only backend port. */
import { CONTROL_HEADER, CONTROL_SCHEMA, parseControlAck, type ControlAction, type ControlReply } from "./controls";

export type ControlSubmission = {
  accountId: string; conversationId: string; action: ControlAction;
  expectedRevision: number; commandKey: string; actor: string;
};

export function createControlBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = options.fetchImpl ?? fetch;
  return async (command: ControlSubmission): Promise<ControlReply> => {
    try {
      const result = await call(options.baseUrl.replace(/\/+$/, "") +
        `/onlyfans/control/v1/accounts/${encodeURIComponent(command.accountId)}/conversations/${encodeURIComponent(command.conversationId)}`, {
        method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(8_000), headers: { "Content-Type": "application/json",
          Authorization: `Bearer ${options.token}`, [CONTROL_HEADER]: CONTROL_SCHEMA },
        body: JSON.stringify({ action: command.action, expectedRevision: command.expectedRevision,
          commandKey: command.commandKey, actor: command.actor }),
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

export function configuredControlBackend() {
  const baseUrl = (process.env.ONLYFANS_API_BASE_URL ?? "").trim();
  const token = (process.env.ONLYFANS_CONTROL_TOKEN ?? "").trim();
  const readToken = (process.env.ONLYFANS_API_TOKEN ?? "").trim();
  if (!baseUrl || !token || token === readToken) return null;
  try {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
  } catch { return null; }
  return createControlBackend({ baseUrl, token });
}
