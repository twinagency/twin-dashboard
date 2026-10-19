"use client";

import { useCurrency } from "./CurrencyProvider";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

// Renders just the money value of a star amount, in the currently selected
// currency. Reacts to the global USD/AUD toggle.
export default function MoneyAmount({
  stars,
  cloneId,
  className,
}: {
  stars: number;
  /** The girl these stars belong to, so a per-girl rate applies. */
  cloneId?: string | null;
  className?: string;
}) {
  const { currency, rate, rateFor } = useCurrency();
  const usdPerStar = rateFor(cloneId);
  // Money rule: every dollar figure renders in the green `good` token, never accent blue.
  return <span className={className ?? "text-good"}>{fmtMoney(starsToMoneyRate(stars, currency, rate, usdPerStar), currency)}</span>;
}
