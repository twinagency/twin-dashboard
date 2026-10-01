import { createHash } from "node:crypto";
import { parseCampaignBundle, type CampaignBundle } from "./campaign-bundle";
import { validateMessage } from "./media-caption";

export interface MediaBundleCampaign {
  version: 1;
  cloneId: string;
  kind: "video";
  caption: string;
  assets: { id: string; sha256: string; width: number; height: number; durationSeconds: number }[];
  bundle: CampaignBundle;
}

/** Canonical field order makes review retries independent of JSONB key ordering. */
export function parseMediaBundleCampaign(value: unknown, cloneId: string): MediaBundleCampaign {
  const c = value as MediaBundleCampaign & { sequence?: unknown; captions?: unknown };
  if (!c || c.version !== 1 || c.cloneId !== cloneId || c.kind !== "video" || c.sequence != null || c.captions !== undefined
    || validateMessage(c.caption, 1024, { reviewedCampaignCopy: true })
    || !Array.isArray(c.assets) || c.assets.length < 1 || c.assets.length > 10) throw new Error("Invalid media campaign");
  const ids = new Set<string>();
  const hashes = new Set<string>();
  const assets = c.assets.map(a => {
    if (!a || typeof a.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(a.id) || !/^[a-f0-9]{64}$/.test(a.sha256)
      || ![a.width, a.height, a.durationSeconds].every(v => Number.isFinite(v) && v > 0)
      || !Number.isInteger(a.width) || !Number.isInteger(a.height)
      || a.width > 8192 || a.height > 8192 || a.durationSeconds > 3600
      || ids.has(a.id) || hashes.has(a.sha256)) throw new Error("Invalid or duplicate preview video");
    ids.add(a.id); hashes.add(a.sha256);
    return { id: a.id, sha256: a.sha256, width: a.width, height: a.height, durationSeconds: a.durationSeconds };
  });
  return { version: 1, cloneId, kind: "video", caption: c.caption, assets, bundle: parseCampaignBundle(c.bundle, cloneId) };
}

export function sameMediaBundleCampaign(a: unknown, b: unknown, cloneId: string): boolean {
  try {
    return JSON.stringify(parseMediaBundleCampaign(a, cloneId)) === JSON.stringify(parseMediaBundleCampaign(b, cloneId));
  } catch { return false; }
}

/** A review binds the offer and delivery choices, not just an audience count. */
export function mediaCampaignReviewKey(run: {
  photoCampaign?: unknown; cloneIds: string[]; filters: unknown;
  dailyCap: number; runCap: number | null; holdoutPct: number; allowRecontact?: boolean;
}): string | null {
  if (!run.photoCampaign || !(run.photoCampaign as { bundle?: unknown }).bundle) return null;
  if (run.cloneIds.length !== 1) throw new Error("Invalid media campaign creator");
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
    return value;
  }
  return createHash("sha256").update(JSON.stringify({
    campaign: parseMediaBundleCampaign(run.photoCampaign, run.cloneIds[0]),
    cloneIds: run.cloneIds, filters: ordered(run.filters), dailyCap: run.dailyCap,
    runCap: run.runCap, holdoutPct: run.holdoutPct, allowRecontact: run.allowRecontact === true,
  })).digest("hex");
}
