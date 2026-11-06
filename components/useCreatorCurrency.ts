"use client";

import { useCurrency } from "./CurrencyProvider";
import { useFlirtCreatorLocale } from "./FlirtCreatorLocale";
import { STAR_USD, type DisplayCurrency } from "@/lib/money";

export function useCreatorCurrency() {
  const { locale } = useFlirtCreatorLocale();
  const { currency, rate, setCurrency, brlRate, brazilCurrency, setBrazilCurrency, usdPerStar = STAR_USD } = useCurrency() as ReturnType<typeof useCurrency> & { usdPerStar?: number };
  const brazilian = locale === "pt-BR";
  const preferred = brazilCurrency ?? "BRL";
  const displayed: DisplayCurrency = brazilian ? (preferred === "BRL" && !brlRate ? "USD" : preferred) : currency;
  return {
    currency: displayed,
    rate: displayed === "BRL" ? brlRate ?? 1 : displayed === "AUD" ? rate : 1,
    audRate: rate,
    usdPerStar,
    brlRate,
    setCurrency: (next: DisplayCurrency) => {
      if (brazilian) setBrazilCurrency(next);
      else if (next !== "BRL") setCurrency(next);
    },
  };
}
