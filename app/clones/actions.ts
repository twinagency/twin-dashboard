"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { compileClone } from "@/lib/compiler";
import { INTAKE_FIELD_KEYS, assembleAnswers } from "@/lib/intake";
import { vibePresetFor } from "@/lib/vibes";
import { CLONE_TOGGLE_FIELDS, type CloneToggleField } from "./toggle-fields";

// Gather the structured intake_<key> fields into { fields, answers } where
// `answers` is the labelled blob the AI compiler reads (prose + a structured-
// facts context section from the typed columns). Falls back to the legacy
// single textarea (intake_answers) so older forms still work.
function intakeFromForm(fd: FormData, name: string | null) {
  const fields: Record<string, string> = {};
  for (const key of INTAKE_FIELD_KEYS) {
    const v = str(fd, `intake_${key}`);
    if (v) fields[key] = v;
  }
  const legacy = str(fd, "intake_answers");
  if (Object.keys(fields).length === 0 && legacy) {
    return { fields: {}, answers: legacy };
  }
  return { fields, answers: assembleAnswers(fields, name ?? undefined, structuredFactsFromForm(fd)) };
}

// Labelled lines describing the typed persona columns, appended to the compiler
// blob as CONTEXT (the compiler is told the system injects these facts itself).
// Also means editing a typed field changes `answers` → triggers the auto-recompile.
function structuredFactsFromForm(fd: FormData): Record<string, string> {
  const socials = parseSocials(fd)
    .map((s) => `${s.platform} ${s.handle}${s.followers ? ` (${s.followers} followers)` : ""}`)
    .join(", ");
  const vibe = vibePresetFor(str(fd, "vibe_preset"));
  const heritage = [...parseJsonStringArray(fd, "ethnicity_tags"), str(fd, "ethnicity_other") ?? ""]
    .filter(Boolean)
    .join(", ");
  const dailyBlocks = parseDailyBlocks(fd)
    .map((b) => `${b.time ? `${b.time} ` : ""}${b.activity}`)
    .join("; ");
  return {
    "Date of birth": str(fd, "date_of_birth") ?? "",
    Gender: str(fd, "gender") ?? "",
    Height: str(fd, "height") ?? "",
    "Ethnicity / heritage": heritage,
    Sexuality: str(fd, "sexuality") ?? "",
    Hometown: str(fd, "hometown") ?? "",
    "Current city": str(fd, "current_city") ?? "",
    "Stage name": str(fd, "stage_name") ?? "",
    "Real name": str(fd, "real_name") ?? "",
    "Name shared with fans": str(fd, "name_shared_with_fans") ?? "",
    "Creator type": str(fd, "creator_type") ?? "",
    "Known for": str(fd, "known_for") ?? "",
    "Career start year": str(fd, "career_start_year") ?? "",
    "Career history": str(fd, "career_history") ?? "",
    "Cover story": str(fd, "cover_story") ?? "",
    "Platforms she admits": fd.get("admits_platforms") === "true" ? parseJsonStringArray(fd, "platforms").join(", ") : "",
    Hair: [str(fd, "hair_length"), str(fd, "hair_color")].filter(Boolean).join(" "),
    Eyes: str(fd, "eye_color") ?? "",
    "Body type": str(fd, "body_type") ?? "",
    Figure: [str(fd, "cup_size"), str(fd, "measurements")].filter(Boolean).join(", "),
    Tattoos: fd.get("tattoos") === "true" ? parseJsonStringArray(fd, "tattoo_details").join("; ") || "yes" : "none",
    Piercings: fd.get("piercings") === "true" ? parseJsonStringArray(fd, "piercing_details").join("; ") || "yes" : "none",
    Enhancements: str(fd, "enhancements") ?? "",
    Voice: [str(fd, "voice_accent"), str(fd, "voice_pace"), str(fd, "voice_texture")].filter(Boolean).join(", "),
    "Relationship status": str(fd, "relationship_canon") ?? "",
    "If he asks to meet up": str(fd, "meeting_policy") ?? "",
    "If he says I love you": str(fd, "love_policy") ?? "",
    "Social handles": socials,
    "Pet names she calls fans": parseJsonStringArray(fd, "fan_nicknames").join(", "),
    "Vibe / archetype": vibe && vibe.value !== "custom" ? `${vibe.label} (${vibe.blurb})` : "",
    "Turn-ons": parseJsonStringArray(fd, "turn_ons").join(", "),
    "Turn-offs": parseJsonStringArray(fd, "turn_offs").join(", "),
    "Reaction to rudeness": str(fd, "reaction_to_rudeness") ?? "",
    "Reaction to compliments": str(fd, "reaction_to_compliments") ?? "",
    "Message burst style": str(fd, "burst_style") ?? "",
    "Wake / sleep time": [str(fd, "wake_time"), str(fd, "sleep_time")].filter(Boolean).join(" - "),
    "Daily blocks": dailyBlocks,
    "Content she's done": parseJsonStringArray(fd, "content_done").join(", "),
    "Content hard nos": parseJsonStringArray(fd, "content_hard_nos").join(", "),
    "Hard limits (checklist)": parseJsonStringArray(fd, "hard_limits").join(", "),
    "Hard limits (extra)": str(fd, "hard_limits_extra") ?? "",
    Catchphrases: parseJsonStringArray(fd, "catchphrases").join(", "),
    "Favorite things": parseJsonStringArray(fd, "favorite_things").join(", "),
    Dislikes: parseJsonStringArray(fd, "dislikes").join(", "),
    "Saving up for": str(fd, "saving_goal") ?? "",
  };
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}
function num(fd: FormData, key: string, fallback: number): number {
  const v = fd.get(key);
  if (v === null || String(v).trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// A chip-list arrives as a JSON string array in a hidden field. Coerce to a
// clean, de-duped string[] (order preserved); anything malformed → [].
function parseJsonStringArray(fd: FormData, key: string): string[] {
  const raw = fd.get(key);
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
      const s = String(v).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Socials editor rows arrive as a JSON string in a hidden field. Coerce + clean
// (drop rows without a handle).
function parseSocials(fd: FormData): { platform: string; handle: string; followers?: string }[] {
  const raw = fd.get("socials");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s === "object")
      .map((s) => {
        const followers = String(s.followers ?? "").trim();
        return {
          platform: String(s.platform ?? "").trim(),
          handle: String(s.handle ?? "").trim(),
          ...(followers ? { followers } : {}),
        };
      })
      .filter((s) => s.handle !== "");
  } catch {
    return [];
  }
}

// Daily-rhythm blocks (migration 039) arrive as a JSON string in a hidden
// field. Coerce + clean (drop rows without an activity).
function parseDailyBlocks(fd: FormData): { time: string; activity: string }[] {
  const raw = fd.get("daily_blocks");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((b) => b && typeof b === "object")
      .map((b) => ({ time: String(b.time ?? "").trim(), activity: String(b.activity ?? "").trim() }))
      .filter((b) => b.activity !== "");
  } catch {
    return [];
  }
}

