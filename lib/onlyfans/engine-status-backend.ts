import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { ENGINE_PAGE_DEFAULT, ENGINE_PAGE_MAX, isCursor, parseEngineStatus, type EngineStatusView } from "./engine-status";
import { parseEngineCatalogue, type EngineCataloguePage } from "./engine-catalogue";
import { parseEngineUnresolved, type EngineUnresolvedPage } from "./engine-unresolved";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../onlyfans-preview/types";

/** Page parameters after validation. Anything else is refused before it reaches the backend. */
export type EnginePageQuery = { cursor: string | null; limit: number };
export function parseEnginePageQuery(params: URLSearchParams): EnginePageQuery | null {
  const cursor = params.get("cursor"), rawLimit = params.get("limit");
  if (cursor !== null && !isCursor(cursor)) return null;
  const limit = rawLimit === null ? ENGINE_PAGE_DEFAULT : /^[0-9]{1,3}$/.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > ENGINE_PAGE_MAX) return null;
  return { cursor, limit };
}
export const enginePageSearch = (page: EnginePageQuery) => `?limit=${page.limit}${page.cursor ? `&cursor=${encodeURIComponent(page.cursor)}` : ""}`;

export type EngineReadResult<T> = { ok: true; data: T } | { ok: false; status: 404 | 502 | 503; error: string };

/**
 * Read-only engine projections. The paths below are the dashboard's request to the backend;
 * see NEEDS-BACKEND.md for which of them the backend serves today.
 */
export function createEngineStatusBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const base = options.baseUrl.replace(/\/+$/, "") + "/onlyfans/api/v1/accounts/";
  const headers = { Authorization: `Bearer ${options.token}`, "X-OnlyFans-Schema-Version": ONLYFANS_PREVIEW_SCHEMA_VERSION };
  async function read<T>(url: string, parse: (value: unknown) => T | null, what: string): Promise<EngineReadResult<T>> {
    try {
      const response = await call(url, { method: "GET", headers });
      if (response.status === 404) { await response.body?.cancel(); return { ok: false, status: 404, error: `${what} is not available.` }; }
      if (response.ok) { const data = parse(await response.json()); if (data) return { ok: true, data }; return { ok: false, status: 502, error: `${what} could not be read.` }; }
    } catch { /* fall through */ }
    return { ok: false, status: 503, error: `${what} is unavailable.` };
  }
  return {
    conversation: (accountId: string, conversationId: string, page: EnginePageQuery): Promise<EngineReadResult<EngineStatusView>> =>
      read(`${base}${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/engine-status${enginePageSearch(page)}`,
        value => parseEngineStatus(value, accountId, conversationId), "Request status"),
    unresolved: (accountId: string, page: EnginePageQuery): Promise<EngineReadResult<EngineUnresolvedPage>> =>
      read(`${base}${encodeURIComponent(accountId)}/engine/unresolved${enginePageSearch(page)}`,
        value => parseEngineUnresolved(value, accountId), "The list of requests needing review"),
    catalogue: (accountId: string, page: EnginePageQuery): Promise<EngineReadResult<EngineCataloguePage>> =>
      read(`${base}${encodeURIComponent(accountId)}/engine/catalogue${enginePageSearch(page)}`,
        value => parseEngineCatalogue(value, accountId), "The engine catalogue"),
  };
}
export function configuredEngineStatusBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("API");
  return options ? createEngineStatusBackend({ ...options, fetchImpl }) : null;
}
