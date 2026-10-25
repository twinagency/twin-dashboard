/** Catalogue metadata editor contract. Media identities stay owned by the vault. */
export const CONTENT_SCHEMA = "of-content.v1";
export const CONTENT_HEADER = "X-OnlyFans-Content-Version";
export type ContentItem = {
  revision: number; fingerprint: string; label: string | null; labelTruncated: boolean;
  description: string | null; descriptionTruncated: boolean; priceCents: number | null;
  enabled: boolean; currency: "USD"; isFreeTeaser: boolean;
};
export type ContentPatch = { label?: string; description?: string; priceCents?: number; enabled?: boolean };
export type ContentRequest = { patch: ContentPatch; expectedRevision: number; expectedFingerprint: string };
export type ContentAck = { schemaVersion: typeof CONTENT_SCHEMA; ok: true; applied: true;
  accountId: string; itemId: string; commandKey: string; recordedRevision: number; recordedFingerprint: string };
export type ContentFailure = { ok: false; status: number; outcome: "refused" | "unconfirmed"; error: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const revision = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2 ** 31 - 1;
export const contentHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const contentItemId = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value) && Number(value) < 2 ** 31;
const boundedText = (value: unknown, maximum: number): value is string => typeof value === "string" && !value.includes("\0") &&
  value.isWellFormed() && new TextEncoder().encode(value).length <= maximum;
const price = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 20_000;

export function validContentRequest(value: unknown): value is ContentRequest {
  if (!object(value) || !exact(value, ["patch", "expectedRevision", "expectedFingerprint"]) || !revision(value.expectedRevision) ||
    !contentHash(value.expectedFingerprint) || !object(value.patch)) return false;
  const patch = value.patch;
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !["label", "description", "priceCents", "enabled"].includes(key))) return false;
  return (!("label" in patch) || (boundedText(patch.label, 160) && !!patch.label.trim())) &&
    (!("description" in patch) || boundedText(patch.description, 2000)) &&
    (!("priceCents" in patch) || (price(patch.priceCents) && (patch.priceCents === 0 || patch.priceCents >= 300))) && (!("enabled" in patch) || typeof patch.enabled === "boolean");
}

export function parseContentItem(value: unknown, accountId: string, itemId: string): ContentItem | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "accountId", "itemId", "item"]) ||
    value.schemaVersion !== CONTENT_SCHEMA || value.ok !== true || value.accountId !== accountId || value.itemId !== itemId || !object(value.item)) return null;
  const item = value.item;
  if (!exact(item, ["revision", "fingerprint", "label", "labelTruncated", "description", "descriptionTruncated", "priceCents", "enabled", "currency", "isFreeTeaser"]) ||
    !revision(item.revision) || !contentHash(item.fingerprint) || typeof item.labelTruncated !== "boolean" ||
    (item.labelTruncated ? item.label !== null : !boundedText(item.label, 160)) || typeof item.descriptionTruncated !== "boolean" ||
    (item.descriptionTruncated ? item.description !== null : !boundedText(item.description, 2000)) ||
    !(item.priceCents === null || (price(item.priceCents) && (item.isFreeTeaser ? item.priceCents === 0 : item.priceCents >= 300))) ||
    typeof item.enabled !== "boolean" || item.currency !== "USD" || typeof item.isFreeTeaser !== "boolean") return null;
  return item as ContentItem;
}

export function parseContentAck(value: unknown, expected: ContentRequest & { accountId: string; itemId: string; commandKey?: string }): ContentAck | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "itemId", "commandKey", "recordedRevision", "recordedFingerprint"]) ||
    value.schemaVersion !== CONTENT_SCHEMA || value.ok !== true || value.applied !== true || value.accountId !== expected.accountId || value.itemId !== expected.itemId ||
    value.recordedRevision !== expected.expectedRevision + 1 || !contentHash(value.commandKey) || !contentHash(value.recordedFingerprint) ||
    (expected.commandKey !== undefined && value.commandKey !== expected.commandKey)) return null;
  return value as ContentAck;
}

/** Parse a displayed USD amount without binary floating-point rounding. */
export function parseContentPrice(value: string): number | null {
  const match = /^(0|[1-9][0-9]{0,2})(?:\.([0-9]{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return price(cents) ? cents : null;
}
export const displayContentPrice = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
export function canonicalContent(value: unknown): string {
  return JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
