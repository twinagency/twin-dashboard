"use client";

import { useCurrency } from "./CurrencyProvider";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

// Renders a star amount with its money value next to it, e.g. "199⭐ (A$3.88)".
// Reacts to the global USD/AUD toggle.
export default function StarAmount({
  stars,
  className,
  moneyClassName,
}: {
  stars: number;
  className?: string;
  moneyClassName?: string;
}) {
  const { currency, rate } = useCurrency();
  const money = fmtMoney(starsToMoneyRate(stars, currency, rate), currency);
  // Money rule: the whole figure (stars + its $ value) renders in the green `good` token.
  return (
    <span className={className ?? "text-good"}>
      {stars}⭐ <span className={moneyClassName ?? "text-good/70"}>({money})</span>
    </span>
  );
}