// Spoil-menu buttons arrive as a JSON string in a hidden field. Coerce + clean.
function parseSpoilOptions(fd: FormData): { stars: number; label: string }[] {
  const raw = fd.get("spoil_options");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o) => ({ stars: Math.round(Number(o?.stars)) || 0, label: String(o?.label ?? "").trim() }))
      .filter((o) => o.stars >= 1);
  } catch {
    return [];
  }
}

// Category pricing arrives as a JSON string in a hidden field. Coerce to a clean
// { category: non-negative int } map so the runtime always reads money-safe prices.
function parseCategoryPricing(fd: FormData): Record<string, number> {
  const raw = fd.get("category_pricing");
  if (!raw) return {};
  try {
    const obj = JSON.parse(String(raw));
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

// Onboarding collect-fields arrive as a JSON string array in a hidden field.
// Coerce to a clean, de-duped string[] of non-empty keys (order preserved).
function parseCollectFields(fd: FormData): string[] {
  const raw = fd.get("onboarding_collect_fields");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
      const s = String(v).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Language-lock languages arrive as a JSON string array in a hidden field. Same
// clean + de-dupe as collect-fields; order preserved (first = primary language).
function parseLanguages(fd: FormData): string[] {
  const raw = fd.get("languages");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of arr) {
      const s = String(v).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// VIP subscription tiers arrive as a JSON string in a hidden field. Coerce + clean
// so the runtime always reads well-formed, money-safe rows (name + positive price).
function parseSubscriptionTiers(fd: FormData) {
  const raw = fd.get("subscription_tiers");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => ({
        name: String(t?.name ?? "").trim(),
        price_stars: Math.max(0, Math.round(Number(t?.price_stars)) || 0),
        monthly_credits: Math.max(0, Math.round(Number(t?.monthly_credits)) || 0),
        priority: !!t?.priority,
        exclusive: !!t?.exclusive,
        unlimited: !!t?.unlimited,
        discount_boost: Math.min(100, Math.max(0, Math.round(Number(t?.discount_boost)) || 0)),
      }))
      .filter((t) => t.name && t.price_stars >= 1);
  } catch {
    return [];
  }
}

function rowFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    bot_token: str(fd, "bot_token"),
    status: str(fd, "status") ?? "paused",
    ai_mode: str(fd, "ai_mode") === "smart" ? "smart" : "classic",
    smart_split: fd.get("smart_split") !== "false",

    photos_enabled: fd.get("photos_enabled") === "true",
    videos_enabled: fd.get("videos_enabled") === "true",
    video_vision_enabled: fd.get("video_vision_enabled") === "true",
    photo_vision_enabled: fd.get("photo_vision_enabled") === "true",
    bundles_enabled: fd.get("bundles_enabled") === "true",
    voice_enabled: fd.get("voice_enabled") === "true",
    charge_messages: fd.get("charge_messages") === "true",
    tips_enabled: fd.get("tips_enabled") === "true",
    live_captions_enabled: fd.get("live_captions_enabled") === "true",
    media_caption_mode: ["none", "separate"].includes(str(fd, "media_caption_mode") ?? "")
      ? (str(fd, "media_caption_mode") as string)
      : "inline",
    thank_you_enabled: fd.get("thank_you_enabled") === "true",
    reactions_enabled: fd.get("reactions_enabled") === "true",
    read_receipts_enabled: fd.get("read_receipts_enabled") === "true",
    message_effects_enabled: fd.get("message_effects_enabled") === "true",
    ai_disclosure: fd.get("ai_disclosure") === "true",
    // Per-category auto-block (migration 061), supersedes the single
    // auto_block_enabled switch. That column is left untouched here so its
    // old value survives as a legacy fallback (see ConfigSections.tsx).
    auto_block_minor: fd.get("auto_block_minor") === "true",
    auto_block_hate: fd.get("auto_block_hate") === "true",
    auto_block_illegal: fd.get("auto_block_illegal") === "true",
    auto_block_jailbreak: fd.get("auto_block_jailbreak") === "true",
    emojis_enabled: fd.get("emojis_enabled") === "true",
    emoji_amount: str(fd, "emoji_amount") ?? "medium",
    emoji_allowlist: str(fd, "emoji_allowlist"),
    language_lock: fd.get("language_lock") === "true",
    languages: parseLanguages(fd),
    sexual_level: str(fd, "sexual_level") ?? "medium",
    nsfw_level: str(fd, "nsfw_level") ?? "medium",
    push_level: str(fd, "push_level") ?? "medium",
    discounts_enabled: fd.get("discounts_enabled") === "true",
    discount_max_photo: Math.min(90, Math.max(0, num(fd, "discount_max_photo", 0))),
    discount_max_video: Math.min(90, Math.max(0, num(fd, "discount_max_video", 0))),
    discount_max_bundle: Math.min(90, Math.max(0, num(fd, "discount_max_bundle", 0))),
    discount_max_credits: Math.min(90, Math.max(0, num(fd, "discount_max_credits", 0))),
    spoil_options: parseSpoilOptions(fd),
    category_pricing: parseCategoryPricing(fd),
    intake: intakeFromForm(fd, str(fd, "name")),

    // Structured persona facts (migration 033) — only when the widgets were on
    // the form (PersonaFactsFields renders the persona_facts marker). If the DB
    // columns don't exist yet, the save retries without them (see writeClone).
    // NOTE: `ethnicity` and `occupation` (migration 033) are deliberately NOT
    // written here anymore — they're retired legacy read-only sources (see
    // PersonaFactsFields.tsx prefills), so omitting them from the payload
    // leaves whatever value is already in the DB untouched instead of nulling
    // it out on every save.
    ...(fd.has("persona_facts")
      ? {
          date_of_birth: str(fd, "date_of_birth"),
          gender: str(fd, "gender"),
          height: str(fd, "height"),
          sexuality: str(fd, "sexuality"),
          hometown: str(fd, "hometown"),
          current_city: str(fd, "current_city"),
          socials: parseSocials(fd),
          fan_nicknames: parseJsonStringArray(fd, "fan_nicknames"),
          vibe_preset: str(fd, "vibe_preset"),
          turn_ons: parseJsonStringArray(fd, "turn_ons"),
          turn_offs: parseJsonStringArray(fd, "turn_offs"),
          hard_limits: parseJsonStringArray(fd, "hard_limits"),
          hard_limits_extra: str(fd, "hard_limits_extra"),

          // ── identity canon (migration 039) ──────────────────────────────
          stage_name: str(fd, "stage_name"),
          real_name: str(fd, "real_name"),
          name_shared_with_fans: str(fd, "name_shared_with_fans"),

          creator_type: str(fd, "creator_type"),
          known_for: str(fd, "known_for"),
          career_start_year: numOrNull(fd, "career_start_year"),
          career_history: str(fd, "career_history"),
          cover_story: str(fd, "cover_story"),
          admits_platforms: fd.has("admits_platforms") ? fd.get("admits_platforms") === "true" : null,
          platforms: parseJsonStringArray(fd, "platforms"),

          hair_color: str(fd, "hair_color"),
          hair_length: str(fd, "hair_length"),
          eye_color: str(fd, "eye_color"),
          body_type: str(fd, "body_type"),
          cup_size: str(fd, "cup_size"),
          measurements: str(fd, "measurements"),
          tattoos: fd.has("tattoos") ? fd.get("tattoos") === "true" : null,
          tattoo_details: parseJsonStringArray(fd, "tattoo_details"),
          piercings: fd.has("piercings") ? fd.get("piercings") === "true" : null,
          piercing_details: parseJsonStringArray(fd, "piercing_details"),
          enhancements: str(fd, "enhancements"),
          ethnicity_tags: parseJsonStringArray(fd, "ethnicity_tags"),
          ethnicity_other: str(fd, "ethnicity_other"),
          voice_accent: str(fd, "voice_accent"),
          voice_pace: str(fd, "voice_pace"),
          voice_texture: str(fd, "voice_texture"),

          meeting_policy: str(fd, "meeting_policy"),
          love_policy: str(fd, "love_policy"),
          relationship_canon: str(fd, "relationship_canon"),
          acknowledges_other_fans: fd.has("acknowledges_other_fans") ? fd.get("acknowledges_other_fans") === "true" : null,

          wake_time: str(fd, "wake_time"),
          sleep_time: str(fd, "sleep_time"),
          daily_blocks: parseDailyBlocks(fd),

          // Life canon (migration 060)
          hobbies: parseJsonStringArray(fd, "hobbies"),
          has_pets: fd.has("has_pets") ? fd.get("has_pets") === "true" : null,
          pet_details: parseJsonStringArray(fd, "pet_details"),
          living_situation: str(fd, "living_situation"),

          // Favorites/catchphrases canon (migration 063)
          catchphrases: parseJsonStringArray(fd, "catchphrases"),
          favorite_things: parseJsonStringArray(fd, "favorite_things"),
          dislikes: parseJsonStringArray(fd, "dislikes"),
          saving_goal: str(fd, "saving_goal"),

          content_hard_nos: parseJsonStringArray(fd, "content_hard_nos"),
          content_done: parseJsonStringArray(fd, "content_done"),

          reaction_to_rudeness: str(fd, "reaction_to_rudeness"),
          reaction_to_compliments: str(fd, "reaction_to_compliments"),
          burst_style: str(fd, "burst_style"),

          uses_lowercase: fd.has("uses_lowercase") ? fd.get("uses_lowercase") === "true" : null,
          drops_punctuation: fd.has("drops_punctuation") ? fd.get("drops_punctuation") === "true" : null,
          makes_typos: fd.has("makes_typos") ? fd.get("makes_typos") === "true" : null,
          double_texts: fd.has("double_texts") ? fd.get("double_texts") === "true" : null,

          // Imperfection profile as an intensity (migration 042) — supersedes
          // the booleans above once set.
          lowercase_level: str(fd, "lowercase_level"),
          punctuation_drop_level: str(fd, "punctuation_drop_level"),
          typo_level: str(fd, "typo_level"),
          double_text_level: str(fd, "double_text_level"),
        }
      : {}),

    text_model: str(fd, "text_model") ?? "x-ai/grok-4.20",
    voice_model: str(fd, "voice_model") ?? "deepseek/deepseek-v4-pro",
    media_model: str(fd, "media_model") ?? "mistralai/mistral-small-3.2-24b-instruct",
    routing_model: str(fd, "routing_model") ?? "qwen/qwen3-30b-a3b-instruct-2507",
    voice_enhance_model: str(fd, "voice_enhance_model") ?? "google/gemini-2.5-flash-lite",
    photo_reply_model: str(fd, "photo_reply_model") ?? "qwen/qwen3-vl-32b-instruct",
    vision_model: str(fd, "vision_model") ?? "qwen/qwen3-vl-32b-instruct",

    voice_id: str(fd, "voice_id"),
    eleven_model: str(fd, "eleven_model") ?? "eleven_multilingual_v2",
    voice_stability: num(fd, "voice_stability", 0.4),
    voice_similarity: num(fd, "voice_similarity", 0.75),
    voice_style: num(fd, "voice_style", 0.25),
    voice_speaker_boost: fd.get("voice_speaker_boost") === "true",
    voice_speed: num(fd, "voice_speed", 0.95),

    starting_credits: num(fd, "starting_credits", 50),
    credit_pack_size: num(fd, "credit_pack_size", 50),
    credit_pack_price_stars: num(fd, "credit_pack_price_stars", 199),

    // time awareness (IANA tz; runtime injects her current local date/time)
    timezone: str(fd, "timezone") ?? "UTC",

    // NOTE: every outbound-engagement column — the onboarding flow
    // (welcome_instruction / welcome_bundle_after[_minutes] /
    // onboarding_voice_after / onboarding_voice_instruction /
    // onboarding_collect_fields), followup_after_minutes, and the campaign
    // fields (drip_enabled / winback_lapse_days) — is owned by the Campaigns
    // page (saveCampaign in app/drip/actions.ts) and deliberately NOT written
    // here. Configure no longer renders those inputs, so writing them from this
    // form would blank them on every save. The legacy drip_per_day /
    // drip_active_window_minutes columns are unread by the runtime and dropped.

    // recurring Star SUBSCRIPTIONS / VIP tier (money code-locked)
    subscriptions_enabled: fd.get("subscriptions_enabled") === "true",
    subscription_tiers: parseSubscriptionTiers(fd),

    // out-of-messages (paywall) flow
    smart_paywall_enabled: fd.get("smart_paywall_enabled") === "true",
    paywall_as_voice: fd.get("paywall_as_voice") === "true",
    paywall_instruction: str(fd, "paywall_instruction"),
    paywall_default_message: str(fd, "paywall_default_message"),
    paywall_button_label: str(fd, "paywall_button_label"),

    // Monetization sequence (migration 056). Every value is a code-enforced
    // threshold/switch (see components/clone/MonetizationSequenceFields.tsx
    // for what each one drives) — never write a value the field itself didn't
    // submit into, and always clamp to a sane, non-negative range so a stray
    // negative or non-numeric string can never reach the DB. Falls back to the
    // exact DB column default (bot/db/migrations/056_monetization_sequence.sql)
    // when a field is missing, so an untouched clone never silently changes.
    resell_cooldown_minutes: Math.max(0, num(fd, "resell_cooldown_minutes", 30)),
    bundle_reengage_seconds: Math.max(0, num(fd, "bundle_reengage_seconds", 60)),
    reengage_photo_enabled: fd.has("reengage_photo_enabled") ? fd.get("reengage_photo_enabled") === "true" : true,
    offer_pending_minutes: Math.max(0, num(fd, "offer_pending_minutes", 15)),
    offer_redirect_cap: Math.max(1, num(fd, "offer_redirect_cap", 3)),
    voice_cooldown_turns: Math.max(0, num(fd, "voice_cooldown_turns", 2)),
    ppv_min_engaged_messages: Math.max(1, num(fd, "ppv_min_engaged_messages", 4)),
    ppv_cadence_seconds: Math.max(0, num(fd, "ppv_cadence_seconds", 60)),
    ppv_cooldown_minutes: Math.max(0, num(fd, "ppv_cooldown_minutes", 45)),
    discount_slowdown_minutes: Math.max(0, num(fd, "discount_slowdown_minutes", 15)),
    paywall_warmup_messages: Math.max(0, num(fd, "paywall_warmup_messages", 5)),
    paywall_unlock_bonus_photo: fd.has("paywall_unlock_bonus_photo") ? fd.get("paywall_unlock_bonus_photo") === "true" : true,
    prelock_tease_before: Math.max(0, num(fd, "prelock_tease_before", 3)),
    postlock_reengage_enabled: fd.has("postlock_reengage_enabled") ? fd.get("postlock_reengage_enabled") === "true" : true,
    postlock_curiosity1_minutes: Math.max(0, num(fd, "postlock_curiosity1_minutes", 20)),
    // Clamped to never sit below the first check-in — a lower value here would
    // make the graceful-goodbye stage fire on the very next poll after the
    // first check-in instead of acting as a separate, later stage.
    postlock_curiosity2_minutes: Math.max(
      Math.max(0, num(fd, "postlock_curiosity1_minutes", 20)),
      num(fd, "postlock_curiosity2_minutes", 90),
    ),

    response_wait_min: num(fd, "response_wait_min", 0),
    response_wait_max: num(fd, "response_wait_max", 0),
    memory_window: Math.min(100, Math.max(1, num(fd, "memory_window", 24))),

    // Response pacing (migration 041) — every value defaults to whatever
    // reproduces today's exact behavior (instant read, continuous typing,
    // flat wait, ~3s batch window) so an untouched clone never changes.
    read_delay_min: num(fd, "read_delay_min", 0),
    read_delay_max: num(fd, "read_delay_max", 0),
    typing_stutter_enabled: fd.get("typing_stutter_enabled") === "true",
    typing_stutter_min_pause: num(fd, "typing_stutter_min_pause", 1),
    typing_stutter_max_pause: num(fd, "typing_stutter_max_pause", 3),
    // 0 → null: pacing_ramp_messages null/0 means the ramp feature is OFF.
    pacing_ramp_messages: (() => {
      const n = num(fd, "pacing_ramp_messages", 0);
      return n > 0 ? n : null;
    })(),
    pacing_new_wait_min: num(fd, "pacing_new_wait_min", 0),
    pacing_new_wait_max: num(fd, "pacing_new_wait_max", 0),
    pacing_established_wait_min: num(fd, "pacing_established_wait_min", 0),
    pacing_established_wait_max: num(fd, "pacing_established_wait_max", 0),
    batch_wait_min: num(fd, "batch_wait_min", 3),
    batch_wait_max: num(fd, "batch_wait_max", 3),

    // response length (migrations 037/038). Blank or 0 → null (unlimited); the DB
    // column has a `> 0` check constraint, so 0 must never be written literally.
    max_response_words: (() => {
      const n = numOrNull(fd, "max_response_words");
      return n && n > 0 ? n : null;
    })(),
    match_user_length: fd.get("match_user_length") === "true",

    // Prompts: only included when the form actually sends them (the review/edit
    // form does; the create form doesn't — there the compile step fills them).
    ...(fd.has("text_prompt") ? { text_prompt: str(fd, "text_prompt") } : {}),
    ...(fd.has("voice_prompt") ? { voice_prompt: str(fd, "voice_prompt") } : {}),
    ...(fd.has("routing_prompt") ? { routing_prompt: str(fd, "routing_prompt") } : {}),
    ...(fd.has("photo_reply_prompt") ? { photo_reply_prompt: str(fd, "photo_reply_prompt") } : {}),
  };
}

