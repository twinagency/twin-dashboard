"use client";

import { useCurrency } from "./CurrencyProvider";
import { useFlirtCreatorLocale } from "./FlirtCreatorLocale";
import type { DisplayCurrency } from "@/lib/money";

export function useCreatorCurrency() {
  const { locale } = useFlirtCreatorLocale();
  const { currency, rate, setCurrency, brlRate, brazilCurrency, setBrazilCurrency } = useCurrency();
  const brazilian = locale === "pt-BR";
  const preferred = brazilCurrency ?? "BRL";
  const displayed: DisplayCurrency = brazilian ? (preferred === "BRL" && !brlRate ? "USD" : preferred) : currency;
  return {
    currency: displayed,
    rate: displayed === "BRL" ? brlRate! : displayed === "AUD" ? rate : 1,
    audRate: rate,
    brlRate,
    setCurrency: (next: DisplayCurrency) => {
      if (brazilian) setBrazilCurrency(next);
      else if (next !== "BRL") setCurrency(next);
    },
  };
}
