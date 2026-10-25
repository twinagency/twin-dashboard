import type { MessageAttachments } from "../onlyfans-preview/types";

export function parseMessageAttachments(value: unknown): MessageAttachments | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.count) || (v.count as number) < 0 || (v.count as number) > 100 || !Array.isArray(v.media) || v.media.length > (v.count as number)) return null;
  const ids = new Set<string>();
  for (const item of v.media) {
    if (!item || typeof item !== "object" || typeof item.mediaId !== "string" || !/^[1-9][0-9]{0,18}$/.test(item.mediaId) || BigInt(item.mediaId) >= BigInt("9223372036854775808") || ids.has(item.mediaId) || !["photo", "video", "audio", "unknown"].includes(item.kind)) return null;
    ids.add(item.mediaId);
  }
  const price = v.price as Record<string, unknown> | null;
  if (!price || price.currency !== "USD" || !Number.isSafeInteger(price.minorUnits) || (price.minorUnits as number) < 0) return null;
  if (!["not_applicable", "unconfirmed", "not_purchased", "purchased"].includes(v.purchaseStatus as string)) return null;
  if ((price.minorUnits === 0) !== (v.purchaseStatus === "not_applicable")) return null;
  return v as MessageAttachments;
}

export function attachmentPurchaseLabel(status: MessageAttachments["purchaseStatus"]): string {
  return status === "purchased" ? "Purchased" : status === "not_purchased" ? "No purchase recorded" : status === "unconfirmed" ? "Purchase status unavailable" : "Free media";
}
