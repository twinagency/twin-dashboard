import { createBackendTransport, configuredBackendPurpose } from "@/lib/onlyfans/backend-transport";
import { CONNECTION_HEADER, CONNECTION_SCHEMA, parseConnection, parseConnectionAck, parseRegistrationAck,
  type ConnectionRequest, type ConnectionRegistration, type ConnectionFailure } from "./contract";
type Identity = { actor: string; commandKey: string };
export function createConnectionBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const base = options.baseUrl.replace(/\/+$/, "") + "/onlyfans/connection/v1/accounts";
  const headers = { Authorization: `Bearer ${options.token}`, [CONNECTION_HEADER]: CONNECTION_SCHEMA };
  async function post(path: string, body: unknown) {
    try {
      const response = await call(path, { method: "POST", timeoutMs: 15_000, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status, outcome: "refused",
        error: response.status === 409 ? "The connection command was refused. Review the refreshed account and entered values." : "The account connection change was refused." } as ConnectionFailure;
      if (response.ok) return { ok: true as const, body: await response.json() as unknown };
    } catch { /* Write outcome remains unknown; no automatic retry. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The connection outcome is not confirmed. Refresh or retry the same request." } as ConnectionFailure;
  }
  return {
    async get(accountId: string) {
      try {
        const response = await call(base + "/" + encodeURIComponent(accountId), { method: "GET", headers });
        if (response.ok) { const data = parseConnection(await response.json(), accountId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "The recorded account connection could not be read." };
      } catch { return { ok: false as const, status: 503, error: "The recorded account connection could not be read." }; }
    },
    async command(accountId: string, command: ConnectionRequest & Identity) {
      const result = await post(base + "/" + encodeURIComponent(accountId), command);
      if (!result.ok) return result;
      const ack = parseConnectionAck(result.body, { ...command, accountId });
      return ack ? { ok: true as const, ack } : { ok: false, status: 502, outcome: "unconfirmed", error: "The connection outcome is not confirmed. Refresh or retry the same request." } as ConnectionFailure;
    },
    async provision(command: ConnectionRegistration & Identity & { creatorName: string }) {
      const result = await post(base, command); if (!result.ok) return result;
      const ack = parseRegistrationAck(result.body, command);
      return ack ? { ok: true as const, ack } : { ok: false, status: 502, outcome: "unconfirmed", error: "The account registration outcome is not confirmed. Retry the same request." } as ConnectionFailure;
    },
  };
}
export function configuredConnectionBackend() {
  const options = configuredBackendPurpose("CONNECTION");
  return options ? createConnectionBackend(options) : null;
}
