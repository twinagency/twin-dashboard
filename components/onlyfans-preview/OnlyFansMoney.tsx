"use client";

import { useCurrency } from "@/components/CurrencyProvider";
import { formatRecordedMoney } from "@/lib/onlyfans/workspace";

/** Display conversion only. Recorded amounts and sale prices stay in their source currency. */
export default function OnlyFansMoney({ cents, sourceCurrency = "USD", whole = false }: { cents: number; sourceCurrency?: string; whole?: boolean }) {
  const { currency, rate } = useCurrency();
  const convertible = sourceCurrency === "USD" || sourceCurrency === "AUD";
  const converted = sourceCurrency === currency ? cents
    : sourceCurrency === "USD" ? Math.round(cents * rate)
    : sourceCurrency === "AUD" ? Math.round(cents / rate) : cents;
  const amount = convertible ? converted : cents;
  const code = convertible ? currency : sourceCurrency;
  const display = whole
    ? new Intl.NumberFormat("en-AU", { style: "currency", currency: code, currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount / 100)
    : formatRecordedMoney(amount, code);
  return <span className="money-value">{display}</span>;
}

export function OnlyFansCurrencyLabel() {
  const { currency } = useCurrency();
  return <span>{currency}</span>;
}