// Columns from migrations that may not be applied to this Supabase project yet.
// Pre-migration (columns absent) a write including them fails with PostgREST's
// missing-column error — writeClone retries without them so a save never
// crashes; those fields just aren't persisted until the migration is applied.
// (`ethnicity`/`occupation` aren't in `rowFromForm`'s payload anymore, but are
// harmless to keep listed here in case anything still references them.)
const PERSONA_FACT_COLUMNS = [
  "date_of_birth", "gender", "height", "ethnicity", "sexuality", "hometown",
  "current_city", "occupation", "socials", "fan_nicknames", "vibe_preset",
  "turn_ons", "turn_offs", "hard_limits", "hard_limits_extra",
] as const;
// Migrations 037/038 — response length. See db/migrations in the bot repo.
const RESPONSE_LENGTH_COLUMNS = ["max_response_words", "match_user_length"] as const;
// Migration 039 — identity canon. See bot/db/migrations/039_identity_canon.sql.
const IDENTITY_CANON_COLUMNS = [
  "stage_name", "real_name", "name_shared_with_fans",
  "creator_type", "known_for", "career_start_year", "career_history", "cover_story",
  "admits_platforms", "platforms",
  "hair_color", "hair_length", "eye_color", "body_type", "cup_size", "measurements",
  "tattoos", "tattoo_details", "piercings", "piercing_details", "enhancements",
  "ethnicity_tags", "ethnicity_other", "voice_accent", "voice_pace", "voice_texture",
  "meeting_policy", "love_policy", "relationship_canon", "acknowledges_other_fans",
  "wake_time", "sleep_time", "daily_blocks",
  "content_hard_nos", "content_done",
  "reaction_to_rudeness", "reaction_to_compliments", "burst_style",
  "uses_lowercase", "drops_punctuation", "makes_typos", "double_texts",
] as const;
// Migration 040 — photo vision toggle. See bot/db/migrations/040_photo_vision_toggle.sql.
const PHOTO_VISION_COLUMNS = ["photo_vision_enabled"] as const;
// Migration 041 — response pacing. See bot/db/migrations/041_response_pacing.sql.
const RESPONSE_PACING_COLUMNS = [
  "read_delay_min", "read_delay_max",
  "typing_stutter_enabled", "typing_stutter_min_pause", "typing_stutter_max_pause",
  "pacing_new_wait_min", "pacing_new_wait_max",
  "pacing_established_wait_min", "pacing_established_wait_max", "pacing_ramp_messages",
  "batch_wait_min", "batch_wait_max",
] as const;
// Migration 042 — imperfection profile levels. See bot/db/migrations/042_imperfection_levels.sql.
const IMPERFECTION_LEVEL_COLUMNS = [
  "lowercase_level", "punctuation_drop_level", "typo_level", "double_text_level",
] as const;
// Migration 060: life canon (hobbies, pets, living situation). See bot/db/migrations/060_life_canon.sql.
const LIFE_CANON_COLUMNS = ["hobbies", "has_pets", "pet_details", "living_situation"] as const;
// Migration 063: favorites/catchphrases/saving-goal canon. See bot/db/migrations/063_favorites_canon.sql.
const FAVORITES_COLUMNS = ["catchphrases", "favorite_things", "dislikes", "saving_goal"] as const;
// Migration 061: per-category safety auto-block toggles. See bot/db/migrations/061_safety_category_toggles.sql.
// These are top-level rowFromForm fields (not gated behind the persona_facts
// marker), but withoutPersonaFactColumns strips every name in OPTIONAL_COLUMNS
// unconditionally, so listing them here is enough to cover the retry path.
const SAFETY_CATEGORY_COLUMNS = [
  "auto_block_minor", "auto_block_hate", "auto_block_illegal", "auto_block_jailbreak",
] as const;
// Migration 056: monetization sequence. See bot/db/migrations/056_monetization_sequence.sql
// and components/clone/MonetizationSequenceFields.tsx for what each one drives.
const MONETIZATION_SEQUENCE_COLUMNS = [
  "resell_cooldown_minutes", "bundle_reengage_seconds", "offer_pending_minutes",
  "ppv_min_engaged_messages", "ppv_cadence_seconds", "ppv_cooldown_minutes",
  "discount_slowdown_minutes", "paywall_warmup_messages", "paywall_unlock_bonus_photo",
  "prelock_tease_before", "postlock_reengage_enabled",
  "postlock_curiosity1_minutes", "postlock_curiosity2_minutes",
] as const;
// Migration 062: independent toggle for the ignored-offer re-warm photo
// (previously gated only on photos_enabled, no dedicated switch). See
// bot/db/migrations/062_reengage_photo_toggle.sql.
const REENGAGE_PHOTO_COLUMNS = ["reengage_photo_enabled"] as const;
// Migration 064: cap on how many times guardedMedia()/guardedPitch() (bot
// flows/actions.ts) redirect a fan back to a single open offer before backing
// off. See bot/db/migrations/064_offer_redirect_cap.sql.
const OFFER_REDIRECT_COLUMNS = ["offer_redirect_cap"] as const;
// Migration 065: how many of her own most recent outbound turns must NOT have
// been a voice note before Smart mode's decider will let "voice" fire again.
// See bot/db/migrations/065_voice_cooldown.sql and bot/src/flows/smart.ts.
const VOICE_COOLDOWN_COLUMNS = ["voice_cooldown_turns"] as const;
const OPTIONAL_COLUMNS = [
  ...PERSONA_FACT_COLUMNS,
  ...RESPONSE_LENGTH_COLUMNS,
  ...IDENTITY_CANON_COLUMNS,
  ...PHOTO_VISION_COLUMNS,
  ...RESPONSE_PACING_COLUMNS,
  ...IMPERFECTION_LEVEL_COLUMNS,
  ...LIFE_CANON_COLUMNS,
  ...FAVORITES_COLUMNS,
  ...SAFETY_CATEGORY_COLUMNS,
  ...MONETIZATION_SEQUENCE_COLUMNS,
  ...REENGAGE_PHOTO_COLUMNS,
  ...OFFER_REDIRECT_COLUMNS,
  ...VOICE_COOLDOWN_COLUMNS,
] as const;

function withoutPersonaFactColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const c of OPTIONAL_COLUMNS) delete copy[c];
  return copy;
}

function isMissingColumnError(message: string): boolean {
  return /column|schema cache/i.test(message);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Step 1 of the one-page create flow: insert the clone row from settings only
// (prompts compiled later, media uploaded later by the client). Returns the new id.
export async function createCloneRow(fd: FormData): Promise<string> {
  const name = str(fd, "name");
  const bot_token = str(fd, "bot_token");
  if (!name || !bot_token) throw new Error("Name and bot token are required");

  const row = { ...rowFromForm(fd), slug: slugify(name) };
  let { data, error } = await supabaseAdmin.from("clones").insert(row).select("id").single();
  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabaseAdmin
      .from("clones")
      .insert(withoutPersonaFactColumns(row))
      .select("id")
      .single());
  }
  if (error) throw new Error(error.message);
  if (!data) throw new Error("insert returned no row");
  revalidatePath("/");
  revalidatePath("/clones");
  return data.id;
}

export async function updateClone(id: string, fd: FormData) {
  const row = rowFromForm(fd);

  // Was her questionnaire changed? (Toggles/models/name don't need a recompile —
  // those are live at runtime — so we only pay the AI compile when answers move.)
  const { data: prev } = await supabaseAdmin.from("clones").select("intake").eq("id", id).maybeSingle();
  const prevAnswers = ((prev?.intake as { answers?: string } | null)?.answers ?? "").trim();
  const newAnswers = (row.intake.answers ?? "").trim();

  let { error } = await supabaseAdmin
    .from("clones")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error && isMissingColumnError(error.message)) {
    // Pre-migration-033: retry without the structured persona columns.
    ({ error } = await supabaseAdmin
      .from("clones")
      .update({ ...withoutPersonaFactColumns(row), updated_at: new Date().toISOString() })
      .eq("id", id));
  }
  if (error) throw new Error(error.message);

  // Auto-recompile her personality when (and only when) her answers changed.
  if (newAnswers && newAnswers !== prevAnswers) {
    await compileClone(id);
  }

  revalidatePath("/");
  revalidatePath(`/clones/${id}`);
}

