/** Operator-selected vault attachments; no source URLs or credentials. */
export type ManualMedia = { mediaIds: string[]; previewIds: string[]; priceCents: number };
const id = (v: unknown): v is string => typeof v === "string" && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) < BigInt("9223372036854775808");
export function validManualMedia(value: unknown): value is ManualMedia {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "mediaIds,previewIds,priceCents" ||
      !Array.isArray(v.mediaIds) || v.mediaIds.length < 1 || v.mediaIds.length > 20 ||
      !v.mediaIds.every(id) || new Set(v.mediaIds).size !== v.mediaIds.length ||
      !Array.isArray(v.previewIds) || !v.previewIds.every(id) || new Set(v.previewIds).size !== v.previewIds.length ||
      !Number.isSafeInteger(v.priceCents) || !(v.priceCents === 0 || Number(v.priceCents) >= 300 && Number(v.priceCents) <= 20000)) return false;
  return v.previewIds.every(x => (v.mediaIds as string[]).includes(x)) &&
    (v.priceCents === 0 ? v.previewIds.length === 0 : v.previewIds.length < v.mediaIds.length);
}
export function manualPriceCents(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents >= 300 && cents <= 20000 ? cents : null;
}
export function canonicalManualMedia(value: ManualMedia): string {
  return JSON.stringify({ mediaIds: value.mediaIds, previewIds: value.previewIds, priceCents: value.priceCents });
}

