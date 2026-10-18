import { CONTENT_SCHEMA } from "./content";
import { vaultMediaId } from "./vault";
export type AssetMetadata = { mediaId: string; fingerprint: string; description: string | null; tags: string[] | null };
export type FolderSummary = { folderId: string; name: string; count: number };
export type FolderMetadata = FolderSummary & { fingerprint: string; archived: boolean };
export type AssetPatch = { patch: { description?: string | null; tags?: string[] }; expectedFingerprint: string };
export type FolderPatch = { action: "create" | "rename" | "archive" | "add" | "remove"; name: string | null;
  mediaIds: string[] | null; expectedFingerprint: string | null };
export type VaultEditRequest = (AssetPatch | FolderPatch) & { requestId: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const text = (v: unknown, n: number): v is string => typeof v === "string" && v.isWellFormed() && !v.includes("\0") && new TextEncoder().encode(v).length <= n;
export const vaultEditHash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export const folderReference = (v: unknown): v is string => vaultMediaId(v) && BigInt(v) < BigInt("2147483648");
const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 5000;
const folder = (v: unknown) => object(v) && folderReference(v.folderId) && text(v.name, 480) && !!v.name.trim() && v.name.length <= 120 && count(v.count);
export function validVaultResource(resource: string) {
  const parts = resource.split("/");
  return resource === "folders" || parts.length === 2 && (parts[0] === "folders" ? folderReference(parts[1]) : parts[0] === "assets" && vaultMediaId(parts[1]));
}
export function validVaultEdit(resource: string, v: unknown): v is VaultEditRequest {
  if (!validVaultResource(resource) || !object(v) || typeof v.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.requestId)) return false;
  if (resource.startsWith("assets/")) {
    if (!exact(v,["requestId","patch","expectedFingerprint"]) || !vaultEditHash(v.expectedFingerprint) || !object(v.patch) || !Object.keys(v.patch).length || Object.keys(v.patch).some(k => !["description","tags"].includes(k))) return false;
    return (!("description" in v.patch) || v.patch.description === null || text(v.patch.description,2000)) &&
      (!("tags" in v.patch) || Array.isArray(v.patch.tags) && v.patch.tags.length <= 12 && v.patch.tags.every(t=>text(t,80)&&!!t.trim()));
  }
  if (!exact(v,["requestId","action","name","mediaIds","expectedFingerprint"]) || !["create","rename","archive","add","remove"].includes(v.action as string)) return false;
  if (resource === "folders" ? v.action !== "create" || v.expectedFingerprint !== null : v.action === "create" || !vaultEditHash(v.expectedFingerprint)) return false;
  if (["create","rename"].includes(v.action as string) ? !text(v.name,480) || !v.name.trim() || v.name.length > 120 || /[\u0000-\u001f]/.test(v.name) : v.name !== null) return false;
  return ["add","remove"].includes(v.action as string) ? Array.isArray(v.mediaIds) && v.mediaIds.length > 0 && v.mediaIds.length <= 40 && v.mediaIds.every(vaultMediaId) && new Set(v.mediaIds).size === v.mediaIds.length : v.mediaIds === null;
}
export function parseVaultResource(v: unknown, account: string, resource: string): AssetMetadata | FolderMetadata | FolderSummary[] | null {
  if (!validVaultResource(resource) || !object(v) || v.schemaVersion !== CONTENT_SCHEMA || v.ok !== true || v.accountId !== account) return null;
  const key = resource === "folders" ? "folders" : resource.startsWith("folders/") ? "folder" : "asset";
  if (!exact(v,["schemaVersion","ok","accountId",key])) return null;
  const data = v[key];
  if (key === "folders") return Array.isArray(data) && data.length <= 200 && data.every(x=>folder(x)&&exact(x,["folderId","name","count"])) && new Set(data.map(x=>x.folderId)).size === data.length ? data as FolderSummary[] : null;
  if (key === "folder") return object(data) && folder(data) && exact(data,["folderId","name","count","fingerprint","archived"]) && data.folderId === resource.split("/")[1] && vaultEditHash(data.fingerprint) && data.archived === false ? data as FolderMetadata : null;
  return object(data) && exact(data,["mediaId","fingerprint","description","tags"]) && data.mediaId === resource.split("/")[1] && vaultEditHash(data.fingerprint) &&
    (data.description === null || text(data.description,2000)) && (data.tags === null || Array.isArray(data.tags) && data.tags.length <= 12 && data.tags.every(t=>text(t,80))) ? data as AssetMetadata : null;
}
export function parseVaultEditAck(v: unknown, account: string, resource: string, commandKey?: string): { targetId: string; fingerprint: string } | null {
  if (!object(v) || !exact(v,["schemaVersion","ok","applied","accountId","commandKey","targetId","fingerprint"]) || v.schemaVersion !== CONTENT_SCHEMA || v.ok !== true || v.applied !== true || v.accountId !== account || !vaultEditHash(v.commandKey) || commandKey !== undefined && commandKey !== v.commandKey || !vaultEditHash(v.fingerprint)) return null;
  if (!(resource.startsWith("assets/") ? vaultMediaId(v.targetId) : folderReference(v.targetId)) || resource !== "folders" && v.targetId !== resource.split("/")[1]) return null;
  return { targetId: v.targetId as string, fingerprint: v.fingerprint };
}
