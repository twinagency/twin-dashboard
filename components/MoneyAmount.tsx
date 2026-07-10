"use client";

import { useCurrency } from "./CurrencyProvider";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

// Renders just the money value of a star amount, in the currently selected
// currency. Reacts to the global USD/AUD toggle.
export default function MoneyAmount({
  stars,
  className,
}: {
  stars: number;
  className?: string;
}) {
  const { currency, rate } = useCurrency();
  return <span className={className}>{fmtMoney(starsToMoneyRate(stars, currency, rate), currency)}</span>;
}
