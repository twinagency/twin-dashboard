"use client";

import { useCurrency } from "@/components/CurrencyProvider";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

export default function TelegramSpendSummary({ stars, cloneId }: { stars: number; cloneId: string }) {
  const { currency, rate, rateFor } = useCurrency();
  return <strong title={`${stars.toLocaleString()} Telegram Stars`}>
    {fmtMoney(starsToMoneyRate(stars, currency, rate, rateFor(cloneId)), currency)} <small>{currency}</small>
  </strong>;
}
