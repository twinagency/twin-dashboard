"use client";

import { useCallback, useState } from "react";
import type { Clone, SubscriptionTier } from "@/lib/types";
import { DEFAULT_PAYWALL_BUTTON, DEFAULT_PAYWALL_MESSAGE, DEFAULT_SPOIL_OPTIONS, DEFAULT_SUBSCRIPTION_TIERS } from "./fields";
import { DEFAULT_CATEGORY_PRICING, type CategoryPricing } from "@/lib/pricing";

type Level = "low" | "medium" | "high";

// All the CONTROLLED config state, shared by Configure (edit) and Create so both
// forms render the exact same settings. Uncontrolled fields (name, token, credits,
// models, …) submit straight from the DOM and are seeded from `clone` where present.
export type CloneConfigState = {
  aiMode: "classic" | "smart";
  smartSplit: boolean;

  photosEnabled: boolean;
  videosEnabled: boolean;
  videoVision: boolean;
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

  stability: number;
  similarity: number;
  style: number;
  speed: number;
  speakerBoost: boolean;

  waitMin: number;
  waitMax: number;
  memoryWindow: number;

  timezone: string;
  onboardingCollect: string[];

  dripEnabled: boolean;

  subscriptionsEnabled: boolean;
  subscriptionTiers: SubscriptionTier[];

  smartPaywall: boolean;
  paywallVoice: boolean;
  paywallDefault: string;
  paywallButton: string;

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
    videosEnabled: clone?.videos_enabled ?? false,
    videoVision: clone?.video_vision_enabled ?? true,
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

    stability: clone?.voice_stability ?? 0.4,
    similarity: clone?.voice_similarity ?? 0.75,
    style: clone?.voice_style ?? 0.25,
    speed: clone?.voice_speed ?? 0.95,
    speakerBoost: clone?.voice_speaker_boost ?? true,

    waitMin: clone?.response_wait_min ?? 0,
    waitMax: clone?.response_wait_max ?? 0,
    memoryWindow: clone?.memory_window ?? 24,

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
