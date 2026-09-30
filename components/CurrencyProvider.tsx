"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AUD_PER_USD, STAR_USD, type Currency } from "@/lib/money";

type Ctx = {
  currency: Currency;
  rate: number; // live USD→AUD
  usdPerStar: number; // this account's star→USD rate (default 0.013)
  setCurrency: (c: Currency) => void;
};

const CurrencyContext = createContext<Ctx>({
  currency: "AUD",
  rate: AUD_PER_USD,
  usdPerStar: STAR_USD,
  setCurrency: () => {},
});

export function useCurrency() {
  return useContext(CurrencyContext);
}

export default function CurrencyProvider({ children, usdPerStar = STAR_USD }: { children: React.ReactNode; usdPerStar?: number }) {
  const [currency, setCurrencyState] = useState<Currency>("AUD"); // AUD default
  const [rate, setRate] = useState(AUD_PER_USD);

  useEffect(() => {
    const saved = localStorage.getItem("currency");
    if (saved === "USD" || saved === "AUD") setCurrencyState(saved);
    fetch("/api/fx")
      .then((r) => r.json())
      .then((d) => d.usd_to_aud && setRate(Number(d.usd_to_aud)))
      .catch(() => {});
  }, []);

  function setCurrency(c: Currency) {
    setCurrencyState(c);
    localStorage.setItem("currency", c);
  }

  return (
    <CurrencyContext.Provider value={{ currency, rate, usdPerStar, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}
