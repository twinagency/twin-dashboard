"use client";

import { useCallback, useState } from "react";
import type { Clone } from "@/lib/types";
import { DEFAULT_PAYWALL_BUTTON, DEFAULT_PAYWALL_MESSAGE, DEFAULT_SPOIL_OPTIONS } from "./fields";
import { DEFAULT_CATEGORY_PRICING, type CategoryPricing } from "@/lib/pricing";

type Level = "low" | "medium" | "high";
// The three personality dials are 5-step as of migration 082 (the DB CHECK
// constraints were widened; legacy low/medium/high stay valid and are mapped
// onto the new scale position for position by normalizeHeatLevel /
// normalizePushLevel in bot/src/flows/human.ts). The legacy members stay in
// these unions so an existing clone row still type-checks and still renders
// its current position.
type HeatLevel = "off" | "mild" | "medium" | "explicit" | "max";
type PushLevel = "none" | "low" | "medium" | "high" | "relentless";
// Migration 086, the four warmth-side dials. New columns with no legacy values,
// so unlike HeatLevel there is nothing to normalise position-for-position.
type ToneLevel = "off" | "low" | "medium" | "high" | "max";

// Mirror of normalizeHeatLevel in bot/src/flows/human.ts:474. A pre-082 row
// still stores "low"/"high"; without this the 5-step Segmented would show NO
// button pressed for those clones and the operator would not know where the
// dial actually sits. Mapped position for position, exactly as the bot does,
// so re-saving a legacy clone is a behavioural no-op.
function heatLevel(v: string | null | undefined): HeatLevel {
  switch (v) {
    case "low": return "mild";
    case "high": return "explicit";
    case "off": case "mild": case "medium": case "explicit": case "max": return v;
    default: return "medium";
  }
}
// Mirror of normalizePushLevel in bot/src/flows/human.ts:483. push_level has no
// legacy remap (its five values are a superset of the old three), so this is
// only a guard against a stale value.
function toneLevel(v: string | null | undefined): ToneLevel {
  switch (v) {
    case "off": case "low": case "medium": case "high": case "max": return v;
    default: return "medium"; // = no prompt text emitted = today's behaviour
  }
}

function pushLevel(v: string | null | undefined): PushLevel {
  switch (v) {
    case "none": case "low": case "medium": case "high": case "relentless": return v;
    default: return "medium";
  }
}
// Imperfection profile intensity (migration 042). A frequency scale reads
// more natural for these traits than low/medium/high.
type ImperfectionLevel = "never" | "sometimes" | "often" | "always";

