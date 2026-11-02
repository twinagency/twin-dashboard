import { configuredBackendPurpose, createBackendTransport } from "./backend-transport";
import { CONFIGURATION_HEADER } from "./configuration";
import { MOXY_SCHEMA, moxyAck, parseMoxy, record, type MoxyChange } from "./moxy";

export function createMoxyBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const url = (accountId: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/configuration/v1/accounts/${encodeURIComponent(accountId)}/moxy`;
  const headers = { Authorization: `Bearer ${options.token}`, [CONFIGURATION_HEADER]: MOXY_SCHEMA };
  return {
    async get(accountId: string) {
      try {
        const response = await call(url(accountId), { method: "GET", headers });
        if (response.ok) { const data = parseMoxy(await response.json(), accountId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: [401,403,404].includes(response.status) ? response.status : 503, error: "Moxy controls could not be read." };
      } catch { return { ok: false as const, status: 503, error: "Moxy controls could not be read." }; }
    },
    async save(accountId: string, change: MoxyChange, actor: string) {
      try {
        const response = await call(url(accountId), { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ...change, actor }) });
        const raw: unknown = await response.json();
        if (response.ok && moxyAck(raw, accountId, change)) return { ok: true as const, ack: raw };
        if ([400,401,403,404,409,413,503].includes(response.status)) {
          return { ok: false as const, status: response.status, outcome: "refused", error:
            record(raw) && typeof raw.error === "string" && raw.error.length <= 2000 ? raw.error : "The change was not accepted. Refresh and review readiness." };
        }
      } catch { /* A lost response cannot establish whether the save committed. */ }
      return { ok: false as const, status: 502, outcome: "unconfirmed", error: "The save outcome is unconfirmed. Refresh the current mode before another change." };
    },
  };
}
export function configuredMoxyBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONFIGURATION");
  return options ? createMoxyBackend({ ...options, fetchImpl }) : null;
}
