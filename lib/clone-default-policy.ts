import type { Clone } from "./types";
import { DEFAULT_CATEGORY_PRICING, normalizeSafeCategoryGuide } from "./pricing";

// Fleet defaults are deliberately limited to operational configuration. These
// fields shape a creator's voice/personality and must remain per-creator even if
// an old app_settings blob still contains them.
export const PERSONALITY_DEFAULT_FIELDS = new Set<string>([
  "sexual_level",
  "nsfw_level",
  "warmth_level",
  "curiosity_level",
  "playfulness_level",
  "attentiveness_level",
  "emojis_enabled",
  "emoji_amount",
  "emoji_allowlist",
  "welcome_instruction",
  "paywall_instruction",
  "paywall_default_message",
  "paywall_button_label",
  "paywall_prime_instruction",
  "paywall_resume_instruction",
  "paywall_resume_media_id",
]);

export const OPERATIONAL_DEFAULT_TOGGLES = [
  "smart_split", "photos_enabled", "videos_enabled", "video_vision_enabled", "bundles_enabled",
  "voice_enabled", "charge_messages", "tips_enabled", "live_captions_enabled", "thank_you_enabled",
  "discounts_enabled", "drip_enabled",
  "reactions_enabled", "read_receipts_enabled", "message_effects_enabled", "ai_disclosure",
  "smart_paywall_enabled", "paywall_as_voice", "voice_speaker_boost",
  "paywall_prime_enabled", "paywall_prime_as_voice", "paywall_resume_enabled", "paywall_resume_free",
  "realism_effects_enabled", "strict_onboarding_steps",
] as const;

export const OPERATIONAL_DEFAULT_SELECTS = [
  "ai_mode", "push_level", "media_caption_mode",
  "price_guard_mode", "silence_fallback_mode", "variety_guard",
] as const;

export const OPERATIONAL_DEFAULT_NUMBERS = [
  "starting_credits", "credit_pack_size", "credit_pack_price_stars",
  "tip_credits_per_100_stars",
  "discount_max_photo", "discount_max_video", "discount_max_bundle", "discount_max_credits",
  "followup_after_minutes",
  "response_wait_min", "response_wait_max", "memory_window",
  "voice_stability", "voice_similarity", "voice_style", "voice_speed",
  "paywall_prime_before",
  "discount_level_light_pct", "discount_level_medium_pct", "discount_level_max_pct",
  "discount_tier_share_none_pct", "discount_tier_share_low_pct", "discount_tier_share_mid_pct",
  "discount_tier_share_high_pct", "discount_tier_share_whale_pct",
  "discount_absolute_max_pct", "tip_max_stars",
  "bubble_delay_min_ms", "bubble_delay_max_ms", "llm_max_tries",
] as const;

export const OPERATIONAL_DEFAULT_JSON = ["category_pricing", "spoil_options"] as const;

export const OPERATIONAL_DEFAULT_MODELS = [
  "eleven_model",
  "text_model", "voice_model", "media_model", "routing_model",
  "photo_reply_model", "vision_model", "voice_enhance_model",
] as const;

const OPERATIONAL_DEFAULT_FIELD_SET = new Set<string>([
  ...OPERATIONAL_DEFAULT_TOGGLES,
  ...OPERATIONAL_DEFAULT_SELECTS,
  ...OPERATIONAL_DEFAULT_NUMBERS,
  ...OPERATIONAL_DEFAULT_JSON,
  ...OPERATIONAL_DEFAULT_MODELS,
]);

const SELECT_VALUES: Record<(typeof OPERATIONAL_DEFAULT_SELECTS)[number], readonly string[]> = {
  ai_mode: ["classic", "smart"],
  push_level: ["none", "low", "medium", "high", "relentless"],
  media_caption_mode: ["inline", "none", "separate"],
  price_guard_mode: ["block", "log", "off"],
  silence_fallback_mode: ["on", "off"],
  variety_guard: ["normal", "strict", "off"],
};

type NumberRule = { min: number; max: number; integer: boolean };

