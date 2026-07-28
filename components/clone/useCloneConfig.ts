"use client";

import { useCallback, useState } from "react";
import type { Clone, SubscriptionTier } from "@/lib/types";
import { DEFAULT_PAYWALL_BUTTON, DEFAULT_PAYWALL_MESSAGE, DEFAULT_SPOIL_OPTIONS, DEFAULT_SUBSCRIPTION_TIERS } from "./fields";
import { DEFAULT_CATEGORY_PRICING, type CategoryPricing } from "@/lib/pricing";

type Level = "low" | "medium" | "high";
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

  sexualLevel: Level;
  nsfwLevel: Level;
  pushLevel: Level;

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

  tips: boolean;
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
  onboardingCollect: string[];

  dripEnabled: boolean;

  subscriptionsEnabled: boolean;
  subscriptionTiers: SubscriptionTier[];

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

    sexualLevel: clone?.sexual_level ?? "medium",
    nsfwLevel: clone?.nsfw_level ?? "medium",
    pushLevel: clone?.push_level ?? "medium",

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

    tips: clone?.tips_enabled ?? false,
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
    onboardingCollect: Array.isArray(clone?.onboarding_collect_fields) ? clone!.onboarding_collect_fields! : [],

    dripEnabled: clone?.drip_enabled ?? true,

    subscriptionsEnabled: clone?.subscriptions_enabled ?? false,
    subscriptionTiers:
      clone?.subscription_tiers && clone.subscription_tiers.length ? clone.subscription_tiers : DEFAULT_SUBSCRIPTION_TIERS,

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
