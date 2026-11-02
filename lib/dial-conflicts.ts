import type { CloneConfigState } from "@/components/clone/useCloneConfig";

// ── Shared dial-conflict rules ────────────────────────────────────────────────
// Single source of truth for "these two live field values fight each other."
// Previously these six rules were defined inline in ConfigSections.tsx as
// arguments to useDialConflict(); they're extracted here, VERBATIM (same
// `when`/`text`/`detail`), so:
//   1. ConfigSections.tsx can import them by id instead of redefining them
//      (zero change in rendered behavior), and
//   2. Twin (the /ai assistant, see app/api/ai-assistant/tools.ts) can run the
//      exact same checks server-side via activeDialConflicts() below, instead
//      of guessing at contradictions in prose.
// `when` only reads the handful of CloneConfigState fields the six rules
// actually use (Pick, not the whole shape), so the server side (which reads a
// raw allowlisted DB row, not the full client config state) can build just
// that subset instead of faking an entire CloneConfigState.
export type DialConflictCfg = Pick<
  CloneConfigState,
  | "silenceFallbackMode"
  | "nsfwLevel"
  | "sexualLevel"
  | "discountsEnabled"
  | "discMaxPhoto"
  | "discMaxVideo"
  | "discMaxBundle"
  | "discMaxCredits"
  | "bubbleDelayMinMs"
  | "bubbleDelayMaxMs"
  | "discountAbsoluteMaxPct"
  | "spendTierWhaleStars"
  | "spendTierHighStars"
  | "spendTierMidStars"
>;

export interface DialConflictRule {
  id: string;
  when: (cfg: DialConflictCfg) => boolean;
  text: string;
  detail?: string;
}

export const DIAL_CONFLICT_RULES: DialConflictRule[] = [
  {
    id: "silence-nsfw-max",
    when: (c) => c.silenceFallbackMode === "off" && (c.nsfwLevel === "max" || c.sexualLevel === "max"),
    text: "She's dialled to Max NSFW/Flirtiness and set to say nothing on failure.",
    detail:
      "A model refusal counts as a failed try, not just an outage, so this combination is the one most likely to leave a fan on read mid-conversation with zero message. Consider the recovery line (On) instead of silence for a clone running this hot.",
  },
  {
    id: "discount-caps-zero",
    when: (c) =>
      c.discountsEnabled &&
      c.discMaxPhoto === 0 &&
      c.discMaxVideo === 0 &&
      c.discMaxBundle === 0 &&
      c.discMaxCredits === 0,
    text: "Discounts are enabled but every cap is 0%, so she can never actually discount anything.",
    detail:
      "0 on a cap means 'never discount that type' (see the hint above). With all four at 0 the enabled switch is a no-op: raise at least one cap or turn discounts back off.",
  },
  {
    id: "bubble-delay-range",
    when: (c) => c.bubbleDelayMaxMs < c.bubbleDelayMinMs,
    text: "Bubble delay maximum is set lower than the minimum.",
    detail:
      "The bot picks a random point between these two on every split reply, so a max below the min is not a valid range. Raise the maximum or lower the minimum.",
  },
  {
    id: "silence-fallback-cooldown-inert",
    when: (c) => c.silenceFallbackMode === "off",
    text: "The recovery-line cooldown below does nothing while 'If she cannot generate a reply' is set to Say nothing.",
    detail:
      "This cooldown only paces how often the recovery line itself can repeat. With the recovery line switched off there is no line to pace, so the cooldown is currently a no-op. Switch that dial back to 'Send a recovery line' for it to matter.",
  },
  {
    id: "discount-absolute-max-below-cap",
    when: (c) =>
      c.discountsEnabled &&
      c.discountAbsoluteMaxPct < Math.max(c.discMaxPhoto, c.discMaxVideo, c.discMaxBundle, c.discMaxCredits),
    text: "The absolute discount ceiling is set lower than one of the per-category caps above.",
    detail:
      "Every discount is clamped to this ceiling no matter what a category's own cap allows, so in this state the ceiling is silently overriding that category's cap. Raise the ceiling to match, or lower the category cap instead if the ceiling is the intended limit.",
  },
  {
    id: "spend-tier-order",
    when: (c) => c.spendTierWhaleStars <= c.spendTierHighStars || c.spendTierHighStars <= c.spendTierMidStars,
    text: "Spend-tier thresholds must be strictly descending (whale > high > mid).",
    detail:
      "A fan's spend tier is decided by comparing his total spend against these three in order. If whale isn't above high, or high isn't above mid, the tiering can put a fan in the wrong bucket, or no bucket at all. Raise the higher threshold or lower the lower one so whale > high > mid.",
  },
];

// Every rule currently triggered by this cfg, in DIAL_CONFLICT_RULES order.
// Empty array is a valid, common answer (nothing conflicts), not an error.
export function activeDialConflicts(cfg: DialConflictCfg): DialConflictRule[] {
  return DIAL_CONFLICT_RULES.filter((r) => r.when(cfg));
}
