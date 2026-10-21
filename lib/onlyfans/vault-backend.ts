import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { CONTENT_HEADER, CONTENT_SCHEMA, type ContentFailure } from "./content";
import { parseVault, parseVaultSyncAck, parseVaultCreateAck, type VaultProduct } from "./vault";
import { validVaultResource, parseVaultResource, parseVaultEditAck, type AssetPatch, type FolderPatch } from "./vault-editing";
import { readVaultPreview } from "./vault-preview";
type Identity = { actor: string; commandKey: string };
export function createVaultBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const base = (accountId: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/content/v1/accounts/${encodeURIComponent(accountId)}`;
  const headers = { Authorization: `Bearer ${options.token}`, [CONTENT_HEADER]: CONTENT_SCHEMA };
  async function post(url: string, body: unknown) {
    try {
      const response = await call(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status, outcome: "refused", error: "The vault command was refused. Review the refreshed account and content terms." } as ContentFailure;
      if (response.ok) return { ok: true as const, body: await response.json() as unknown };
    } catch { /* Preserve uncertainty instead of automatically retrying a write. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The vault command outcome is not confirmed. Refresh or retry the same request." } as ContentFailure;
  }
  return {
    async preview(accountId:string,mediaId:string) {
      try {
        const response=await call(base(accountId)+"/vault/previews/"+mediaId,{method:"GET",headers});
        if(response.status===404){await response.body?.cancel();return {ok:false as const,status:404,error:"That preview is unavailable. Sync the vault to refresh it."};}
        const data=await readVaultPreview(response,accountId,mediaId);
        return {ok:true as const,...data};
      }catch{return {ok:false as const,status:503,error:"The vault preview could not be read."};}
    },
    async readResource(accountId: string, resource: string) {
      if (!validVaultResource(resource)) return { ok: false as const, status: 400, error: "Invalid vault resource." };
      try {
        const response = await call(base(accountId)+"/vault/"+resource, { method: "GET", headers });
        if (response.ok) { const data = parseVaultResource(await response.json(),accountId,resource); if (data !== null) return { ok:true as const, data }; }
        return { ok:false as const, status:response.status===404?404:503, error:"Vault metadata could not be read." };
      } catch { return { ok:false as const,status:503,error:"Vault metadata could not be read." }; }
    },
    async editResource(accountId: string, resource: string, command: (AssetPatch | FolderPatch) & Identity) {
      if (!validVaultResource(resource)) return { ok:false,status:400,outcome:"refused",error:"Invalid vault resource." } as ContentFailure;
      const result = await post(base(accountId)+"/vault/"+resource, command); if (!result.ok) return result;
      const ack = parseVaultEditAck(result.body,accountId,resource,command.commandKey);
      return ack ? { ok:true as const,...ack } : { ok:false,status:502,outcome:"unconfirmed",error:"The edit outcome is not confirmed. Refresh or retry the same request." } as ContentFailure;
    },
    async get(accountId: string, afterMediaId: string | null = null, filters: { query?: string; kind?: string; folderId?: string } = {}) {
      try {
        const url = base(accountId) + "/vault?limit=24&includeSummary=1" + (afterMediaId ? "&afterMediaId=" + encodeURIComponent(afterMediaId) : "") +
          (filters.query ? "&q=" + encodeURIComponent(filters.query) : "") +
          (filters.kind && filters.kind !== "all" ? "&kind=" + encodeURIComponent(filters.kind) : "") +
          (filters.folderId ? "&folderId=" + encodeURIComponent(filters.folderId) : "");
        const response = await call(url, { method: "GET", headers });
        if (response.ok) { const data = parseVault(await response.json(), accountId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "The recorded vault could not be read." };
      } catch { return { ok: false as const, status: 503, error: "The recorded vault could not be read." }; }
    },
    async sync(accountId: string, command: { expectedConnectionRevision: number } & Identity) {
      const result = await post(base(accountId) + "/vault/sync", command); if (!result.ok) return result;
      const sync = parseVaultSyncAck(result.body, { accountId, commandKey: command.commandKey });
      return sync ? { ok: true as const, sync } : { ok: false, status: 502, outcome: "unconfirmed", error: "Vault sync outcome is not confirmed. Refresh or retry the same request." } as ContentFailure;
    },
    async create(accountId: string, command: { product: VaultProduct } & Identity) {
      const result = await post(base(accountId) + "/items", command); if (!result.ok) return result;
      const item = parseVaultCreateAck(result.body, { accountId, commandKey: command.commandKey, product: command.product });
      return item ? { ok: true as const, itemId: item.itemId, item: item.item } : { ok: false, status: 502, outcome: "unconfirmed", error: "Product creation outcome is not confirmed. Refresh or retry the same request." } as ContentFailure;
    },
  };
}
export function configuredVaultBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CONTENT");
  return options ? createVaultBackend({ ...options, fetchImpl }) : null;
}