// These ranges mirror the controls and database constraints. Fields without a
// database upper bound still get a conservative operational ceiling so a
// malformed request cannot store Infinity-sized waits, credits or prices.
const NUMBER_RULES: Record<(typeof OPERATIONAL_DEFAULT_NUMBERS)[number], NumberRule> = {
  starting_credits: { min: 0, max: 100_000, integer: true },
  credit_pack_size: { min: 1, max: 100_000, integer: true },
  credit_pack_price_stars: { min: 1, max: 1_000_000, integer: true },
  tip_credits_per_100_stars: { min: 0, max: 100_000, integer: true },
  discount_max_photo: { min: 0, max: 90, integer: true },
  discount_max_video: { min: 0, max: 90, integer: true },
  discount_max_bundle: { min: 0, max: 90, integer: true },
  discount_max_credits: { min: 0, max: 90, integer: true },
  followup_after_minutes: { min: 0, max: 1_440, integer: true },
  response_wait_min: { min: 0, max: 60, integer: true },
  response_wait_max: { min: 0, max: 60, integer: true },
  memory_window: { min: 1, max: 100, integer: true },
  voice_stability: { min: 0, max: 1, integer: false },
  voice_similarity: { min: 0, max: 1, integer: false },
  voice_style: { min: 0, max: 1, integer: false },
  voice_speed: { min: 0.5, max: 1.2, integer: false },
  paywall_prime_before: { min: 1, max: 100_000, integer: true },
  discount_level_light_pct: { min: 1, max: 100, integer: true },
  discount_level_medium_pct: { min: 1, max: 100, integer: true },
  discount_level_max_pct: { min: 1, max: 100, integer: true },
  discount_tier_share_none_pct: { min: 0, max: 100, integer: true },
  discount_tier_share_low_pct: { min: 0, max: 100, integer: true },
  discount_tier_share_mid_pct: { min: 0, max: 100, integer: true },
  discount_tier_share_high_pct: { min: 0, max: 100, integer: true },
  discount_tier_share_whale_pct: { min: 0, max: 100, integer: true },
  discount_absolute_max_pct: { min: 1, max: 100, integer: true },
  tip_max_stars: { min: 1, max: 1_000_000, integer: true },
  bubble_delay_min_ms: { min: 0, max: 5_000, integer: true },
  bubble_delay_max_ms: { min: 0, max: 5_000, integer: true },
  llm_max_tries: { min: 1, max: 5, integer: true },
};

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

export const BUILTIN_CLONE_DEFAULTS: Partial<Clone> = {
  // Canonical commercial baseline. Missing or malformed templates must not
  // silently create a 50-free / 50-message / 199-Star clone.
  starting_credits: 20,
  credit_pack_size: 30,
  credit_pack_price_stars: 299,
  category_pricing: { ...DEFAULT_CATEGORY_PRICING },
  videos_enabled: true,
  discount_max_photo: 15,
  discount_max_video: 20,
  discount_max_bundle: 25,
  discount_max_credits: 10,
  response_wait_min: 8,
  response_wait_max: 45,
  read_receipts_enabled: true,
};

export const DEFAULT_SPOIL_OPTIONS = [1000, 2500, 5000, 10000, 25000, 50000, 100000].map((stars) => ({ stars, label: "" }));

export const DEFAULT_MODELS: Record<(typeof OPERATIONAL_DEFAULT_MODELS)[number], string> = {
  eleven_model: "eleven_multilingual_v2", text_model: "x-ai/grok-4.20", voice_model: "deepseek/deepseek-v4-pro", vision_model: "qwen/qwen3-vl-235b-a22b-instruct",
  media_model: "mistralai/mistral-small-3.2-24b-instruct", routing_model: "qwen/qwen3-30b-a3b-instruct-2507", voice_enhance_model: "google/gemini-2.5-flash-lite",
  photo_reply_model: "qwen/qwen3-vl-32b-instruct",
};
// What /settings shows for a key the template lacks (mirrors useCloneConfig's `??`). Only use via effectiveCloneDefaults.
export const CLONE_DEFAULT_FALLBACKS: Partial<Clone> = {
  ai_mode: "classic", push_level: "medium", media_caption_mode: "inline", price_guard_mode: "block", silence_fallback_mode: "on", variety_guard: "normal",
  smart_split: true, photos_enabled: true, video_vision_enabled: true, bundles_enabled: true, voice_enabled: true,
  charge_messages: true, tips_enabled: false, live_captions_enabled: false, thank_you_enabled: true, discounts_enabled: false,
  drip_enabled: true, reactions_enabled: true, message_effects_enabled: true, ai_disclosure: false, smart_paywall_enabled: true,
  paywall_as_voice: false, voice_speaker_boost: true, paywall_prime_enabled: false, paywall_prime_as_voice: false,
  paywall_resume_enabled: false, paywall_resume_free: true, realism_effects_enabled: true, strict_onboarding_steps: true,
  tip_credits_per_100_stars: 0, followup_after_minutes: 0, memory_window: 24, voice_stability: 0.4, voice_similarity: 0.75,
  voice_style: 0.25, voice_speed: 0.95, paywall_prime_before: 3, discount_level_light_pct: 34, discount_level_medium_pct: 67,
  discount_level_max_pct: 100, discount_tier_share_none_pct: 50, discount_tier_share_low_pct: 60, discount_tier_share_mid_pct: 75,
  discount_tier_share_high_pct: 90, discount_tier_share_whale_pct: 100, discount_absolute_max_pct: 90, tip_max_stars: 100000,
  bubble_delay_min_ms: 600, bubble_delay_max_ms: 1400, llm_max_tries: 3, spoil_options: DEFAULT_SPOIL_OPTIONS, ...DEFAULT_MODELS,
};