// All the CONTROLLED config state, shared by Configure (edit) and Create so both
// forms render the exact same settings. Uncontrolled fields (name, token, credits,
// models, …) submit straight from the DOM and are seeded from `clone` where present.
export type CloneConfigState = {
  aiMode: "classic" | "smart";
  smartSplit: boolean;

  photosEnabled: boolean;
  videosEnabled: boolean;
  videoVision: boolean;
  photoVision: boolean;
  bundlesEnabled: boolean;
  voice: boolean;
  charge: boolean;
  // Never-resend toggle (clones.media_allow_resend, Track D migration).
  mediaAllowResend: boolean;

  sexualLevel: HeatLevel;
  nsfwLevel: HeatLevel;
  pushLevel: PushLevel;
  // The four warmth-side dials (migration 086). Curiosity is the one behind the
  // standing "she doesn't ask about ME" complaint.
  warmthLevel: ToneLevel;
  curiosityLevel: ToneLevel;
  playfulnessLevel: ToneLevel;
  attentivenessLevel: ToneLevel;
  // clones.tip_push_level (migration 080). NULLABLE ON PURPOSE: "" here is the
  // UI's spelling of null, which MEANS "inherit push_level", not "none".
  // bot/src/handler.ts tipPushDirective() does `clone.tipPushLevel ?? clone.pushLevel`
  // and emits nothing at all when the two land on the same step.
  tipPushLevel: PushLevel | "";
  // clones.greeting_ask_age (migration 080). Default false and it stays false:
  // see the hint in ConfigSections.
  greetingAskAge: boolean;

  emojis: boolean;
  emojiAmount: Level;
  emojiList: string;

  languageLock: boolean;
  languages: string[];

  discountsEnabled: boolean;
  discMaxPhoto: number;
  discMaxVideo: number;
  discMaxBundle: number;
  discMaxCredits: number;
  // Migration 095. Both sets only ever scale the caps above DOWN:
  // pct = cap x levelFraction x tierShare, then hard-capped at 90% in code.
  discLevelLight: number;
  discLevelMedium: number;
  discLevelMax: number;
  discTierNone: number;
  discTierLow: number;
  discTierMid: number;
  discTierHigh: number;
  discTierWhale: number;
  // Discount eligibility gates (clones.offer_pending_minutes / discount_slowdown_minutes),
  // restored 2026-07-29 (D6/D4). Both bot-read; UI defaults 0 = always eligible.
  offerPendingMinutes: number;
  discountSlowdownMinutes: number;
  // How many times she'll redirect back to an open offer before backing off
  // (clones.offer_redirect_cap). Restored 2026-07-29 (D6).
  offerRedirectCap: number;
  // Migration 085 (D7): how many explicit paid-offer declines she tolerates
  // before guardedMedia()/guardedPitch() (bot/src/flows/actions.ts) stop
  // INITIATING a fresh paid photo/video/bundle/tip/VIP pitch at that fan.
  // Distinct from offerRedirectCap above (that one nags about a SINGLE open
  // offer); this one reacts to the fan having plainly said, in words, he
  // won't pay. Never brakes her answering, or a fan who asks to buy himself.
  offerDeclineCap: number;

  tips: boolean;
  // Migration 084 (clones.tip_reask_after_paid). Money brake, opt-in only.
  // The cooldown that pairs with it is an uncontrolled number field, seeded
  // straight from the clone row the way voice_cooldown_turns is.
  tipReaskAfterPaid: boolean;
  spoilOptions: { stars: number; label: string }[];
  categoryPricing: CategoryPricing;
  liveCaptions: boolean;
  thankYou: boolean;
  mediaCaptionMode: "inline" | "none" | "separate";

  reactions: boolean;
  readReceipts: boolean;
  messageEffects: boolean;
  aiDisclosure: boolean;

  // Imperfection profile, as an intensity (migration 042). Controlled the
  // same way the other Level dials (sexual/nsfw/push/emoji) are, so the
  // Segmented control in PersonaFactsFields' imperfection card follows the
  // exact same pattern as the rest of Config.
  lowercaseLevel: ImperfectionLevel;
  punctuationDropLevel: ImperfectionLevel;
  typoLevel: ImperfectionLevel;
  doubleTextLevel: ImperfectionLevel;

  stability: number;
  similarity: number;
  style: number;
  speed: number;
  speakerBoost: boolean;

  waitMin: number;
  waitMax: number;
  // Message-catch wait (migration 072) — controlled for the same reason
  // waitMin/waitMax are: the Slider needs a live value.
  catchWaitSeconds: number;
  memoryWindow: number;

  // Response pacing (migration 041). Controlled because Slider/Toggle need
  // live values for conditional rendering (stutter pause sliders, ramp range
  // sliders). Defaults reproduce today's exact behavior when unset.

  // response length (migrations 037/038). max_response_words is a plain
  // uncontrolled number field (like followup_after_minutes) so it isn't
  // duplicated in this state; only the toggle needs controlled state.
  matchUserLength: boolean;
  gapAwarenessEnabled: boolean;
  randomVoiceEnabled: boolean;
  randomVoiceChance: number;

  timezone: string;
  // Migration 084 (clones.fan_time_mode). The timezone above is HERS; this is
  // what she does about HIS time of day when he has not told us his own.
  fanTimeMode: "never_assume" | "may_ask" | "assume_same";
  // Migration 090 (clones.price_guard_mode). What happens when she TYPES a Star
  // amount that is not in this clone's configured prices.
  priceGuardMode: "off" | "log" | "block";
  // Migration 093 (clones.silence_fallback_mode). Whether she sends the
  // "brain went blank" recovery line when the model gives up, or says nothing.
  silenceFallbackMode: "on" | "off";
  onboardingCollect: string[];

  // Migration 097 advanced dials. bubbleDelayMin/Max and llmMaxTries are
  // controlled (Sliders always are); discountAbsoluteMaxPct is controlled so
  // its conflict warning against the live per-category caps updates before
  // Save. realismEffectsEnabled is controlled (Toggle always is). The rest
  // (silence_fallback_cooldown_seconds, tip_max_stars, the three keyword
  // lists) are plain uncontrolled Fields, same pattern as tip_reask_cooldown_seconds.
  bubbleDelayMinMs: number;
  bubbleDelayMaxMs: number;
  llmMaxTries: number;
  discountAbsoluteMaxPct: number;
  realismEffectsEnabled: boolean;

  dripEnabled: boolean;

  smartPaywall: boolean;
  paywallVoice: boolean;
  paywallDefault: string;
  paywallButton: string;

  // Pre-lock prime + post-lock resume (migration 069). Instructions are
  // uncontrolled (submit by name); the toggles + the prime count are
  // controlled here since their visible controls mount conditionally. The
  // promised-image id is controlled too - MediaPicker is buttons, not a
  // native input, so it needs a live value/setter like the other pickers.
  paywallPrimeEnabled: boolean;
  paywallPrimeBefore: number;
  paywallPrimeVoice: boolean;
  paywallResumeEnabled: boolean;
  paywallResumeFree: boolean;
  paywallResumeMediaId: string | null;

  active: boolean;
};

