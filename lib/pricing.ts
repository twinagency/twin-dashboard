// Category pricing guide (clones.category_pricing jsonb).
//
// Pairs with the AI media auto-tagging: on upload a vision model tags each item
// from a FIXED vocabulary (MEDIA_TAGS below). This guide maps each category → a
// suggested Star price, so an item's price is DERIVED from what it shows, using
// the operator's numbers only. Money stays code-locked — the AI never invents a
// price; it only produces tags, and the operator owns the price for each tag.
//
// This module is intentionally free of `server-only`/React so it can be shared
// by the server upload action AND the client config editor. caption.ts imports
// MEDIA_TAGS from here (not the other way round — caption.ts is server-only).

// The fixed tag vocabulary the vision model may use. Kept here (not in the
// server-only caption.ts) so the dashboard editor can list the same categories.
export const MEDIA_TAGS = [
  "tits",
  "ass",
  "pussy",
  "anal",
  "lingerie",
  "bikini",
  "topless",
  "full_nude",
  "feet",
  "mirror_selfie",
  "outdoor",
  "pool",
  "bed",
  "shower",
  "solo",
] as const;

export type MediaTag = (typeof MEDIA_TAGS)[number];

// The "no category matched / safe" bucket key. Not a real tag — it's the default
// price used when an item is SFW or none of its tags are priced.
export const SFW_KEY = "sfw";

// A category price map: category key → Star price. sfw + every MEDIA_TAG.
export type CategoryPricing = Record<string, number>;

// The categories shown in the editor, in a sensible soft→hard display order.
// sfw always first (it's the fallback bucket).
export const PRICING_CATEGORIES: string[] = [
  SFW_KEY,
  "mirror_selfie",
  "outdoor",
  "pool",
  "bed",
  "shower",
  "solo",
  "bikini",
  "feet",
  "lingerie",
  "ass",
  "topless",
  "tits",
  "full_nude",
  "pussy",
  "anal",
];

// Human labels for the editor.
export const CATEGORY_LABELS: Record<string, string> = {
  sfw: "Safe / default (no match)",
  mirror_selfie: "Mirror selfie",
  outdoor: "Outdoor",
  pool: "Pool",
  bed: "Bed",
  shower: "Shower",
  solo: "Solo",
  bikini: "Bikini",
  feet: "Feet",
  lingerie: "Lingerie",
  ass: "Ass",
  topless: "Topless",
  tits: "Tits",
  full_nude: "Full nude",
  pussy: "Pussy",
  anal: "Anal",
};

// Sensible out-of-the-box ladder (⭐). Nudes cost more than lingerie; lingerie/
// bikini above sfw; sfw lowest. The operator edits these freely.
export const DEFAULT_CATEGORY_PRICING: CategoryPricing = {
  sfw: 15,
  mirror_selfie: 20,
  outdoor: 20,
  pool: 25,
  bed: 25,
  solo: 25,
  shower: 30,
  bikini: 30,
  feet: 35,
  lingerie: 40,
  ass: 55,
  topless: 60,
  tits: 60,
  full_nude: 90,
  pussy: 90,
  anal: 100,
};

// Coerce a raw jsonb value into a clean { category: positive-int price } map.
// Returns null when there is nothing usable (missing / not an object / no valid
// numeric entry) so callers can fail soft and keep their existing behavior.
export function normalizeGuide(raw: unknown): CategoryPricing | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: CategoryPricing = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return Object.keys(out).length ? out : null;
}

// Tags that only describe actual nudity/exposure, not an outfit or setting. The
// vision tagger sometimes attaches one of these to a covered/suggestive shot
// (e.g. a bikini photo tagged "ass"), so when the item ISN'T marked nsfw these
// tags are ignored for pricing — a non-nude item should never inherit a nude
// tier price just because a body-part tag slipped onto it. Every other tag
// (bikini, lingerie, feet, mirror_selfie, outdoor, pool, bed, shower, solo)
// describes an outfit or setting, not exposure, so it always counts.
const NUDE_ONLY_TAGS = new Set<string>(["tits", "ass", "topless", "full_nude", "pussy", "anal"]);

// Derive the Star price for an item from the guide, its tags, and its nsfw flag.
// - Pick the HIGHEST-priced matching category among the item's tags
//     (so a full_nude+bikini item prices at the full_nude price).
// - If it's explicit (nsfw) the top matching category wins outright.
// - If it's not explicit, NUDE_ONLY_TAGS are excluded from matching first (see
//     above), then the remaining tags are used but never dip below the
//     sfw/default price.
// - No matching category (or no tags, e.g. a plain sfw item) → the sfw price.
// Returns null when the guide is unusable, so the caller keeps its own default
// (never overrides existing behavior with a made-up number).
export function priceFromGuide(raw: unknown, tags: string[], nsfw: boolean): number | null {
  const map = normalizeGuide(raw);
  if (!map) return null;
  const sfw = typeof map[SFW_KEY] === "number" ? map[SFW_KEY] : null;

  const tagList = (Array.isArray(tags) ? tags : []).filter((t) => nsfw || !NUDE_ONLY_TAGS.has(t));
  const matched = tagList.map((t) => map[t]).filter((v): v is number => typeof v === "number");

  if (matched.length) {
    const top = Math.max(...matched);
    return nsfw ? top : Math.max(sfw ?? 0, top);
  }
  return sfw;
}
