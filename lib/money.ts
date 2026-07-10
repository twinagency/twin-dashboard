// Telegram Star → USD payout rate, and USD → AUD. Centralized on purpose — the
// old dashboard scattered these as magic numbers. Tweak here if rates change.
export const STAR_USD = 0.013;
export const AUD_PER_USD = 1.4;

export type Currency = "USD" | "AUD";

export function starsToMoney(stars: number, c: Currency): number {
  const usd = stars * STAR_USD;
  return c === "AUD" ? usd * AUD_PER_USD : usd;
}

// Same, but with a live USD→AUD rate (from /api/fx) instead of the static fallback.
export function starsToMoneyRate(stars: number, c: Currency, audPerUsd: number): number {
  const usd = stars * STAR_USD;
  return c === "AUD" ? usd * audPerUsd : usd;
}

export function fmtMoney(amount: number, c: Currency): string {
  const sym = c === "AUD" ? "A$" : "$";
  return (
    sym +
    amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
