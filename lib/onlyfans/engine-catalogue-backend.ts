import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { ENGINE_CATALOGUE_HEADER, ENGINE_CATALOGUE_SCHEMA, parseCatalogueDecisionAck, type CatalogueDecision, type CatalogueDecisionResult } from "./engine-catalogue";

/**
 * Approve or retire a catalogue item for the engine. The path is the dashboard's request to the
 * backend; it is not served yet (NEEDS-BACKEND.md). An unserved path is refused, never treated as saved.
 */
export function createEngineCatalogueBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  return async (accountId: string, itemId: string, command: CatalogueDecision & { commandKey: string; actor: string }): Promise<CatalogueDecisionResult> => {
    try {
      const response = await call(options.baseUrl.replace(/\/+$/, "") +
        `/onlyfans/content/v1/accounts/${encodeURIComponent(accountId)}/engine-catalogue/${encodeURIComponent(itemId)}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}`, [ENGINE_CATALOGUE_HEADER]: ENGINE_CATALOGUE_SCHEMA },
        body: JSON.stringify(command) });
      if ([400, 401, 403, 404, 405, 409, 413, 503].includes(response.status)) { await response.body?.cancel();
        return { ok: false, status: response.status, outcome: "refused",
          error: response.status === 409 ? "This item changed. Review the refreshed values before deciding again." : "The catalogue decision was not accepted." }; }
      if (response.ok && parseCatalogueDecisionAck(await response.json(), { ...command, accountId, itemId })) return { ok: true };
    } catch { /* No reply cannot prove the decision was not saved. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The decision is unconfirmed. Refresh the list before deciding again." };
  };
}
export function configuredEngineCatalogueBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTENT");
  return options ? createEngineCatalogueBackend({ ...options, fetchImpl }) : null;
}
