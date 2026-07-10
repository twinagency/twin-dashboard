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
  return (
    <span className={className}>
      {stars}⭐ <span className={moneyClassName ?? "text-gray-400 dark:text-neutral-500"}>({money})</span>
    </span>
  );
}
