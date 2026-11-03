"use client";

import { useCurrency } from "./CurrencyProvider";
import type { Currency } from "@/lib/money";

// compact: one button showing the active currency; click flips to the other.
export default function CurrencyToggle({ compact = false }: { compact?: boolean }) {
  const { currency, setCurrency } = useCurrency();
  if (compact) {
    const next = currency === "AUD" ? "USD" : "AUD";
    return (
      <button
        type="button"
        onClick={() => setCurrency(next as Currency)}
        title={`Showing {currency} - click for ${next}`}
        aria-label={`Display currency: ${currency}. Switch to ${next}`}
        className="rounded-full bg-muted/10 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-muted/15"
      >
        ${currency}
      </button>
    );
  }
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted/10 p-1 text-xs">
      {(["AUD", "USD"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          className={
            "rounded-md px-3 py-1 font-semibold transition " +
            (currency === c ? "bg-muted/15 text-ink shadow-sm" : "text-muted hover:text-ink")
          }
        >
          {c}
        </button>
      ))}
    </div>
  );
}
