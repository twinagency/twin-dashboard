/** What the conversation engine may offer. Parsed from the synced vault; the dashboard never invents status or price. */
import { ENGINE_PAGE_MAX, isCursor } from "./engine-status";
import { contentHash, contentItemId } from "./content";

export const ENGINE_CATALOGUE_SCHEMA = "of-engine-catalogue.v1";
export const ENGINE_CATALOGUE_HEADER = "X-OnlyFans-Engine-Catalogue-Version";
export const CATALOGUE_STATUSES = ["proposed", "approved", "retired"] as const;
export type CatalogueStatus = typeof CATALOGUE_STATUSES[number];
export type EngineCatalogueItem = {
  itemId: string; label: string; mediaCount: number; tags: string[];
  /** A suggestion only. It becomes a price when a person confirms it. */
  proposedPriceCents: number | null; approvedPriceCents: number | null;
  status: CatalogueStatus; revision: number; fingerprint: string };
export type EngineCataloguePage = { schemaVersion: typeof ENGINE_CATALOGUE_SCHEMA; ok: true; accountId: string; items: EngineCatalogueItem[]; nextCursor: string | null };
export type CatalogueDecision =
  | { action: "approve"; expectedRevision: number; expectedFingerprint: string; confirmedPriceCents: number }
  | { action: "retire"; expectedRevision: number; expectedFingerprint: string };
export type CatalogueDecisionResult = { ok: true } | { ok: false; outcome: "refused" | "unconfirmed"; error: string; status?: number };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const revision = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2 ** 31 - 1;
const price = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 300 && (value as number) <= 20_000;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.isWellFormed() && !value.includes("\0") && new TextEncoder().encode(value).length <= max;

/** Only an approved item is described as something that can be offered. */
export const canBeOffered = (item: Pick<EngineCatalogueItem, "status">) => item.status === "approved";
export function catalogueOfferText(item: EngineCatalogueItem): string {
  if (item.status === "approved") return "Can be offered";
  if (item.status === "retired") return "Retired: will not be offered";
  return "Not offered yet: needs approval";
}

export function parseEngineCatalogue(value: unknown, accountId: string): EngineCataloguePage | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "accountId", "items", "nextCursor"]) || value.schemaVersion !== ENGINE_CATALOGUE_SCHEMA ||
      value.ok !== true || value.accountId !== accountId || !Array.isArray(value.items) || value.items.length > ENGINE_PAGE_MAX ||
      !(value.nextCursor === null || isCursor(value.nextCursor))) return null;
  const items: EngineCatalogueItem[] = [];
  for (const row of value.items) {
    if (!object(row) || !exact(row, ["itemId", "label", "mediaCount", "tags", "proposedPriceCents", "approvedPriceCents", "status", "revision", "fingerprint"]) ||
        !contentItemId(row.itemId) || !text(row.label, 160) || !Number.isInteger(row.mediaCount) || Number(row.mediaCount) < 0 || Number(row.mediaCount) > 200 ||
        !Array.isArray(row.tags) || row.tags.length > 32 || !row.tags.every(tag => text(tag, 48) && tag.trim() !== "") ||
        !(row.proposedPriceCents === null || price(row.proposedPriceCents)) || !(row.approvedPriceCents === null || price(row.approvedPriceCents)) ||
        !CATALOGUE_STATUSES.includes(row.status as CatalogueStatus) || !revision(row.revision) || !contentHash(row.fingerprint) ||
        // An approved item always has the price a person confirmed; nothing else may carry one.
        (row.status === "approved") !== (row.approvedPriceCents !== null)) return null;
    items.push(row as unknown as EngineCatalogueItem);
  }
  if (new Set(items.map(item => item.itemId)).size !== items.length) return null;
  return { schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, accountId, items, nextCursor: value.nextCursor as string | null };
}

export function validCatalogueDecision(value: unknown): value is CatalogueDecision {
  if (!object(value) || !revision(value.expectedRevision) || !contentHash(value.expectedFingerprint)) return false;
  if (value.action === "approve") return exact(value, ["action", "expectedRevision", "expectedFingerprint", "confirmedPriceCents"]) && price(value.confirmedPriceCents);
  return value.action === "retire" && exact(value, ["action", "expectedRevision", "expectedFingerprint"]);
}

export type CatalogueDecisionAck = { schemaVersion: typeof ENGINE_CATALOGUE_SCHEMA; ok: true; applied: true; accountId: string; itemId: string; commandKey: string;
  action: "approve" | "retire"; recordedRevision: number; status: "approved" | "retired" };
export function parseCatalogueDecisionAck(value: unknown, expected: { accountId: string; itemId: string; commandKey: string } & CatalogueDecision): CatalogueDecisionAck | null {
  if (!object(value) || !exact(value, ["schemaVersion", "ok", "applied", "accountId", "itemId", "commandKey", "action", "recordedRevision", "status"]) ||
      value.schemaVersion !== ENGINE_CATALOGUE_SCHEMA || value.ok !== true || value.applied !== true || value.accountId !== expected.accountId || value.itemId !== expected.itemId ||
      value.commandKey !== expected.commandKey || value.action !== expected.action || value.recordedRevision !== expected.expectedRevision + 1 ||
      value.status !== (expected.action === "approve" ? "approved" : "retired")) return null;
  return value as CatalogueDecisionAck;
}
