import { isScopedLiveCreator } from "../deployment/flirt-live-twin.cjs";

// FLIRT keeps 30% of the star earnings of scoped live creators; they see 70%.
export const SCOPED_CREATOR_SHARE = 0.7;

export function creatorShare(access: unknown): number {
  return isScopedLiveCreator(access) ? SCOPED_CREATOR_SHARE : 1;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Any key naming stars is earnings. Series buckets carry per-clone star values under the clone id.
const STAR_KEY = /stars/i;

function scale(value: number, share: number): number {
  return Number.isInteger(value) ? Math.round(value * share) : value * share;
}

function walk(node: Json, share: number, inSeries: boolean): Json {
  if (Array.isArray(node)) return node.map(item => walk(item, share, inSeries));
  if (!node || typeof node !== "object") return node;
  const out: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "number" && (STAR_KEY.test(key) || (inSeries && key !== "bucket"))) out[key] = scale(value, share);
    else out[key] = walk(value, share, inSeries || key === "series");
  }
  // Our AI cost is never shown to the creator; profit becomes her share of revenue.
  if (typeof out.costUsd === "number") {
    if (typeof out.profitUsd === "number") out.profitUsd = ((node.profitUsd as number) + (node.costUsd as number)) * share;
    out.costUsd = 0;
    if (typeof out.margin === "number") out.margin = 1;
  }
  return out;
}

export function applyCreatorShare<T>(payload: T, share: number): T {
  return share >= 1 ? payload : (walk(payload as Json, share, false) as T);
}
