"use client";

// Complex, repeated config editors shared by Configure (ConfigSections) and the
// New-clone defaults template (CloneDefaultsForm), so the two never drift. Each
// takes the shared cfg/set from useCloneConfig and renders its own hidden input
// carrying the money-safe JSON the server actions parse.

import { CATEGORY_LABELS, DEFAULT_CATEGORY_PRICING, PRICING_CATEGORIES } from "@/lib/pricing";
import { DEFAULT_SPOIL_OPTIONS, DEFAULT_SUBSCRIPTION_TIERS, SubCard, inputCls } from "./fields";
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
            PRICING_CATEGORIES.map((k) => [k, Math.max(0, Math.round(Number(cfg.categoryPricing[k]) || 0))]),
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
                min={0}
                value={cfg.categoryPricing[k] ?? 0}
                onChange={(e) => set("categoryPricing", (prev) => ({ ...prev, [k]: Number(e.target.value) }))}
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

// The three boolean perks, labelled by what the runtime actually does with them.
// `priority` shortens the fan's human-feel reply wait (applyPriorityWait in
// bot/src/services/subscriptions.ts) on top of a prompt line. `exclusive` is
// prompt/tone only: nothing in the bot selects media on it, and no photo, video
// or bundle carries an "exclusive" flag, so it must never be sold as content.
// `unlimited` is enforced outright (hasUnlimitedChat).
const TIER_PERKS = [
  {
    key: "priority" as const,
    label: "Faster replies",
    hint: "She waits a lot less before answering him than she does for everyone else on this clone. Real, not just tone.",
  },
  {
    key: "exclusive" as const,
    label: "Insider tone",
    hint: "She talks to him like an insider who gets the behind-the-scenes side of her. Tone only. It does not unlock any separate or exclusive media.",
  },
  {
    key: "unlimited" as const,
    label: "Unlimited",
    hint: "He is never metered and never hits the paywall while his subscription is active.",
  },
];

// ── VIP subscription tiers ────────────────────────────────────────────────────
// Renders the hidden `subscription_tiers` input (always, so it submits even when
// disabled — matching prior Configure behavior) + the tier editor when enabled.
export function SubscriptionTiersEditor({ cfg, set }: { cfg: CloneConfigState; set: SetConfig }) {
  return (
    <>
      <input
        type="hidden"
        name="subscription_tiers"
        value={JSON.stringify(
          cfg.subscriptionTiers
            .map((t) => ({
              name: (t.name ?? "").trim(),
              price_stars: Math.max(0, Math.round(Number(t.price_stars) || 0)),
              monthly_credits: Math.max(0, Math.round(Number(t.monthly_credits) || 0)),
              priority: !!t.priority,
              exclusive: !!t.exclusive,
              unlimited: !!t.unlimited,
              discount_boost: Math.min(100, Math.max(0, Math.round(Number(t.discount_boost) || 0))),
            }))
            .filter((t) => t.name && t.price_stars >= 1),
        )}
      />
      {cfg.subscriptionsEnabled && (
        <SubCard>
          <p
            className="mb-1.5 text-[11px] text-muted"
            title="Perks: monthly credits (messages granted each period), faster replies (she waits a lot less before answering him), insider tone (she treats him as an insider, tone only, it does not unlock any separate content), unlimited (never runs out of messages), discount boost (unlocks a bigger share of your discount caps for him)."
          >
            Each tier = monthly ⭐ price + perks: <b>credits</b>, <b>faster replies</b>, <b>insider tone</b>, <b>unlimited</b>, <b>discount boost</b>. ⓘ
          </p>
          <div className="grid items-start gap-2 lg:grid-cols-2">
            {cfg.subscriptionTiers.map((t, i) => (
              <div key={i} className="rounded-lg border border-line bg-panel p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    value={t.name}
                    onChange={(e) => set("subscriptionTiers", (prev) => prev.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                    placeholder="Tier name (e.g. VIP)"
                    className={inputCls + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => set("subscriptionTiers", (prev) => prev.filter((_, j) => j !== i))}
                    className="rounded-md border border-crit/30 px-2 py-1 text-xs text-crit transition hover:bg-crit/10 dark:text-crit"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Price ⭐ / month</span>
                    <input
                      type="number"
                      value={t.price_stars}
                      onChange={(e) => set("subscriptionTiers", (prev) => prev.map((p, j) => (j === i ? { ...p, price_stars: Number(e.target.value) } : p)))}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Monthly credits</span>
                    <input
                      type="number"
                      value={t.monthly_credits}
                      onChange={(e) => set("subscriptionTiers", (prev) => prev.map((p, j) => (j === i ? { ...p, monthly_credits: Number(e.target.value) } : p)))}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Discount boost %</span>
                    <input
                      type="number"
                      value={t.discount_boost}
                      onChange={(e) => set("subscriptionTiers", (prev) => prev.map((p, j) => (j === i ? { ...p, discount_boost: Number(e.target.value) } : p)))}
                      className={inputCls}
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  {/* Labels say what each perk ACTUALLY does. "priority" now
                      genuinely shortens his reply wait in the bot; "exclusive"
                      is tone only (there is no exclusive-media flag for any code
                      to select on), so it is labelled as tone, not as content. */}
                  {TIER_PERKS.map(({ key, label, hint }) => (
                    <label key={key} title={hint} className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                      <input
                        type="checkbox"
                        checked={!!t[key]}
                        onChange={(e) => set("subscriptionTiers", (prev) => prev.map((p, j) => (j === i ? { ...p, [key]: e.target.checked } : p)))}
                        className="h-4 w-4 rounded border-line accent-good"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                set("subscriptionTiers", (prev) => [
                  ...prev,
                  { name: "", price_stars: 500, monthly_credits: 0, priority: false, exclusive: false, unlimited: false, discount_boost: 0 },
                ])
              }
              className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-bg"
            >
              + Add tier
            </button>
            <button
              type="button"
              onClick={() => set("subscriptionTiers", DEFAULT_SUBSCRIPTION_TIERS)}
              className="text-[11px] font-medium text-muted underline transition hover:text-ink"
            >
              Reset to default
            </button>
          </div>
        </SubCard>
      )}
    </>
  );
}