// Fields a follower must receive together: a partial cascade could leave her min above the new max.
export const CLONE_DEFAULT_GROUPS: readonly (readonly string[])[] = [
  ["response_wait_min", "response_wait_max"], ["bubble_delay_min_ms", "bubble_delay_max_ms"],
  ["discount_level_light_pct", "discount_level_medium_pct", "discount_level_max_pct", "discount_tier_share_none_pct",
    "discount_tier_share_low_pct", "discount_tier_share_mid_pct", "discount_tier_share_high_pct", "discount_tier_share_whale_pct"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validNumber(value: unknown, rule: NumberRule): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && (!rule.integer || Number.isSafeInteger(value))
    && value >= rule.min
    && value <= rule.max;
}

function validModelId(value: unknown): value is string {
  return typeof value === "string" && MODEL_ID.test(value.trim());
}

function validSpoilOptions(value: unknown, tipMaxStars: number): value is { stars: number; label: string }[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return false;
  const seen = new Set<number>();
  for (const item of value) {
    if (!isRecord(item)) return false;
    const stars = item.stars;
    const label = item.label;
    if (typeof stars !== "number" || !Number.isSafeInteger(stars) || stars < 1 || stars > tipMaxStars || seen.has(stars)) return false;
    if (typeof label !== "string" || label.length > 80) return false;
    seen.add(stars);
  }
  return true;
}

function assertOrdered(values: Record<string, unknown>, keys: readonly string[], label: string): void {
  const present = keys.map((key) => values[key]);
  if (!present.every((value) => typeof value === "number")) return;
  for (let index = 1; index < present.length; index++) {
    if ((present[index] as number) < (present[index - 1] as number)) {
      throw new Error(`${label} must stay in ascending order`);
    }
  }
}

function assertRelationships(values: Record<string, unknown>): void {
  if (typeof values.response_wait_min === "number" && typeof values.response_wait_max === "number"
    && values.response_wait_min > values.response_wait_max) {
    throw new Error("Response minimum wait cannot exceed the maximum wait");
  }
  if (typeof values.bubble_delay_min_ms === "number" && typeof values.bubble_delay_max_ms === "number"
    && values.bubble_delay_min_ms > values.bubble_delay_max_ms) {
    throw new Error("Bubble delay minimum cannot exceed the maximum");
  }
  assertOrdered(values, ["discount_level_light_pct", "discount_level_medium_pct", "discount_level_max_pct"], "Discount levels");
  assertOrdered(values, [
    "discount_tier_share_none_pct", "discount_tier_share_low_pct", "discount_tier_share_mid_pct",
    "discount_tier_share_high_pct", "discount_tier_share_whale_pct",
  ], "Spend-tier discount shares");
}

export function isOperationalDefaultField(field: string): boolean {
  return OPERATIONAL_DEFAULT_FIELD_SET.has(field) && !PERSONALITY_DEFAULT_FIELDS.has(field);
}

// Strict write-boundary validation. This runs before app_settings or any clone
// row is touched, so a rejected field can never leave behind a template that
// later poisons new clones even if the clone cascade itself fails.
export function validateCloneDefaultsForWrite(raw: unknown): Partial<Clone> {
  if (!isRecord(raw)) throw new Error("Fleet defaults must be an object");
  const source = raw;
  const clean: Record<string, unknown> = { ...BUILTIN_CLONE_DEFAULTS };

  for (const key of OPERATIONAL_DEFAULT_TOGGLES) {
    if (!(key in source)) continue;
    if (typeof source[key] !== "boolean") throw new Error(`${key} must be true or false`);
    clean[key] = source[key];
  }
  for (const key of OPERATIONAL_DEFAULT_SELECTS) {
    if (!(key in source)) continue;
    if (typeof source[key] !== "string" || !SELECT_VALUES[key].includes(source[key] as never)) {
      throw new Error(`${key} has an unsupported value`);
    }
    clean[key] = source[key];
  }
  for (const key of OPERATIONAL_DEFAULT_MODELS) {
    if (!(key in source)) continue;
    if (!validModelId(source[key])) throw new Error(`${key} must be a valid model identifier`);
    clean[key] = source[key].trim();
  }
  for (const key of OPERATIONAL_DEFAULT_NUMBERS) {
    if (!(key in source)) continue;
    if (!validNumber(source[key], NUMBER_RULES[key])) {
      const rule = NUMBER_RULES[key];
      throw new Error(`${key} must be ${rule.integer ? "a whole number" : "a number"} from ${rule.min} to ${rule.max}`);
    }
    clean[key] = source[key];
  }

  if (!("category_pricing" in source)) throw new Error("category_pricing is required");
  const guide = normalizeSafeCategoryGuide(source.category_pricing);
  if (!guide) throw new Error("Every category needs a valid paid-media price");
  clean.category_pricing = guide;

  const tipMax = (clean.tip_max_stars as number | undefined) ?? 100_000;
  if ("spoil_options" in source) {
    if (!validSpoilOptions(source.spoil_options, tipMax)) {
      throw new Error("Tip buttons must contain 1-20 unique whole-Star amounts at or below the single-tip ceiling");
    }
    clean.spoil_options = source.spoil_options;
  }

  assertRelationships(clean);
  return clean as Partial<Clone>;
}

// Treat app_settings as untrusted input. Besides preventing stale personality
// keys from leaking back into a mass push, this blocks an arbitrary clone column
// from being smuggled into the JSON blob and updated fleet-wide.
export function sanitizeCloneDefaults(raw: unknown): Partial<Clone> {
  const source = isRecord(raw) ? raw : {};
  const clean: Record<string, unknown> = { ...BUILTIN_CLONE_DEFAULTS };

  for (const key of OPERATIONAL_DEFAULT_TOGGLES) {
    if (typeof source[key] === "boolean") clean[key] = source[key];
  }
  for (const key of OPERATIONAL_DEFAULT_SELECTS) {
    if (typeof source[key] === "string" && SELECT_VALUES[key].includes(source[key] as never)) clean[key] = source[key];
  }
  for (const key of OPERATIONAL_DEFAULT_MODELS) {
    if (validModelId(source[key])) clean[key] = source[key].trim();
  }
  for (const key of OPERATIONAL_DEFAULT_NUMBERS) {
    if (validNumber(source[key], NUMBER_RULES[key])) clean[key] = source[key];
  }

  const tipMax = (clean.tip_max_stars as number | undefined) ?? 100_000;
  if (validSpoilOptions(source.spoil_options, tipMax)) {
    clean.spoil_options = source.spoil_options;
  }

  const safeGuide = normalizeSafeCategoryGuide(source.category_pricing);
  clean.category_pricing = safeGuide ?? { ...DEFAULT_CATEGORY_PRICING };

  // These three values directly define the free allowance and message-pack
  // economics. A wrong type, NaN, zero-sized pack, or negative value falls back
  // to the known fleet baseline rather than getting passed to clone creation.
  clean.starting_credits = validNumber(source.starting_credits, NUMBER_RULES.starting_credits)
    ? source.starting_credits
    : BUILTIN_CLONE_DEFAULTS.starting_credits;
  clean.credit_pack_size = validNumber(source.credit_pack_size, NUMBER_RULES.credit_pack_size)
    ? source.credit_pack_size
    : BUILTIN_CLONE_DEFAULTS.credit_pack_size;
  clean.credit_pack_price_stars = validNumber(source.credit_pack_price_stars, NUMBER_RULES.credit_pack_price_stars)
    ? source.credit_pack_price_stars
    : BUILTIN_CLONE_DEFAULTS.credit_pack_price_stars;

  try {
    assertRelationships(clean);
  } catch {
    for (const key of CLONE_DEFAULT_GROUPS.flat()) delete clean[key];
    Object.assign(clean, {
      response_wait_min: BUILTIN_CLONE_DEFAULTS.response_wait_min,
      response_wait_max: BUILTIN_CLONE_DEFAULTS.response_wait_max,
    });
  }

  return clean as Partial<Clone>;
}

// The template as /settings shows it and Save, Push and Switch apply it: fallbacks under the sanitized blob.
export const effectiveCloneDefaults = (raw: unknown): Partial<Clone> => ({ ...CLONE_DEFAULT_FALLBACKS, ...sanitizeCloneDefaults(raw) });

export function filterCloneDefaultCascade(fields: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    // Category pricing is a new-clone seed only. Existing content and per-clone
    // guides are managed from PPVs with their own guarded preview workflow.
    if (key === "category_pricing" || !isOperationalDefaultField(key)) continue;
    update[key] = value;
  }
  return update;
}