export async function deleteClone(id: string) {
  const { error } = await supabaseAdmin.from("clones").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/clones");
}

// One-click pause/resume: flip status active↔paused. The running bot reconciles
// within ~30s (index.ts) so it goes offline/online without a redeploy.
export async function toggleClonePause(id: string, pause: boolean) {
  const { error } = await supabaseAdmin
    .from("clones")
    .update({ status: pause ? "paused" : "active", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/clones");
}

// Compile this clone's prompts from its intake answers (AI fills the templates).
export async function compileCloneAction(id: string) {
  await compileClone(id);
  revalidatePath("/");
  revalidatePath("/clones");
  revalidatePath(`/clones/${id}`);
}

export async function setStatus(id: string, status: "active" | "paused") {
  const { error } = await supabaseAdmin
    .from("clones")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/clones/${id}`);
}

// One-click feature toggle, same shape as toggleClonePause above (single
// boolean column, single row) — used by the /ai assistant's write tools
// (app/api/ai-assistant/write-tools.ts) so it can flip an independent feature
// flag WITHOUT going through the full Configure form (updateClone), which
// would require reconstructing every other field and risks clobbering them.
// CLONE_TOGGLE_FIELDS (./toggle-fields.ts) is a hardcoded allowlist —
// deliberately the exact same independent, non-money boolean columns already
// cleared for the assistant to READ (see ALLOWLIST.clones in
// app/api/ai-assistant/tools.ts). This is not a generic "update any column"
// action: the field must be one of these named columns, never an arbitrary
// string, and it can only ever set true/false.
export async function setCloneToggle(id: string, field: CloneToggleField, value: boolean) {
  if (!CLONE_TOGGLE_FIELDS.includes(field)) throw new Error(`field not allowed: ${String(field)}`);
  if (typeof value !== "boolean") throw new Error("value must be a boolean");
  const { error } = await supabaseAdmin
    .from("clones")
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/clones/${id}`);
}
