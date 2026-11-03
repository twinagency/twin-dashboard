"use client";

import { useCurrency } from "@/components/CurrencyProvider";
import { formatRecordedMoney } from "@/lib/onlyfans/workspace";

/** Display conversion only. Recorded amounts and sale prices stay in their source currency. */
export default function OnlyFansMoney({ cents, sourceCurrency = "USD" }: { cents: number; sourceCurrency?: string }) {
  const { currency, rate } = useCurrency();
  const convertible = sourceCurrency === "USD" || sourceCurrency === "AUD";
  const converted = sourceCurrency === currency ? cents
    : sourceCurrency === "USD" ? Math.round(cents * rate)
    : sourceCurrency === "AUD" ? Math.round(cents / rate) : cents;
  return <span className="money-value">{formatRecordedMoney(convertible ? converted : cents, convertible ? currency : sourceCurrency)}</span>;
}

export function OnlyFansCurrencyLabel() {
  const { currency } = useCurrency();
  return <span>{currency}</span>;
}
