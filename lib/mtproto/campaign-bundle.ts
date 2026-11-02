/** An operator-reviewed offer. Never populated from fan text or model output. */
export interface CampaignBundle {
  id: string;
  starPrice: number;
  caption: string;
  itemPaths: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseCampaignBundle(value: unknown, cloneId: string): CampaignBundle {
  if (!value || typeof value !== "object" || !UUID.test(cloneId)) throw new Error("invalid_campaign_bundle");
  const b = value as CampaignBundle;
  if (typeof b.id !== "string" || !UUID.test(b.id)
    || !Number.isInteger(b.starPrice) || b.starPrice < 1 || b.starPrice > 4400
    || typeof b.caption !== "string" || !b.caption.trim() || b.caption.length > 1024
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(b.caption)
    || /\{\{|\}\}/.test(b.caption)
    || !Array.isArray(b.itemPaths) || b.itemPaths.length < 1 || b.itemPaths.length > 10
    || new Set(b.itemPaths).size !== b.itemPaths.length
    || b.itemPaths.some(p => typeof p !== "string" || !p.startsWith(`${cloneId}/campaigns/${b.id}/`)
      || !new RegExp(`^${cloneId}/campaigns/${b.id}/[0-9a-f]{64}\\.(jpg|mp4)$`, "i").test(p))) {
    throw new Error("invalid_campaign_bundle");
  }
  return { id: b.id, starPrice: b.starPrice, caption: b.caption, itemPaths: [...b.itemPaths] };
}
