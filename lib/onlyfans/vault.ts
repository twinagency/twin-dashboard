import { CONTENT_SCHEMA, parseContentItem, type ContentItem } from "./content";
export type VaultItem = { mediaId: string; kind: string; durationSeconds: number | null;
  width: number | null; height: number | null; ready: boolean; reason: string | null; description: string | null };
export type VaultSync = { commandKey: string; jobId: string; status: "pending" | "running" | "complete" | "failed" | "superseded";
  pagesRead: number; itemsSeen: number; lastError: string | null; requestedAt: string; updatedAt: string; completedAt: string | null };
export type VaultSummary = { total: number; photos: number; videos: number; other: number; matching: number; folders: number };
export type VaultRead = { items: VaultItem[]; nextCursor: string | null; sync: VaultSync | null; connectionRevision: number | null; summary?: VaultSummary };
export type VaultProduct = { label: string; description: string; priceCents: number; enabled: boolean; mediaIds: string[]; previewMediaIds: string[] };
export type VaultSyncRequest = { requestId: string; expectedConnectionRevision: number };
export type VaultCreateRequest = { requestId: string; product: VaultProduct };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
export const vaultMediaId = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) < BigInt("9223372036854775808");
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.isWellFormed() && !value.includes("\0") && new TextEncoder().encode(value).length <= max;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const stamp = (value: unknown): value is string => typeof value === "string" && /Z$/.test(value) && Number.isFinite(Date.parse(value));
const safeCode = (value: unknown) => value === null || (typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value));
export function parseVaultSync(value: unknown): VaultSync | null {
  if (!object(value) || !exact(value, ["commandKey", "jobId", "status", "pagesRead", "itemsSeen", "lastError", "requestedAt", "updatedAt", "completedAt"]) ||
    !hash(value.commandKey) || !uuid(value.jobId) || !["pending", "running", "complete", "failed", "superseded"].includes(value.status as string) ||
    !integer(value.pagesRead, 0, 200) || !integer(value.itemsSeen, 0, 4800) || !safeCode(value.lastError) || !stamp(value.requestedAt) || !stamp(value.updatedAt) ||
    !(value.completedAt === null || stamp(value.completedAt))) return null;
  return value as VaultSync;
}
export function parseVault(value: unknown, accountId: string): VaultRead | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "accountId", "vault"]) || value.schemaVersion !== CONTENT_SCHEMA || value.ok !== true || value.accountId !== accountId || !object(value.vault)) return null;
  const vault = value.vault;
  if (!exact(vault, ["items", "nextCursor", "sync", "connectionRevision", ...(Object.hasOwn(vault, "summary") ? ["summary"] : [])]) || !Array.isArray(vault.items) || vault.items.length > 24 ||
    !(vault.nextCursor === null || vaultMediaId(vault.nextCursor)) || !(vault.connectionRevision === null || integer(vault.connectionRevision, 1, 2 ** 31 - 1)) ||
    !(vault.sync === null || parseVaultSync(vault.sync))) return null;
  if (vault.summary !== undefined) {
    const summary = vault.summary;
    if (!object(summary) || !exact(summary, ["total", "photos", "videos", "other", "matching", "folders"]) ||
      !Object.values(summary).every(value => integer(value)) ||
      (summary.photos as number) + (summary.videos as number) + (summary.other as number) !== summary.total ||
      (summary.matching as number) > (summary.total as number)) return null;
  }
  for (const row of vault.items) {
    if (!object(row) || !exact(row, ["mediaId", "kind", "durationSeconds", "width", "height", "ready", "reason", "description"]) || !vaultMediaId(row.mediaId) ||
      !text(row.kind, 32) || !row.kind || typeof row.ready !== "boolean" || !safeCode(row.reason) ||
      !(row.durationSeconds === null || integer(row.durationSeconds, 0, 86400)) || !(row.width === null || integer(row.width, 1, 32768)) ||
      !(row.height === null || integer(row.height, 1, 32768)) || !(row.description === null || text(row.description, 2000)) ||
      (row.ready && (!["photo", "video"].includes(row.kind as string) || row.reason !== null))) return null;
  }
  if (new Set(vault.items.map(row => row.mediaId)).size !== vault.items.length) return null;
  return vault as VaultRead;
}
export function validVaultSyncRequest(value: unknown): value is VaultSyncRequest {
  return object(value) && exact(value, ["requestId", "expectedConnectionRevision"]) && uuid(value.requestId) && integer(value.expectedConnectionRevision, 1, 2 ** 31 - 1);
}
export function validVaultProduct(value: unknown): value is VaultProduct {
  if (!object(value) || !exact(value, ["label", "description", "priceCents", "enabled", "mediaIds", "previewMediaIds"]) ||
    !text(value.label, 160) || !value.label.trim() || !text(value.description, 2000) || !value.description.trim() || !integer(value.priceCents, 300, 20000) || typeof value.enabled !== "boolean" ||
    !Array.isArray(value.mediaIds) || !value.mediaIds.length || value.mediaIds.length > 20 || !value.mediaIds.every(vaultMediaId) || new Set(value.mediaIds).size !== value.mediaIds.length ||
    !Array.isArray(value.previewMediaIds) || value.previewMediaIds.length > 19 || !value.previewMediaIds.every(vaultMediaId) || new Set(value.previewMediaIds).size !== value.previewMediaIds.length ||
    value.previewMediaIds.some(mediaId => !(value.mediaIds as string[]).includes(mediaId)) || value.previewMediaIds.length >= value.mediaIds.length) return false;
  return true;
}
export function validVaultCreateRequest(value: unknown): value is VaultCreateRequest {
  return object(value) && exact(value, ["requestId", "product"]) && uuid(value.requestId) && validVaultProduct(value.product);
}
export function parseVaultSyncAck(value: unknown, expected: { accountId: string; commandKey?: string }): VaultSync | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "commandKey", "sync"]) || value.schemaVersion !== CONTENT_SCHEMA || value.ok !== true || value.applied !== true ||
    value.accountId !== expected.accountId || !hash(value.commandKey) || (expected.commandKey !== undefined && expected.commandKey !== value.commandKey)) return null;
  const sync = parseVaultSync(value.sync); return sync && sync.commandKey === value.commandKey ? sync : null;
}
export function parseVaultCreateAck(value: unknown, expected: { accountId: string; product: VaultProduct; commandKey?: string }): { itemId: string; item: ContentItem } | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "commandKey", "itemId", "item"]) || value.schemaVersion !== CONTENT_SCHEMA || value.ok !== true || value.applied !== true || value.accountId !== expected.accountId ||
    !hash(value.commandKey) || (expected.commandKey !== undefined && expected.commandKey !== value.commandKey) || !vaultMediaId(value.itemId)) return null;
  const item = parseContentItem({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: expected.accountId, itemId: value.itemId, item: value.item }, expected.accountId, value.itemId);
  return item && item.revision === 0 && item.label === expected.product.label.trim() && item.description === expected.product.description.trim() && item.priceCents === expected.product.priceCents &&
    item.enabled === expected.product.enabled && !item.isFreeTeaser ? { itemId: value.itemId, item } : null;
}


export function vaultAvailability(row: Pick<VaultItem, "ready" | "reason">): { label: string; explanation: string } {
  if (row.ready) return { label: "Ready for offers", explanation: "OnlyFans availability is verified. This asset can be selected for a catalogue item." };
  switch (row.reason) {
    case "removed": return { label: "Unavailable on OnlyFans", explanation: "OnlyFans reports this asset as removed or hidden. It cannot be offered." };
    case "unsupported_kind": return { label: "Unsupported format", explanation: "Only photo and video assets can be used for offers." };
    case "unverified_owner": return { label: "Verification needed", explanation: "This asset has not been verified against the current account connection. Finish vault sync, or reconnect if the connection has expired." };
    case "not_ready": return { label: "Not ready on OnlyFans", explanation: "OnlyFans has not confirmed this file is available for offers. It may still be processing or access may be restricted." };
    default: return { label: "Availability unconfirmed", explanation: "OnlyFans did not provide enough information to confirm this file is ready for offers. You can still organize its description, tags and folders. This does not mean the file is damaged." };
  }
}
export function vaultDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
