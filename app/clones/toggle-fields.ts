// Shared constant + type for the clone feature-toggle allowlist. Kept OUT of
// actions.ts because a "use server" module may only export async functions
// (same reason app/feedback/shared.ts exists separately from feedback/actions.ts).

// CLONE_TOGGLE_FIELDS is the hardcoded allowlist used by setCloneToggle
// (app/clones/actions.ts) and by the /ai assistant's write tools
// (app/api/ai-assistant/write-tools.ts) — the exact same independent,
// non-money boolean columns already cleared for the assistant to READ (see
// ALLOWLIST.clones in app/api/ai-assistant/tools.ts).
export const CLONE_TOGGLE_FIELDS = [
  "photos_enabled",
  "videos_enabled",
  "bundles_enabled",
  "voice_enabled",
  "video_vision_enabled",
  "tips_enabled",
  "charge_messages",
  "live_captions_enabled",
  "reactions_enabled",
  "read_receipts_enabled",
  "message_effects_enabled",
  "ai_disclosure",
  // Migration 116. The strict minor gate: a fan stating he is under 18 or at
  // high school is blocked instantly, in any context.
  "strict_minor_gate",
  "emojis_enabled",
  "discounts_enabled",
  // subscriptions_enabled deliberately NOT listed: VIP/recurring Star
  // subscriptions and their UI were removed from the dashboard on 2026-07-29
  // (see the note in app/clones/actions.ts's rowFromForm). The operator does
  // not want subscriptions at all, so this toggle allowlist (used by both
  // setCloneToggle and the /ai assistant's write tools) must not be able to
  // flip it back on. The column stays in the DB and the bot still reads it;
  // only the ability to write it through this generic toggle path is removed.
  "smart_paywall_enabled",
  // Migration 097. Combined reactions/message-effects master switch, already
  // live and now surfaced to the /ai assistant's write tools too.
  "realism_effects_enabled",
  // Migration 098. Strict-onboarding-steps gate. Plain boolean, same shape as
  // every other entry here.
  "strict_onboarding_steps",
] as const;
export type CloneToggleField = (typeof CLONE_TOGGLE_FIELDS)[number];

// CLONE_DIAL_FIELDS is the hardcoded allowlist for the tone/behavior "dial"
// columns (components/clone/ConfigSections.tsx's SEG-driven Segmented
// controls) — used by setCloneDial (app/clones/actions.ts) and the /ai
// assistant's write tools (app/api/ai-assistant/write-tools.ts). Every dial
// here is a text/enum column with a small fixed set of legal values (there is
// no numeric range on this schema — these are enum steps, not integers), so
// each entry is the exact allowed-value list, taken straight from ConfigSections
// SEG and actions.ts's HEAT_LEVELS/PUSH_LEVELS/TONE_LEVELS. A value outside its
// list is rejected, never clamped to the nearest step.
//
// Deliberately EXCLUDES anything price/discount/tier-cap/money related, even
// though it's numeric elsewhere in this schema (starting_credits,
// credit_pack_price_stars, discount_max_*, subscription_tiers) — those never
// belong in an AI-writable allowlist. Also excludes tip_push_level: unlike the
// other dials it is nullable and "" means "inherit push_level", not a plain
// enum step, and that extra null-handling isn't worth it for a first cut.
export const CLONE_DIAL_FIELDS = {
  sexual_level: ["off", "mild", "medium", "explicit", "max", "low", "high"],
  nsfw_level: ["off", "mild", "medium", "explicit", "max", "low", "high"],
  push_level: ["none", "low", "medium", "high", "relentless"],
  warmth_level: ["off", "low", "medium", "high", "max"],
  curiosity_level: ["off", "low", "medium", "high", "max"],
  playfulness_level: ["off", "low", "medium", "high", "max"],
  attentiveness_level: ["off", "low", "medium", "high", "max"],
  emoji_amount: ["low", "medium", "high"],
} as const satisfies Record<string, readonly string[]>;
export type CloneDialField = keyof typeof CLONE_DIAL_FIELDS;
export const CLONE_DIAL_FIELD_NAMES = Object.keys(CLONE_DIAL_FIELDS) as CloneDialField[];
