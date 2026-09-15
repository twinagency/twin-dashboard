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

// Corruption guard, not a recommended selling price. Zero remains the deliberate
// free-content value on an individual item, while paid values below this floor
// are rejected so a stale 15-100 Star template cannot silently underprice PPV.
// The floor stays below every current high-volume creator catalogue, so it does
// not force an automatic price increase on existing content.
export const MIN_PAID_MEDIA_PRICE_STARS = 250;

// Photo bundles have their own commercial ceiling. Keep this separate from
// individual photo/video category pricing, whose higher tiers are intentional.
export const DEFAULT_PHOTO_BUNDLE_PRICE_STARS = 99;
export const MAX_PHOTO_BUNDLE_PRICE_STARS = 2200;

export function requirePhotoBundlePrice(raw: unknown): number {
  const value = typeof raw === "string" && raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PHOTO_BUNDLE_PRICE_STARS) {
    throw new Error(`Bundle price must be a whole number from 1 to ${MAX_PHOTO_BUNDLE_PRICE_STARS} Stars`);
  }
  return value;
}

// Recommended new-creator baseline (⭐). The old 15-100 Star ladder predated the
// live catalogue and could erase most PPV value when Reset + Reprice was used.
// This recommendation is deliberately separate from the lower corruption guard.
export const DEFAULT_CATEGORY_PRICING: CategoryPricing = {
  sfw: 600,
  mirror_selfie: 600,
  outdoor: 600,
  pool: 800,
  bed: 800,
  solo: 800,
  shower: 1000,
  bikini: 800,
  feet: 1000,
  lingerie: 1000,
  ass: 1400,
  topless: 1400,
  tits: 1400,
  full_nude: 2000,
  pussy: 2800,
  anal: 3600,
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

// Bulk repricing is allowed only from a complete, explicit and commercially
// safe guide. Unknown keys are ignored so a future/stale client cannot make
// arbitrary JSON part of the pricing contract.
export function normalizeSafeCategoryGuide(raw: unknown): CategoryPricing | null {
  const normalized = normalizeGuide(raw);
  if (!normalized) return null;
  const safe: CategoryPricing = {};
  for (const category of PRICING_CATEGORIES) {
    const price = normalized[category];
    if (!Number.isSafeInteger(price) || price < MIN_PAID_MEDIA_PRICE_STARS) return null;
    safe[category] = price;
  }
  return safe;
}

export function isAllowedPaidOrFreePrice(value: number): boolean {
  return Number.isSafeInteger(value) && (value === 0 || value >= MIN_PAID_MEDIA_PRICE_STARS);
}

export type RepriceableMediaRow = {
  id: string;
  tags: string[] | null;
  nsfw: boolean | null;
  star_value: number;
  is_free: boolean | null;
};

export type SafeRepriceChange = { id: string; currentPrice: number; nextPrice: number };

export type SafeRepricePlan = {
  total: number;
  changes: SafeRepriceChange[];
  unchanged: number;
  protectedFree: number;
  protectedFromDecrease: number;
  increaseStars: number;
};

// A safe bulk reprice is monotonic: it may raise guide-managed prices, but it
// never turns free media paid and never lowers a higher/manual price. Deliberate
// reductions remain available through selected-item editing, where the operator
// sees the exact items being changed.
export function buildSafeRepricePlan(rows: RepriceableMediaRow[], rawGuide: unknown): SafeRepricePlan {
  const guide = normalizeSafeCategoryGuide(rawGuide);
  if (!guide) throw new Error(`Every category price must be a whole number of at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`);

  const plan: SafeRepricePlan = {
    total: rows.length,
    changes: [],
    unchanged: 0,
    protectedFree: 0,
    protectedFromDecrease: 0,
    increaseStars: 0,
  };

  for (const row of rows) {
    const currentPrice = Number.isFinite(row.star_value) ? Math.max(0, Math.round(row.star_value)) : 0;
    if (row.is_free || currentPrice === 0) {
      plan.protectedFree++;
      continue;
    }
    const nextPrice = priceFromGuide(guide, row.tags ?? [], !!row.nsfw);
    if (nextPrice == null) {
      plan.unchanged++;
      continue;
    }
    if (nextPrice < currentPrice) {
      plan.protectedFromDecrease++;
      continue;
    }
    if (nextPrice === currentPrice) {
      plan.unchanged++;
      continue;
    }
    plan.changes.push({ id: row.id, currentPrice, nextPrice });
    plan.increaseStars += nextPrice - currentPrice;
  }

  return plan;
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
