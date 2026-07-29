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
  photo_vision_enabled: boolean;
  bundles_enabled: boolean;
  voice_enabled: boolean;
  charge_messages: boolean;
  tips_enabled: boolean;
  // Never-resend rule for already-received media (migration TBD, Track D
  // 2026-07-29). false (default) = current behaviour, never resend an item a
  // fan already received. true = resends allowed. Optional so a row saved
  // before the migration lands still type-checks.
  media_allow_resend?: boolean;
  live_captions_enabled: boolean;
  media_caption_mode: "inline" | "none" | "separate";
  thank_you_enabled: boolean;
  reactions_enabled: boolean;
  read_receipts_enabled: boolean;
  message_effects_enabled: boolean;
  ai_disclosure: boolean;
  // The auto_block_* fields (migrations 047/061) were removed on 2026-07-27.
  // The AI never blocks a fan, it only flags for operator review, so nothing
  // reads or writes them. The columns remain in the DB, deliberately unread.
  emojis_enabled: boolean;
  emoji_amount: "low" | "medium" | "high";
  emoji_allowlist: string | null;
  language_lock: boolean;
  languages: string[] | null;
  // 5-step as of migration 082 (DB CHECK widened). Legacy low/high stay valid
  // for the two heat dials and are mapped onto the new scale in
  // bot/src/flows/human.ts normalizeHeatLevel / normalizePushLevel.
  sexual_level: "off" | "mild" | "medium" | "explicit" | "max" | "low" | "high";
  nsfw_level: "off" | "mild" | "medium" | "explicit" | "max" | "low" | "high";
  push_level: "none" | "low" | "medium" | "high" | "relentless";
  // Migration 080. NULL means "inherit push_level" (bot/src/handler.ts
  // tipPushDirective), never "none".
  tip_push_level?: "none" | "low" | "medium" | "high" | "relentless" | null;
  // Migration 080. Whether she may ask a brand-new fan his age in her very
  // first message (bot/src/flows/human.ts:383). Default false on purpose.
  greeting_ask_age?: boolean;
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
  // `ethnicity` (migration 033) is now a LEGACY read-only source only, kept
  // for the ethnicity_other prefill (see PersonaFactsFields.tsx); never
  // written by the current UI. ethnicity_tags/ethnicity_other (migration 039)
  // are the live columns.
  ethnicity?: string | null;
  sexuality?: string | null;
  hometown?: string | null;
  current_city?: string | null;
  // `occupation` (migration 033) is now a LEGACY read-only source only, kept
  // for the cover_story prefill (see PersonaFactsFields.tsx); never written
  // by the current UI. creator_type/cover_story (migration 039) supersede it.
  occupation?: string | null;
  socials?: SocialRow[] | null;
  fan_nicknames?: string[] | null;
  vibe_preset?: string | null;
  turn_ons?: string[] | null;
  turn_offs?: string[] | null;
  hard_limits?: string[] | null;
  hard_limits_extra?: string | null;

  // ── identity canon (migration 039) ──────────────────────────────────────────
  // Same rule as migration 033: optional, typed, injected deterministically in
  // code, never through the AI compiler. See dashboard/lib/persona-facts.ts.
  stage_name?: string | null;
  real_name?: string | null;
  name_shared_with_fans?: "stage" | "real" | "both" | null;

  creator_type?: string | null;
  known_for?: string | null;
  career_start_year?: number | null;
  career_history?: string | null;
  cover_story?: string | null;
  admits_platforms?: boolean | null;
  platforms?: string[] | null;

  hair_color?: string | null;
  hair_length?: string | null;
  eye_color?: string | null;
  body_type?: string | null;
  cup_size?: string | null;
  measurements?: string | null;
  tattoos?: boolean | null;
  tattoo_details?: string[] | null;
  piercings?: boolean | null;
  piercing_details?: string[] | null;
  enhancements?: "natural" | "augmented" | "prefers_not_to_say" | null;
  ethnicity_tags?: string[] | null;
  ethnicity_other?: string | null;
  voice_accent?: string | null;
  voice_pace?: string | null;
  voice_texture?: string | null;

  meeting_policy?: "hard_no" | "soft_deflect" | "playful_maybe" | null;
  love_policy?: "says_it_back" | "deflects_warmly" | "playful_dodge" | null;
  relationship_canon?: "single" | "taken" | "complicated" | "wont_say" | null;
  acknowledges_other_fans?: boolean | null;

  wake_time?: string | null;
  sleep_time?: string | null;
  daily_blocks?: { time: string; activity: string }[] | null;

  // ── life canon (migration 060) ──────────────────────────────────────────────
  hobbies?: string[] | null;
  has_pets?: boolean | null;
  pet_details?: string[] | null;
  living_situation?: "alone" | "with_roommates" | "with_family" | "with_partner" | "prefers_not_to_say" | null;

  // ── favorites/catchphrases canon (migration 063) ──────────────────────────────
  catchphrases?: string[] | null;
  favorite_things?: string[] | null;
  dislikes?: string[] | null;
  saving_goal?: string | null;

  content_hard_nos?: string[] | null;
  content_done?: string[] | null;

  reaction_to_rudeness?: "goes_quiet" | "claps_back" | "playful_scold" | null;
  reaction_to_compliments?: "deflects" | "teases" | "accepts_warmly" | null;
  burst_style?: "one_long" | "short_bursts" | null;

  uses_lowercase?: boolean | null;
  drops_punctuation?: boolean | null;
  makes_typos?: boolean | null;
  double_texts?: boolean | null;

  // Imperfection profile as an intensity (migration 042) — supersedes the
  // booleans above once set; unset falls back to the boolean's old behavior.
  lowercase_level?: "never" | "sometimes" | "often" | "always" | null;
  punctuation_drop_level?: "never" | "sometimes" | "often" | "always" | null;
  typo_level?: "never" | "sometimes" | "often" | "always" | null;
  double_text_level?: "never" | "sometimes" | "often" | "always" | null;

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
  random_voice_enabled: boolean;
  random_voice_chance: number;
  gap_awareness_enabled: boolean;
  // Per-flow caption kill switch (migration 071) — overrides media_caption_mode
  // outright for that flow's photo/video/bundle sends. Optional (`?`) so
  // pre-migration rows type-check.
  onboarding_captions_off?: boolean;
  campaign_captions_off?: boolean;

  starting_credits: number;
  credit_pack_size: number;
  credit_pack_price_stars: number;

  // IANA timezone (e.g. "America/New_York"); drives her in-prompt time awareness.
  timezone: string;

  // new-user (onboarding) flow
  welcome_instruction: string | null;
  welcome_bundle_after: number;
  welcome_bundle_after_minutes: number | null;
  // Short AI-composed tease line sent before the welcome bundle (default false).
  welcome_bundle_teased: boolean;
  onboarding_voice_after: number | null;
  onboarding_voice_instruction: string | null;
  // Detail keys she should naturally collect from a new fan (["name","age",...]).
  onboarding_collect_fields: string[] | null;
  // How many messages she keeps steering to collect the fields above (default 8).
  onboarding_length: number;

  // ── free-preview fallback (migration 069) ───────────────────────────────────
  // A safety net for the onboarding flow: if he hasn't bought the welcome bundle
  // within a time or message-count window, she offers a single free taste. Either
  // trigger can fire (null = that trigger off); media id null = she auto-picks.
  onboarding_free_preview_enabled?: boolean;
  onboarding_free_preview_after_minutes?: number | null;
  onboarding_free_preview_after_messages?: number | null;
  onboarding_free_preview_media_id?: string | null;
  // Steer for the spoken lead-in line before the free photo (migration 073).
  // Blank/null = the bot's default lead-in. Independent of the caption
  // kill switch, which only strips the photo's own caption.
  onboarding_free_preview_instruction?: string | null;

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
  // Ordered onboarding step list (migration 068, bot/db/migrations/068_onboarding_steps.sql).
  // Same picker as drip_steps, but fires on the fan's MESSAGE COUNT, never hours
  // quiet — see the migration for why. Optional: absent pre-migration-068.
  onboarding_steps?:
    | {
        type: "text" | "voice" | "photo" | "video" | "bundle" | "collect" | "tease";
        after_messages?: number;
        media_id?: string;
        free?: boolean;
        collect_field?: string;
        // Optional per-step steer for text/voice/tease lines (migration 069,
        // stored inside the jsonb, not a column). Blank = she decides.
        instruction?: string | null;
      }[]
    | null;

  // recurring Star SUBSCRIPTIONS / VIP tier (money code-locked)
  subscriptions_enabled: boolean;
  subscription_tiers: SubscriptionTier[] | null;

  // out-of-messages (paywall) flow
  smart_paywall_enabled: boolean;
  paywall_instruction: string | null;
  paywall_as_voice: boolean;
  paywall_default_message: string | null;
  paywall_button_label: string | null;

  // ── pre-lock prime + post-lock resume (migration 069) ───────────────────────
  // Optional (`?`) so pre-migration rows type-check. paywall_prime_* is a warmup
  // she sends a few messages BEFORE he runs out; paywall_resume_* is the pick-up
  // she sends AFTER he pays. media/instruction null = she auto-picks/decides.
  paywall_prime_enabled?: boolean;
  paywall_prime_before?: number;
  paywall_prime_instruction?: string | null;
  paywall_prime_as_voice?: boolean;
  paywall_resume_enabled?: boolean;
  paywall_resume_instruction?: string | null;
  paywall_resume_media_id?: string | null;
  paywall_resume_free?: boolean;

  response_wait_min: number;
  response_wait_max: number;
  // Message-catch wait (migration 072): how long the batcher holds a fan's
  // rapid-fire double/triple text before treating it as one turn. Fires
  // BEFORE response_wait_min/max above. Optional so a pre-migration row types.
  message_catch_wait_seconds?: number;
  memory_window: number;

  // Response pacing and the monetization-sequence dials were removed on
  // 2026-07-27 (operator decision). Their columns remain in the DB, unread.
  // offer_pending_minutes, offer_redirect_cap, discount_slowdown_minutes and
  // voice_cooldown_turns below are STILL read by the bot, so they stay.

  // response length (migration 037/038). max_response_words: hard ceiling on
  // reply length (null/0 = unlimited, always enforced as a last-resort safety
  // net). match_user_length: scale reply length toward the fan's incoming
  // message instead of a fixed style (off by default).
  max_response_words: number | null;
  match_user_length: boolean;

  offer_pending_minutes?: number;
  offer_redirect_cap?: number;
  voice_cooldown_turns?: number;
  discount_slowdown_minutes?: number;

  intake: { answers?: string; fields?: Record<string, string> } | null;
  persona: Record<string, string> | null;

  deployed_at: string | null;
  created_at: string;
  updated_at: string;
};
