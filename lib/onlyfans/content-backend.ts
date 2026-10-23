import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
/** Server-owned purpose credential for saved catalogue metadata only. */
import { CONTENT_HEADER, CONTENT_SCHEMA, parseContentItem, parseContentAck,
  type ContentRequest, type ContentFailure } from "./content";
import { CONTENT_V2_SCHEMA, parseContentItemV2, parseContentAckV2, type ContentRequestV2 } from "./content-v2";

export function createContentBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const url = (accountId: string, itemId: string) => options.baseUrl.replace(/\/+$/, "") +
    `/onlyfans/content/v1/accounts/${encodeURIComponent(accountId)}/items/${encodeURIComponent(itemId)}`;
  const headers = { Authorization: `Bearer ${options.token}`, [CONTENT_HEADER]: CONTENT_SCHEMA };
  const urlV2 = (accountId: string, itemId: string) => url(accountId, itemId).replace("/onlyfans/content/v1/", "/onlyfans/content/v2/");
  const headersV2 = { Authorization: `Bearer ${options.token}`, [CONTENT_HEADER]: CONTENT_V2_SCHEMA };
  return {
    async getV2(accountId: string, itemId: string) {
      try {
        const response = await call(urlV2(accountId, itemId), { method: "GET", headers: headersV2 });
        if (response.ok) { const data = parseContentItemV2(await response.json(), accountId, itemId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "Saved catalogue item could not be read." };
      } catch { return { ok: false as const, status: 503, error: "Saved catalogue item could not be read." }; }
    },
    async saveV2(accountId: string, itemId: string, command: ContentRequestV2 & { commandKey: string; actor: string }) {
      try {
        const response = await call(urlV2(accountId, itemId), { method: "POST", headers: { ...headersV2, "Content-Type": "application/json" }, body: JSON.stringify(command) });
        if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) {
          let error = response.status === 409 ? "Catalogue item changed. Review the refreshed values before saving again." : "The catalogue change was not accepted. Review the values and try again.";
          try { const body = await response.json() as { error?: unknown }; if (response.status === 400 && typeof body.error === "string" && body.error.length <= 300) error = body.error; } catch { /* keep generic */ }
          return { ok: false, status: response.status, outcome: "refused", error } as ContentFailure;
        }
        if (response.ok) {
          const ack = parseContentAckV2(await response.json(), { ...command, accountId, itemId });
          if (ack) return { ok: true as const, ack };
        }
      } catch { /* No reply cannot prove the transaction failed. Preserve the exact request. */ }
      return { ok: false, status: 502, outcome: "unconfirmed", error: "The save outcome is not confirmed. Retry the same request or review the refreshed item." } as ContentFailure;
    },
    async get(accountId: string, itemId: string) {
      try {
        const response = await call(url(accountId, itemId), { method: "GET", headers });
        if (response.ok) { const data = parseContentItem(await response.json(), accountId, itemId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "Saved catalogue item could not be read." };
      } catch { return { ok: false as const, status: 503, error: "Saved catalogue item could not be read." }; }
    },
    async save(accountId: string, itemId: string, command: ContentRequest & { commandKey: string; actor: string }) {
      try {
        const response = await call(url(accountId, itemId), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(command) });
        if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status, outcome: "refused",
          error: response.status === 409 ? "Catalogue item changed. Review the refreshed values before saving again." : "The catalogue change was not accepted. Review the values and try again." } as ContentFailure;
        if (response.ok) {
          const ack = parseContentAck(await response.json(), { ...command, accountId, itemId });
          if (ack) return { ok: true as const, ack };
        }
      } catch { /* No reply cannot prove the transaction failed. Preserve the exact request. */ }
      return { ok: false, status: 502, outcome: "unconfirmed", error: "The save outcome is not confirmed. Retry the same request or review the refreshed item." } as ContentFailure;
    },
  };
}
export function configuredContentBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTENT");
  return options ? createContentBackend({ ...options, fetchImpl }) : null;
}
