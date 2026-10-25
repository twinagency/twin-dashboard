import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { IMPORT_HEADER, IMPORT_SCHEMA, parseCandidate, parseCandidatePage, parseDraftResults, parseJobResponse,
  type DraftInput } from "./offer-import";
import type { ContentFailure } from "./content";

/** Server-owned content-purpose credential for the private offer import contract. */
export function createOfferImportBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const base = (accountId: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/offer-import/v1/accounts/${encodeURIComponent(accountId)}`;
  const headers = { Authorization: `Bearer ${options.token}`, [IMPORT_HEADER]: IMPORT_SCHEMA };
  async function read<T>(url: string, parse: (value: unknown) => T | null) {
    try {
      const response = await call(url, { method: "GET", headers });
      if (response.ok) { const data = parse(await response.json()); if (data !== null) return { ok: true as const, data }; }
      return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "Import records could not be read." };
    } catch { return { ok: false as const, status: 503, error: "Import records could not be read." }; }
  }
  async function post<T>(url: string, body: unknown, parse: (value: unknown) => T | null) {
    try {
      const response = await call(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) {
        let error = "The import command was refused. Refresh and review again.";
        try { const value = await response.json() as { error?: unknown }; if (typeof value.error === "string" && value.error.length <= 300) error = value.error; } catch { /* keep generic */ }
        return { ok: false, status: response.status, outcome: "refused", error } as ContentFailure;
      }
      if (response.ok) { const data = parse(await response.json()); if (data !== null) return { ok: true as const, data }; }
    } catch { /* No reply cannot prove failure. The client keeps the exact request. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The outcome is not confirmed. Retry the same request or check the result." } as ContentFailure;
  }
  return {
    job: (accountId: string, jobId: string) => read(base(accountId) + `/jobs/${jobId}`, v => parseJobResponse(v, accountId)),
    candidates: (accountId: string, jobId: string, after: string | null) =>
      read(base(accountId) + `/jobs/${jobId}/candidates?limit=25` + (after ? `&after=${after}` : ""), v => parseCandidatePage(v, accountId)),
    candidate: (accountId: string, jobId: string, candidateId: string) =>
      read(base(accountId) + `/jobs/${jobId}/candidates/${candidateId}`, v => parseCandidate(v, accountId)),
    command: (accountId: string, key: string) => read(base(accountId) + `/commands/${key}`, v => v),
    startJob: (accountId: string, body: { mode: string; sources: unknown; commandKey: string; actor: string }) =>
      post(base(accountId) + "/jobs", body, v => parseJobResponse(v, accountId)),
    cancel: (accountId: string, jobId: string, body: { expectedRevision: number; actor: string }) =>
      post(base(accountId) + `/jobs/${jobId}/cancel`, body, v => parseJobResponse(v, accountId)),
    drafts: (accountId: string, drafts: (DraftInput & { commandKey: string })[], actor: string) =>
      post(base(accountId) + "/drafts", { drafts, actor }, v => parseDraftResults(v, accountId, drafts.map(d => d.commandKey))),
  };
}

export function configuredOfferImportBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTENT");
  return options ? createOfferImportBackend({ ...options, fetchImpl }) : null;
}
