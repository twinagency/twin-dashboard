"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AUD_PER_USD, type Currency } from "@/lib/money";

type Ctx = {
  currency: Currency;
  rate: number; // live USD→AUD
  setCurrency: (c: Currency) => void;
};

const CurrencyContext = createContext<Ctx>({
  currency: "AUD",
  rate: AUD_PER_USD,
  setCurrency: () => {},
});

export function useCurrency() {
  return useContext(CurrencyContext);
}

export default function CurrencyProvider({ children }: { children: React.ReactNode }) {
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
    <CurrencyContext.Provider value={{ currency, rate, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}
