"use client";

import { useCurrency } from "./CurrencyProvider";
import type { Currency } from "@/lib/money";

export default function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1 text-xs dark:bg-neutral-800">
      {(["AUD", "USD"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          className={
            "rounded-md px-3 py-1 font-semibold transition " +
            (currency === c
              ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
              : "text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white")
          }
        >
          ${c}
        </button>
      ))}
    </div>
  );
}
