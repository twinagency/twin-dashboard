/** of-content.v2: the v1 editor fields plus pricing mode and import provenance.
 * v1 parsers and callers stay unchanged; this module only adds the explicit v2 shape. */
import { CONTENT_SCHEMA, parseContentAck, parseContentItem, validContentRequest,
  type ContentItem, type ContentRequest } from "./content";

export const CONTENT_V2_SCHEMA = "of-content.v2";
export type ContentProvenance = { sourcePriceCents: number; sourceAt: string | null; sourceContext: string | null;
  previewIds: string[]; withdrawn: boolean; label: string };
export type ContentItemV2 = ContentItem & { pricingMode: "dynamic" | "fixed"; provenance: ContentProvenance | null; priceOverridden: boolean };
export type ContentRequestV2 = ContentRequest & { acknowledgeOverride: boolean };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const V2_KEYS = ["pricingMode", "provenance", "priceOverridden"];

function provenance(value: unknown): value is ContentProvenance | null {
  return value === null || (object(value) && Number.isInteger(value.sourcePriceCents) && (value.sourcePriceCents as number) >= 300 &&
    (value.sourcePriceCents as number) <= 20_000 && (value.sourceAt === null || typeof value.sourceAt === "string") &&
    (value.sourceContext === null || typeof value.sourceContext === "string") && Array.isArray(value.previewIds) &&
    value.previewIds.every(id => typeof id === "string" && /^[1-9][0-9]{0,18}$/.test(id)) && typeof value.withdrawn === "boolean" &&
    value.label === "Price from selected OnlyFans offer");
}

export function parseContentItemV2(value: unknown, accountId: string, itemId: string): ContentItemV2 | null {
  if (!object(value) || value.schemaVersion !== CONTENT_V2_SCHEMA || !object(value.item)) return null;
  const item = value.item;
  if (!["dynamic", "fixed"].includes(item.pricingMode as string) || !provenance(item.provenance) || typeof item.priceOverridden !== "boolean") return null;
  const v1 = Object.fromEntries(Object.entries(item).filter(([key]) => !V2_KEYS.includes(key)));
  const base = parseContentItem({ ...value, schemaVersion: CONTENT_SCHEMA, item: v1 }, accountId, itemId);
  return base ? { ...base, pricingMode: item.pricingMode as "dynamic" | "fixed", provenance: item.provenance as ContentProvenance | null,
    priceOverridden: item.priceOverridden } : null;
}

export function validContentRequestV2(value: unknown): value is ContentRequestV2 {
  if (!object(value) || typeof value.acknowledgeOverride !== "boolean") return false;
  const { acknowledgeOverride: _ack, ...rest } = value;
  return validContentRequest(rest);
}

export function parseContentAckV2(value: unknown, expected: ContentRequestV2 & { accountId: string; itemId: string; commandKey?: string }) {
  if (!object(value) || value.schemaVersion !== CONTENT_V2_SCHEMA) return null;
  const { acknowledgeOverride: _ack, ...request } = expected;
  const ack = parseContentAck({ ...value, schemaVersion: CONTENT_SCHEMA }, request);
  return ack ? { ...ack, schemaVersion: CONTENT_V2_SCHEMA } : null;
}
