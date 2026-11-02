// Mirrors public.catalogue_bundle_immutable() exactly: least(2200, sum - cheapest).
// The trigger recomputes this itself on insert and rejects any drift, so this
// is the price to send, not just a preview of one.
export const CATALOGUE_BUNDLE_PRICE_CAP_STARS = 2200;
export function catalogueBundlePricing(starValues: number[]): { priceStars: number; regularStars: number } {
  const regularStars = starValues.reduce((a, b) => a + b, 0);
  const cheapest = Math.min(...starValues);
  return { priceStars: Math.min(CATALOGUE_BUNDLE_PRICE_CAP_STARS, regularStars - cheapest), regularStars };
}