export type SetConfig = <K extends keyof CloneConfigState>(
  key: K,
  value: CloneConfigState[K] | ((prev: CloneConfigState[K]) => CloneConfigState[K]),
) => void;

function initial(clone?: Partial<Clone>): CloneConfigState {
  return {
    aiMode: clone?.ai_mode ?? "classic",
    smartSplit: clone?.smart_split ?? true,

    photosEnabled: clone?.photos_enabled ?? true,
    videosEnabled: clone?.videos_enabled ?? true,
    videoVision: clone?.video_vision_enabled ?? true,
    photoVision: clone?.photo_vision_enabled ?? true,
    bundlesEnabled: clone?.bundles_enabled ?? true,
    voice: clone?.voice_enabled ?? true,
    charge: clone?.charge_messages ?? true,
    mediaAllowResend: clone?.media_allow_resend ?? false,

    sexualLevel: heatLevel(clone?.sexual_level),
    nsfwLevel: heatLevel(clone?.nsfw_level),
    pushLevel: pushLevel(clone?.push_level),
    warmthLevel: toneLevel(clone?.warmth_level),
    curiosityLevel: toneLevel(clone?.curiosity_level),
    playfulnessLevel: toneLevel(clone?.playfulness_level),
    attentivenessLevel: toneLevel(clone?.attentiveness_level),
    // null/undefined -> "" -> saved back as null = inherit push_level.
    tipPushLevel: clone?.tip_push_level ?? "",
    greetingAskAge: clone?.greeting_ask_age ?? false,

    emojis: clone?.emojis_enabled ?? true,
    emojiAmount: clone?.emoji_amount ?? "medium",
    emojiList: clone?.emoji_allowlist ?? "",

    languageLock: clone?.language_lock ?? false,
    languages: Array.isArray(clone?.languages) ? clone!.languages! : [],

    discountsEnabled: clone?.discounts_enabled ?? false,
    discMaxPhoto: clone?.discount_max_photo ?? 0,
    discMaxVideo: clone?.discount_max_video ?? 0,
    discMaxBundle: clone?.discount_max_bundle ?? 0,
    discMaxCredits: clone?.discount_max_credits ?? 0,
    // Migration 095 defaults, identical to the constants star-pricing.ts used
    // before the migration, so a clone nobody has tuned behaves exactly as it
    // did and the control never shows a number the bot is not running.
    discLevelLight: clone?.discount_level_light_pct ?? 34,
    discLevelMedium: clone?.discount_level_medium_pct ?? 67,
    discLevelMax: clone?.discount_level_max_pct ?? 100,
    discTierNone: clone?.discount_tier_share_none_pct ?? 50,
    discTierLow: clone?.discount_tier_share_low_pct ?? 60,
    discTierMid: clone?.discount_tier_share_mid_pct ?? 75,
    discTierHigh: clone?.discount_tier_share_high_pct ?? 90,
    discTierWhale: clone?.discount_tier_share_whale_pct ?? 100,
    // 15, NOT 0. The save path floors both at 1 and defaults them to 15
    // (rowFromForm in app/clones/actions.ts), and mapClone in
    // bot/src/data/supabase-store.ts:1120 also falls back to 15, so a 0 shown
    // here was a display-only lie: the operator saw "always eligible" for a
    // NULL column the bot was actually treating as 15 minutes.
    offerPendingMinutes: clone?.offer_pending_minutes ?? 15,
    discountSlowdownMinutes: clone?.discount_slowdown_minutes ?? 15,
    offerRedirectCap: clone?.offer_redirect_cap ?? 3,
    offerDeclineCap: clone?.offer_decline_cap ?? 3,

    tips: clone?.tips_enabled ?? false,
    tipReaskAfterPaid: clone?.tip_reask_after_paid ?? false,
    spoilOptions: clone?.spoil_options && clone.spoil_options.length ? clone.spoil_options : DEFAULT_SPOIL_OPTIONS,
    categoryPricing:
      clone?.category_pricing && Object.keys(clone.category_pricing).length
        ? { ...DEFAULT_CATEGORY_PRICING, ...clone.category_pricing }
        : { ...DEFAULT_CATEGORY_PRICING },
    liveCaptions: clone?.live_captions_enabled ?? false,
    thankYou: clone?.thank_you_enabled ?? true,
    mediaCaptionMode: clone?.media_caption_mode ?? "inline",

    reactions: clone?.reactions_enabled ?? true,
    readReceipts: clone?.read_receipts_enabled ?? true,
    messageEffects: clone?.message_effects_enabled ?? true,
    aiDisclosure: clone?.ai_disclosure ?? false,

    // Imperfection profile levels (migration 042). A clone saved before this
    // shipped has no level column yet, only the old boolean — start the UI at
    // "often" rather than "never" so switching to the new control doesn't
    // read as silently turning the trait off; saving then persists the level
    // and the prompt builder stops reading the boolean for that trait.
    lowercaseLevel: clone?.lowercase_level ?? (clone?.uses_lowercase ? "often" : "never"),
    punctuationDropLevel: clone?.punctuation_drop_level ?? (clone?.drops_punctuation ? "often" : "never"),
    typoLevel: clone?.typo_level ?? (clone?.makes_typos ? "sometimes" : "never"),
    doubleTextLevel: clone?.double_text_level ?? (clone?.double_texts ? "sometimes" : "never"),

    stability: clone?.voice_stability ?? 0.4,
    similarity: clone?.voice_similarity ?? 0.75,
    style: clone?.voice_style ?? 0.25,
    speed: clone?.voice_speed ?? 0.95,
    speakerBoost: clone?.voice_speaker_boost ?? true,

    waitMin: clone?.response_wait_min ?? 0,
    waitMax: clone?.response_wait_max ?? 0,
    catchWaitSeconds: clone?.message_catch_wait_seconds ?? 3,
    memoryWindow: clone?.memory_window ?? 24,


    matchUserLength: clone?.match_user_length ?? false,
    gapAwarenessEnabled: clone?.gap_awareness_enabled ?? true,
    randomVoiceEnabled: clone?.random_voice_enabled ?? false,
    randomVoiceChance: clone?.random_voice_chance ?? 15,

    timezone: clone?.timezone ?? "UTC",
    // Same fallback mapClone uses (bot/src/data/supabase-store.ts), so the
    // control can never show a mode the bot is not actually running.
    fanTimeMode: clone?.fan_time_mode ?? "never_assume",
    // Same fallback mapClone uses (bot/src/data/supabase-store.ts:1302) and the
    // same one migration 090 wrote as the column default, so the control can
    // never show a mode the bot is not actually running.
    priceGuardMode: clone?.price_guard_mode ?? "block",
    // Same fallback mapClone uses (bot/src/data/supabase-store.ts:1313) and the
    // same one migration 093 wrote as the column default, so the control can
    // never show a state the bot is not actually running.
    silenceFallbackMode: clone?.silence_fallback_mode ?? "on",
    onboardingCollect: Array.isArray(clone?.onboarding_collect_fields) ? clone!.onboarding_collect_fields! : [],

    // Migration 097 advanced dials. Defaults mirror the hardcoded constants
    // they replace, so an untouched clone behaves exactly as it did before
    // these became editable.
    bubbleDelayMinMs: clone?.bubble_delay_min_ms ?? 600,
    bubbleDelayMaxMs: clone?.bubble_delay_max_ms ?? 1400,
    llmMaxTries: clone?.llm_max_tries ?? 3,
    discountAbsoluteMaxPct: clone?.discount_absolute_max_pct ?? 90,
    realismEffectsEnabled: clone?.realism_effects_enabled ?? true,

    dripEnabled: clone?.drip_enabled ?? true,

    smartPaywall: clone?.smart_paywall_enabled ?? true,
    paywallVoice: clone?.paywall_as_voice ?? false,
    paywallDefault: clone?.paywall_default_message ?? DEFAULT_PAYWALL_MESSAGE,
    paywallButton: clone?.paywall_button_label ?? DEFAULT_PAYWALL_BUTTON,

    paywallPrimeEnabled: clone?.paywall_prime_enabled ?? false,
    paywallPrimeBefore: clone?.paywall_prime_before ?? 3,
    paywallPrimeVoice: clone?.paywall_prime_as_voice ?? false,
    paywallResumeEnabled: clone?.paywall_resume_enabled ?? false,
    paywallResumeFree: clone?.paywall_resume_free ?? true,
    paywallResumeMediaId:
      typeof clone?.paywall_resume_media_id === "string" && clone.paywall_resume_media_id.trim()
        ? clone.paywall_resume_media_id.trim()
        : null,

    active: clone?.status === "active",
  };
}

export function useCloneConfig(clone?: Partial<Clone>): [CloneConfigState, SetConfig] {
  const [state, setState] = useState<CloneConfigState>(() => initial(clone));
  const set = useCallback<SetConfig>((key, value) => {
    setState((s) => ({
      ...s,
      [key]: typeof value === "function" ? (value as (p: CloneConfigState[typeof key]) => CloneConfigState[typeof key])(s[key]) : value,
    }));
  }, []);
  return [state, set];
}
