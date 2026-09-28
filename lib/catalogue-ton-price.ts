// Pure TON pricing shared by the server charge (lib/catalogue-ton.ts) and the Mini App
// label (app/catalogue/[slug]/Catalogue.tsx). No server imports here, so the client
// bundle can use it and the price a fan sees is always the price they are charged.

export const TON_PRICE_STEP_NANOTON = 100_000_000; // 0.1 TON

// Stars price to nanoton, discounted, rounded UP to the next 0.1 TON, minimum 0.1 TON.
// Returns null when the inputs cannot produce a positive price.
export function tonPriceNanoton(stars: number, nanotonPerStar: number | string, discountPercent = 0): number | null {
  const raw = Number(stars) * Number(nanotonPerStar) * (100 - Number(discountPercent)) / 100;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  // Round to whole nanoton first so float noise on an exact multiple never bumps it a step.
  const steps = Math.max(1, Math.ceil(Math.round(raw) / TON_PRICE_STEP_NANOTON));
  const amount = steps * TON_PRICE_STEP_NANOTON;
  return Number.isSafeInteger(amount) ? amount : null;
}

// 2_200_000_000 -> "2.2", 3_000_000_000 -> "3". Expects a multiple of 0.1 TON.
export function formatTonAmount(nanoton: number): string {
  const tenths = Math.round(nanoton / TON_PRICE_STEP_NANOTON);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac ? `${whole}.${frac}` : String(whole);
}
