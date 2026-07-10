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
  thank_you_enabled: boolean;
  emojis_enabled: boolean;
  emoji_amount: "low" | "medium" | "high";
  emoji_allowlist: string | null;
  sexual_level: "low" | "medium" | "high";
  nsfw_level: "low" | "medium" | "high";
  push_level: "low" | "medium" | "high";
  discounts_enabled: boolean;
  discount_max_photo: number;
  discount_max_video: number;
  discount_max_bundle: number;
  discount_max_credits: number;
  spoil_options: { stars: number; label: string }[] | null;

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

  // new-user (onboarding) flow
  welcome_instruction: string | null;
  welcome_bundle_after: number;
  welcome_bundle_after_minutes: number | null;
  onboarding_voice_after: number | null;
  onboarding_voice_instruction: string | null;

  // drip / re-engagement
  drip_enabled: boolean;
  drip_per_day: number;
  drip_active_window_minutes: number;

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
