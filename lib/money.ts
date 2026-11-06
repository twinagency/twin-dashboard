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

// Cost and profit come out of the analytics layer already in USD (usage_events
// bills in USD), while revenue comes out in Stars and goes through
// starsToMoneyRate above. Rendering the first with a bare "$" next to the
// second's "A$" put two different currencies side by side in the same table,
// unlabelled, and a profit/revenue pair the operator would naturally compare is
// exactly the wrong place for that: at 1.4 AUD/USD the margin reads 30% low.
export function usdToMoneyRate(usd: number, c: Currency, audPerUsd: number): number {
  return c === "AUD" ? usd * audPerUsd : usd;
}

export function fmtMoney(amount: number, c: Currency): string {
  const sym = c === "AUD" ? "A$" : "$";
  return (
    sym +
    amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtNum(n: number, locale = "en-US"): string {
  return Math.round(n).toLocaleString(locale);
}

export type DisplayCurrency = Currency | "BRL";

/** Convert estimates from USD without changing amounts recorded in the ledger. */
export function usdToDisplayMoney(usd: number, currency: DisplayCurrency, usdRate: number): number {
  return currency === "USD" ? usd : usd * usdRate;
}

export function fmtDisplayMoney(amount: number, currency: DisplayCurrency, locale: "en" | "pt-BR"): string {
  if (locale === "en" && currency !== "BRL") return fmtMoney(amount, currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
