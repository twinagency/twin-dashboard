// Display reference only. Telegram checkout continues to charge the stored Stars price.
// Mobile USD estimate checked 2026-09-27: official retail chart lists 1,000 Stars at $19.99.
// Rounded to $0.02 per Star; this is not the creator withdrawal rate or a live quote.
// https://core.telegram.org/bots/payments-stars#star-pricing
// Actual top-up prices vary by platform, country, taxes and pack size.
export const CATALOGUE_USD_PER_STAR = 0.02;

export function catalogueUsdEstimate(stars: number): string {
  if (!Number.isSafeInteger(stars) || stars < 0) throw new Error('Invalid Stars price');
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(stars * CATALOGUE_USD_PER_STAR);
}
