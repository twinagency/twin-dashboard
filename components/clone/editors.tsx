"use client";

// Complex, repeated config editors shared by Configure (ConfigSections) and the
// New-clone defaults template (CloneDefaultsForm), so the two never drift. Each
// takes the shared cfg/set from useCloneConfig and renders its own hidden input
// carrying the money-safe JSON the server actions parse.

import { CATEGORY_LABELS, DEFAULT_CATEGORY_PRICING, MIN_PAID_MEDIA_PRICE_STARS, PRICING_CATEGORIES } from "@/lib/pricing";
import { DEFAULT_SPOIL_OPTIONS, FieldLabel, SubCard, inputCls } from "./fields";
import { V2_SPOIL_HINT, V2_SPOIL_LABEL } from "@/lib/v2-tips";
import type { CloneConfigState, SetConfig } from "./useCloneConfig";

// ── Category pricing (⭐ price per content type) ───────────────────────────────
// Renders the hidden `category_pricing` input + the editor grid. Always mounted.
export function CategoryPricingEditor({ cfg, set }: { cfg: CloneConfigState; set: SetConfig }) {
  return (
    <>
      <input
        type="hidden"
        name="category_pricing"
        value={JSON.stringify(
          Object.fromEntries(
            PRICING_CATEGORIES.map((k) => [k, Math.max(MIN_PAID_MEDIA_PRICE_STARS, Math.round(Number(cfg.categoryPricing[k]) || MIN_PAID_MEDIA_PRICE_STARS))]),
          ),
        )}
      />
      <SubCard>
        {/* Label stacked over a narrow input, 4 across - as two wide rows this
            was 6 rows tall and the single biggest thing on the money tab. */}
        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-4">
          {PRICING_CATEGORIES.map((k) => (
            <label key={k} className="grid gap-0.5">
              <span className="truncate text-[10px] leading-tight text-muted" title={CATEGORY_LABELS[k] ?? k}>
                {CATEGORY_LABELS[k] ?? k}
              </span>
              <input
                type="number"
                min={MIN_PAID_MEDIA_PRICE_STARS}
                step={1}
                value={cfg.categoryPricing[k] ?? MIN_PAID_MEDIA_PRICE_STARS}
                onChange={(e) => set("categoryPricing", (prev) => ({
                  ...prev,
                  [k]: Math.max(MIN_PAID_MEDIA_PRICE_STARS, Math.round(Number(e.target.value) || MIN_PAID_MEDIA_PRICE_STARS)),
                }))}
                className={inputCls + " px-2 py-1 text-center tabular-nums"}
              />
            </label>
          ))}
        </div>
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => set("categoryPricing", { ...DEFAULT_CATEGORY_PRICING })}
            className="text-[11px] font-medium text-muted underline transition hover:text-ink"
          >
            Reset to default
          </button>
        </div>
      </SubCard>
    </>
  );
}

// ── Spoil / tip menu buttons ──────────────────────────────────────────────────
// Renders the hidden `spoil_options` input + the button editor. Parent gates this
// behind `cfg.tips` (so the hidden input only submits when tips are on).
export function SpoilMenuEditor({ cfg, set }: { cfg: CloneConfigState; set: SetConfig }) {
  return (
    <SubCard>
      {cfg.engineV2 && <FieldLabel label={V2_SPOIL_LABEL} hint={V2_SPOIL_HINT} />}
      <input type="hidden" name="spoil_options" value={JSON.stringify(cfg.spoilOptions.filter((o) => o.stars >= 1))} />
      <div className="grid gap-1.5">
        {cfg.spoilOptions.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="number"
              value={o.stars}
              onChange={(e) => set("spoilOptions", (prev) => prev.map((p, j) => (j === i ? { ...p, stars: Number(e.target.value) } : p)))}
              placeholder="stars"
              className={inputCls.replace("w-full", "") + " w-20 shrink-0 px-2 py-1 tabular-nums"}
            />
            <input
              value={o.label}
              onChange={(e) => set("spoilOptions", (prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
              placeholder={`button text (blank = ⭐ ${o.stars || "amount"})`}
              className={inputCls + " flex-1 px-2 py-1"}
            />
            <button
              type="button"
              onClick={() => set("spoilOptions", (prev) => prev.filter((_, j) => j !== i))}
              className="rounded-md border border-crit/30 px-2 py-1 text-xs text-crit transition hover:bg-crit/10 dark:text-crit"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => set("spoilOptions", (prev) => [...prev, { stars: 1000, label: "" }])}
          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-bg"
        >
          + Add button
        </button>
        <button
          type="button"
          onClick={() => set("spoilOptions", DEFAULT_SPOIL_OPTIONS)}
          className="text-[11px] font-medium text-muted underline transition hover:text-ink"
        >
          Reset to default
        </button>
      </div>
    </SubCard>
  );
}

