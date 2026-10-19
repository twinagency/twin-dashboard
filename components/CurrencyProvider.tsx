"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AUD_PER_USD, STAR_USD, type Currency } from "@/lib/money";

type Ctx = {
  currency: Currency;
  rate: number; // live USD→AUD
  usdPerStar: number; // this account's star→USD rate (default 0.013)
  // Girls on this login with their own rate (agency logins only; empty otherwise).
  cloneRates: Record<string, number>;
  // Rate for a whole-login total: the active girl's rate, or the all-time blend.
  fleetUsdPerStar: number;
  rateFor: (cloneId?: string | null) => number;
  setCurrency: (c: Currency) => void;
};

const CurrencyContext = createContext<Ctx>({
  currency: "AUD",
  rate: AUD_PER_USD,
  usdPerStar: STAR_USD,
  cloneRates: {},
  fleetUsdPerStar: STAR_USD,
  rateFor: () => STAR_USD,
  setCurrency: () => {},
});

export function useCurrency() {
  return useContext(CurrencyContext);
}

const NO_RATES: Record<string, number> = {};

export default function CurrencyProvider({ children, usdPerStar = STAR_USD, cloneRates = NO_RATES, fleetUsdPerStar }: { children: React.ReactNode; usdPerStar?: number; cloneRates?: Record<string, number>; fleetUsdPerStar?: number }) {
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
    <CurrencyContext.Provider value={{ currency, rate, usdPerStar, cloneRates, fleetUsdPerStar: fleetUsdPerStar ?? usdPerStar, rateFor: (id) => (id && cloneRates[id]) || usdPerStar, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}
