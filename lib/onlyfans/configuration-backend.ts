import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
/** Server-owned, separately scoped configuration purpose credential. */
import { CONFIGURATION_HEADER, CONFIGURATION_SCHEMA, parseConfiguration, parseConfigurationAck,
  type ConfigurationRequest, type ConfigurationFailure } from "./configuration";

export function createConfigurationBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const url = (accountId: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/configuration/v1/accounts/${encodeURIComponent(accountId)}`;
  const headers = { Authorization: `Bearer ${options.token}`, [CONFIGURATION_HEADER]: CONFIGURATION_SCHEMA };
  return {
    async get(accountId: string, includeActivation = false) {
      try {
        const response = await call(url(accountId) + (includeActivation ? "?activation=1" : ""), { method: "GET", headers });
        if (response.ok) { const data = parseConfiguration(await response.json(), accountId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "Creator configuration could not be read." };
      } catch { return { ok: false as const, status: 503, error: "Creator configuration could not be read." }; }
    },
    async save(accountId: string, command: ConfigurationRequest & { commandKey: string; actor: string }) {
      try {
        const response = await call(url(accountId), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(command) });
        if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status, outcome: "refused",
          error: response.status === 409 ? "Configuration changed. Review the refreshed values before saving again." : "The configuration change was not accepted. Review the values and try again." } as ConfigurationFailure;
        if (response.ok) {
          const ack = parseConfigurationAck(await response.json(), { ...command, accountId });
          if (ack) return { ok: true as const, ack };
        }
      } catch { /* No response cannot prove that the transaction failed. */ }
      return { ok: false, status: 502, outcome: "unconfirmed", error: "The save outcome is not confirmed. Retry the same request or review the refreshed settings." } as ConfigurationFailure;
    },
  };
}
export function configuredConfigurationBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONFIGURATION");
  return options ? createConfigurationBackend({ ...options, fetchImpl }) : null;
}
