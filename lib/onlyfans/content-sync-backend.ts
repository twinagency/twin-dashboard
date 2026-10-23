import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { FAILURE_MESSAGES, SYNC_CHUNK_BYTES, SYNC_HEADER, SYNC_SCHEMA, parseChunkResponse, parseCommandResponse, parseConflictsResponse,
  parseDraftResponse, parseDraftsPage, parseFailureCode, parseOperationResponse, parseOperationsPage, parseResolveResponse,
  parseSettingsResponse, parseStatusResponse, type SyncFailureCode } from "./content-sync";

export type SyncFailure = { ok: false; status: number; outcome: "refused" | "unconfirmed"; code: SyncFailureCode; error: string };
const failure = (status: number, outcome: SyncFailure["outcome"], code: SyncFailureCode): SyncFailure => ({ ok: false, status, outcome, code, error: FAILURE_MESSAGES[code] });
const REFUSED = new Set([400, 404, 409, 413, 503]);

/** Server-owned content-purpose credential for the private content sync contract.
 * Writes are attempted once. A missing or unreadable reply is "unconfirmed", never "failed". */
export function createContentSyncBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const base = (accountId: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/content-sync/v1/accounts/${encodeURIComponent(accountId)}`;
  const headers = { Authorization: `Bearer ${options.token}`, [SYNC_HEADER]: SYNC_SCHEMA };

  async function refusal(response: Response): Promise<SyncFailure> {
    let code: SyncFailureCode | null = null;
    try { code = parseFailureCode(await response.json()); } catch { /* generic below */ }
    // A rejected service credential is our configuration problem, never the browser's session.
    if (response.status === 401 || response.status === 403) return failure(503, "refused", "sync_unavailable");
    if (response.status === 500 && code === "outcome_unconfirmed") return failure(502, "unconfirmed", "outcome_unconfirmed");
    if (!REFUSED.has(response.status)) return failure(502, "unconfirmed", "outcome_unconfirmed");
    return failure(response.status, "refused", code ?? (response.status === 404 ? "not_available" : response.status === 503 ? "sync_unavailable" : "invalid_sync_request"));
  }
  async function read<T>(url: string, parse: (value: unknown) => T | null) {
    try {
      const response = await call(url, { method: "GET", headers });
      if (response.ok) { const data = parse(await response.json()); if (data !== null) return { ok: true as const, data }; return failure(503, "refused", "sync_unavailable"); }
      const failed = await refusal(response);
      return failed.outcome === "unconfirmed" ? failure(503, "refused", "sync_unavailable") : failed;
    } catch { return failure(503, "refused", "sync_unavailable"); }
  }
  async function write<T>(method: "POST" | "PUT", url: string, body: BodyInit, contentType: string, parse: (value: unknown) => T | null, extra: Record<string, string> = {}, timeoutMs?: number) {
    try {
      const response = await call(url, { method, headers: { ...headers, ...extra, "Content-Type": contentType }, body, ...(timeoutMs ? { timeoutMs } : {}) });
      if (response.ok) { const data = parse(await response.json()); if (data !== null) return { ok: true as const, data }; }
      else return await refusal(response);
    } catch { /* No reply cannot prove failure. The client keeps the exact request. */ }
    return failure(502, "unconfirmed", "outcome_unconfirmed");
  }
  const post = <T>(url: string, body: unknown, parse: (value: unknown) => T | null) => write("POST", url, JSON.stringify(body), "application/json", parse);

  return {
    status: (accountId: string) => read(base(accountId) + "/status", v => parseStatusResponse(v, accountId)),
    settings: (accountId: string, body: { enabled: boolean; expectedRevision: number; commandKey: string; actor: string }) =>
      post(base(accountId) + "/settings", body, v => parseSettingsResponse(v, accountId)),
    syncNow: (accountId: string, body: { kind: string; commandKey: string; actor: string }) =>
      post(base(accountId) + "/sync", body, v => parseOperationResponse(v, accountId)),
    operations: (accountId: string, after: string | null, limit: number) =>
      read(base(accountId) + `/operations?limit=${limit}` + (after ? `&after=${encodeURIComponent(after)}` : ""), v => parseOperationsPage(v, accountId)),
    operation: (accountId: string, operationId: string) => read(base(accountId) + `/operations/${encodeURIComponent(operationId)}`, v => parseOperationResponse(v, accountId)),
    retry: (accountId: string, operationId: string, body: { commandKey: string; actor: string }) =>
      post(base(accountId) + `/operations/${encodeURIComponent(operationId)}/retry`, body, v => parseOperationResponse(v, accountId)),
    conflicts: (accountId: string, status: "open" | "all") => read(base(accountId) + `/conflicts?status=${status}`, v => parseConflictsResponse(v, accountId)),
    resolve: (accountId: string, conflictId: string, body: Record<string, unknown>) =>
      post(base(accountId) + `/conflicts/${encodeURIComponent(conflictId)}/resolve`, body, v => parseResolveResponse(v, accountId)),
    createDraft: (accountId: string, body: Record<string, unknown>) => post(base(accountId) + "/drafts", body, v => parseDraftResponse(v, accountId)),
    putChunk: (accountId: string, draftId: string, fileId: string, index: number, bytes: Uint8Array, actor: string) => {
      if (!bytes.length || bytes.length > SYNC_CHUNK_BYTES) return Promise.resolve(failure(413, "refused", "invalid_sync_request"));
      return write("PUT", base(accountId) + `/drafts/${encodeURIComponent(draftId)}/files/${encodeURIComponent(fileId)}/chunks/${index}`,
        Buffer.from(bytes), "application/octet-stream", v => parseChunkResponse(v, accountId), { "X-OnlyFans-Actor": actor }, 30_000);
    },
    commit: (accountId: string, draftId: string, body: { commandKey: string; actor: string }) =>
      post(base(accountId) + `/drafts/${encodeURIComponent(draftId)}/commit`, body, v => parseDraftResponse(v, accountId)),
    drafts: (accountId: string, after: string | null, limit: number) =>
      read(base(accountId) + `/drafts?limit=${limit}` + (after ? `&after=${encodeURIComponent(after)}` : ""), v => parseDraftsPage(v, accountId)),
    draft: (accountId: string, draftId: string) => read(base(accountId) + `/drafts/${encodeURIComponent(draftId)}`, v => parseDraftResponse(v, accountId)),
    command: (accountId: string, commandKey: string) => read(base(accountId) + `/commands/${commandKey}`, v => parseCommandResponse(v, accountId)),
  };
}

export function configuredContentSyncBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTENT");
  return options ? createContentSyncBackend({ ...options, fetchImpl }) : null;
}
export type ContentSyncBackend = ReturnType<typeof createContentSyncBackend>;
