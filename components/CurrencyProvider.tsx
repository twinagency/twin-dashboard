"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AUD_PER_USD, type Currency, type DisplayCurrency } from "@/lib/money";

type Ctx = {
  currency: Currency;
  rate: number; // live USD→AUD
  setCurrency: (c: Currency) => void;
  brlRate: number | null;
  brazilCurrency: DisplayCurrency | null;
  setBrazilCurrency: (c: DisplayCurrency) => void;
};

const CurrencyContext = createContext<Ctx>({
  currency: "AUD",
  rate: AUD_PER_USD,
  setCurrency: () => {},
  brlRate: null,
  brazilCurrency: null,
  setBrazilCurrency: () => {},
});

export function useCurrency() {
  return useContext(CurrencyContext);
}

export default function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("AUD"); // AUD default
  const [rate, setRate] = useState(AUD_PER_USD);
  const [brlRate, setBrlRate] = useState<number | null>(null);
  const [brazilCurrency, setBrazilCurrencyState] = useState<DisplayCurrency | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("currency");
    if (saved === "USD" || saved === "AUD") setCurrencyState(saved);
    const savedBrazil = localStorage.getItem("flirt-pt-br-currency");
    if (savedBrazil === "BRL" || savedBrazil === "USD" || savedBrazil === "AUD") setBrazilCurrencyState(savedBrazil);
    fetch("/api/fx")
      .then((r) => r.json())
      .then((data) => {
        if (Number.isFinite(data.usd_to_aud) && data.usd_to_aud > 0) setRate(data.usd_to_aud);
        if (Number.isFinite(data.usd_to_brl) && data.usd_to_brl > 0) setBrlRate(data.usd_to_brl);
      })
      .catch(() => {});
  }, []);

  function setCurrency(c: Currency) {
    setCurrencyState(c);
    localStorage.setItem("currency", c);
  }

  function setBrazilCurrency(c: DisplayCurrency) {
    setBrazilCurrencyState(c);
    localStorage.setItem("flirt-pt-br-currency", c);
  }

  return (
    <CurrencyContext.Provider value={{ currency, rate, setCurrency, brlRate, brazilCurrency, setBrazilCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}
