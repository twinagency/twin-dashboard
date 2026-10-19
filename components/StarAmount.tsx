"use client";

import { useCurrency } from "./CurrencyProvider";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

// Renders a star amount with its money value next to it, e.g. "199⭐ (A$3.88)".
// Reacts to the global USD/AUD toggle.
export default function StarAmount({
  stars,
  cloneId,
  className,
  moneyClassName,
}: {
  stars: number;
  /** The girl these stars belong to, so a per-girl rate applies. */
  cloneId?: string | null;
  className?: string;
  moneyClassName?: string;
}) {
  const { currency, rate, rateFor } = useCurrency();
  const usdPerStar = rateFor(cloneId);
  // 0 stars is always free, everywhere this renders. Matches the bot runtime,
  // which only ever sends a media item unlocked at a price of 0 (flows/media.ts).
  if (stars <= 0) {
    return <span className={className ?? "text-good"}>Free</span>;
  }
  const money = fmtMoney(starsToMoneyRate(stars, currency, rate, usdPerStar), currency);
  // Money rule: the whole figure (stars + its $ value) renders in the green `good` token.
  return (
    <span className={className ?? "text-good"}>
      {stars}⭐ <span className={moneyClassName ?? "text-good/70"}>({money})</span>
    </span>
  );
}
