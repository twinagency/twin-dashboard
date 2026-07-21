// One configurable VIP subscription tier (clones.subscription_tiers jsonb). Stored
// snake_case to match the DB row. price_stars is the MONTHLY price (code-locked).
export type SubscriptionTier = {
  name: string;
  price_stars: number;
  monthly_credits: number;
  priority: boolean;
  exclusive: boolean;
  unlimited: boolean;
  discount_boost: number; // 0..100
};

// One social-media presence on clones.socials jsonb (migration 033). Injected
// verbatim into her prompt facts block; `followers` is freeform ("2M", "850k").
export type SocialRow = {
  platform: string;
  handle: string;
  followers?: string;
};

// Mirrors the `clones` table in db/schema.sql — the single config row per bot.
export type Clone = {
  id: string;
  slug: string;
  name: string;
  bot_token: string;
  status: "active" | "paused";
  ai_mode: "classic" | "smart";
  smart_split: boolean;

  photos_enabled: boolean;
  videos_enabled: boolean;
  video_vision_enabled: boolean;
  bundles_enabled: boolean;
  voice_enabled: boolean;
  charge_messages: boolean;
  tips_enabled: boolean;
  live_captions_enabled: boolean;
  media_caption_mode: "inline" | "none" | "separate";
  thank_you_enabled: boolean;
  reactions_enabled: boolean;
  read_receipts_enabled: boolean;
  message_effects_enabled: boolean;
  ai_disclosure: boolean;
  emojis_enabled: boolean;
  emoji_amount: "low" | "medium" | "high";
  emoji_allowlist: string | null;
  language_lock: boolean;
  languages: string[] | null;
  sexual_level: "low" | "medium" | "high";
  nsfw_level: "low" | "medium" | "high";
  push_level: "low" | "medium" | "high";
  discounts_enabled: boolean;
  discount_max_photo: number;
  discount_max_video: number;
  discount_max_bundle: number;
  discount_max_credits: number;
  spoil_options: { stars: number; label: string }[] | null;
  // Category → suggested Star price. Auto-prices media on upload from its AI tags.
  category_pricing: Record<string, number> | null;

  // ── structured persona facts (migration 033) ────────────────────────────────
  // Optional (`?`) so pre-migration rows type-check; injected into her prompts
  // deterministically in code, never through the AI compiler. See
  // dashboard/lib/persona-facts.ts (mirror of src/prompt.ts).
  date_of_birth?: string | null;
  gender?: string | null;
  height?: string | null;
  ethnicity?: string | null;
  sexuality?: string | null;
  hometown?: string | null;
  current_city?: string | null;
  occupation?: string | null;
  socials?: SocialRow[] | null;
  fan_nicknames?: string[] | null;
  vibe_preset?: string | null;
  turn_ons?: string[] | null;
  turn_offs?: string[] | null;
  hard_limits?: string[] | null;
  hard_limits_extra?: string | null;

  text_prompt: string | null;
  voice_prompt: string | null;
  photo_reply_prompt: string | null;
  routing_prompt: string | null;

  text_model: string;
  voice_model: string;
  media_model: string;
  routing_model: string;
  voice_enhance_model: string;
  photo_reply_model: string;
  vision_model: string;

  voice_id: string | null;
  eleven_model: string;
  voice_stability: number;
  voice_similarity: number;
  voice_style: number;
  voice_speaker_boost: boolean;
  voice_speed: number;

  starting_credits: number;
  credit_pack_size: number;
  credit_pack_price_stars: number;

  // IANA timezone (e.g. "America/New_York"); drives her in-prompt time awareness.
  timezone: string;

  // new-user (onboarding) flow
  welcome_instruction: string | null;
  welcome_bundle_after: number;
  welcome_bundle_after_minutes: number | null;
  onboarding_voice_after: number | null;
  onboarding_voice_instruction: string | null;
  // Detail keys she should naturally collect from a new fan (["name","age",...]).
  onboarding_collect_fields: string[] | null;

  // follow-up nudge: one short in-persona follow-up if the fan goes quiet
  // mid-chat for this many minutes after her reply (0 = off).
  followup_after_minutes: number | null;

  // automated campaign (re-engagement; formerly "drip"). The step list reuses
  // clones.drip_steps (migration 029) with the timed shape [{type, after_hours}]
  // (hours after the fan's last activity, 1-23; see migration 031's notes).
  // Legacy columns drip_per_day / drip_active_window_minutes / drip_mode /
  // drip_sequence / drip_step_mode are no longer read by the runtime.
  drip_enabled: boolean;
  drip_per_day: number;
  drip_active_window_minutes: number;
  winback_lapse_days: number;
  drip_mode: "auto" | "sequence" | null;
  drip_sequence: string[] | null;
  drip_media_ids: { type: "photo" | "video"; id: string }[] | null;
  // Optional: absent pre-migration-029 (read defensively).
  drip_step_mode?: "random" | "ordered" | null;
  drip_steps?: { type: "text" | "voice" | "photo" | "video" | "bundle"; after_hours?: number; text?: string }[] | null;

  // recurring Star SUBSCRIPTIONS / VIP tier (money code-locked)
  subscriptions_enabled: boolean;
  subscription_tiers: SubscriptionTier[] | null;

  // out-of-messages (paywall) flow
  smart_paywall_enabled: boolean;
  paywall_instruction: string | null;
  paywall_as_voice: boolean;
  paywall_default_message: string | null;
  paywall_button_label: string | null;

  response_wait_min: number;
  response_wait_max: number;
  memory_window: number;

  intake: { answers?: string; fields?: Record<string, string> } | null;
  persona: Record<string, string> | null;

  deployed_at: string | null;
  created_at: string;
  updated_at: string;
};
