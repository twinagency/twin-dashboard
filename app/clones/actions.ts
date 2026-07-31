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
  const hasAppearance = fd.has("dashboard_chart_color") || fd.has("dashboard_profile_image_path");
  const color = str(fd, "dashboard_chart_color");
  const appearance = hasAppearance
    ? {
        chart_color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#635bff",
        profile_image_path: str(fd, "dashboard_profile_image_path"),
      }
    : undefined;
  if (Object.keys(fields).length === 0 && legacy) {
    return { fields: {}, answers: legacy, ...(appearance ? { appearance } : {}) };
  }
  return {
    fields,
    answers: assembleAnswers(fields, name ?? undefined, structuredFactsFromForm(fd)),
    ...(appearance ? { appearance } : {}),
  };
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
// The five-step dial vocabularies (migration 082 for the three heat/push dials,
// migration 080 for tip_push_level). Legacy "low"/"high" stay in HEAT_LEVELS
// because the widened sexual/nsfw CHECK constraints still accept them and every
// pre-082 clone row is still carrying one.
const HEAT_LEVELS = ["off", "mild", "medium", "explicit", "max", "low", "high"] as const;
const PUSH_LEVELS = ["none", "low", "medium", "high", "relentless"] as const;
// Migration 086, the four warmth-side dials. No legacy values to accept.
const TONE_LEVELS = ["off", "low", "medium", "high", "max"] as const;
// Migration 084 (clones.fan_time_mode). Must stay identical to the DB CHECK
// constraint clones_fan_time_mode_check, or a save fails outright.
const FAN_TIME_MODES = ["never_assume", "may_ask", "assume_same"] as const;
// Migration 090 (clones.price_guard_mode). Must stay identical to the DB CHECK
// constraint clones_price_guard_mode_check, or a save fails outright.
const PRICE_GUARD_MODES = ["off", "log", "block"] as const;
// Migration 093 (clones.silence_fallback_mode). Must stay identical to the DB
// CHECK constraint clones_silence_fallback_mode_check, or a save fails
// outright. Read off the live constraint, not off the .sql file:
//   CHECK (silence_fallback_mode = ANY (ARRAY['on'::text, 'off'::text]))
const SILENCE_FALLBACK_MODES = ["on", "off"] as const;

function oneOf<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}
// Same, but null stays null. Used only where null carries meaning of its own
// (tip_push_level: null = inherit push_level).
function oneOfOrNull<T extends string>(v: string | null, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : null;
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
    // Never-resend rule (D5(i), Track D's migration). false = current behaviour,
    // never resend an already-received item. Listed in MEDIA_RESEND_COLUMNS
    // below so a save before the migration lands still succeeds.
    media_allow_resend: fd.get("media_allow_resend") === "true",
    tips_enabled: fd.get("tips_enabled") === "true",
    // Migration 084, the two tip re-ask brakes.
    //
    // NO numeric fallback and NO clamp on the cooldown, deliberately. null is a
    // meaningful value here: spoilCooldownMs() (bot/src/flows/spoil.ts:136)
    // reads null as "use the 180s code default", which is the exact behaviour
    // that was hardcoded before this column existed. Writing a number in place
    // of a blank field would freeze today's default into the row and break that
    // contract. A 0 is rejected by the DB CHECK rather than silently stored,
    // because a 0 cooldown is a removed money brake, not a configuration.
    tip_reask_cooldown_seconds: numOrNull(fd, "tip_reask_cooldown_seconds"),
    // Reads "true" (the Toggle primitive's hidden-input value), not bool()'s
    // "on". Default false is load bearing: true lets her ask for another tip
    // moments after a fan has paid, which must be an explicit operator choice.
    tip_reask_after_paid: fd.get("tip_reask_after_paid") === "true",
    live_captions_enabled: fd.get("live_captions_enabled") === "true",
    media_caption_mode: ["none", "separate"].includes(str(fd, "media_caption_mode") ?? "")
      ? (str(fd, "media_caption_mode") as string)
      : "inline",
    thank_you_enabled: fd.get("thank_you_enabled") === "true",
    reactions_enabled: fd.get("reactions_enabled") === "true",
    read_receipts_enabled: fd.get("read_receipts_enabled") === "true",
    message_effects_enabled: fd.get("message_effects_enabled") === "true",
    ai_disclosure: fd.get("ai_disclosure") === "true",
    // The auto_block_* columns are deliberately no longer written (2026-07-27).
    // The AI never blocks a fan, it only flags for operator review, so there is
    // no UI for these and nothing to save. The columns stay in the DB unread
    // rather than being dropped, per the additive-only migration rule.
    emojis_enabled: fd.get("emojis_enabled") === "true",
    emoji_amount: str(fd, "emoji_amount") ?? "medium",
    emoji_allowlist: str(fd, "emoji_allowlist"),
    language_lock: fd.get("language_lock") === "true",
    languages: parseLanguages(fd),
    // The three personality dials are 5-step as of migration 082, which widened
    // the DB CHECK constraints. Whitelisted here rather than passed through raw
    // so a stale/garbage form value falls back to "medium" instead of getting
    // rejected by the CHECK and failing the entire save. Legacy low/high are
    // still accepted by the heat constraints and by normalizeHeatLevel in
    // bot/src/flows/human.ts:474, so an untouched clone round-trips unchanged.
    sexual_level: oneOf(str(fd, "sexual_level"), HEAT_LEVELS, "medium"),
    nsfw_level: oneOf(str(fd, "nsfw_level"), HEAT_LEVELS, "medium"),
    push_level: oneOf(str(fd, "push_level"), PUSH_LEVELS, "medium"),
    // Migration 086, the four warmth-side dials. Consumed by personalityRule()
    // in bot/src/flows/human.ts, which emits NOTHING for "medium" (medium is
    // defined as current behaviour), so the fallback here is also a true no-op.
    warmth_level: oneOf(str(fd, "warmth_level"), TONE_LEVELS, "medium"),
    curiosity_level: oneOf(str(fd, "curiosity_level"), TONE_LEVELS, "medium"),
    playfulness_level: oneOf(str(fd, "playfulness_level"), TONE_LEVELS, "medium"),
    attentiveness_level: oneOf(str(fd, "attentiveness_level"), TONE_LEVELS, "medium"),
    // Migration 080. NULL IS MEANINGFUL: it means "inherit push_level", which is
    // what bot/src/handler.ts:162 tipPushDirective() does. str() maps the empty
    // string (the UI's "Same as push level" option) to null, so an unset dial
    // stays a true no-op and tipPushDirective returns "" for that clone.
    tip_push_level: oneOfOrNull(str(fd, "tip_push_level"), PUSH_LEVELS),
    // Migration 080. Consumed at bot/src/flows/human.ts:383 (newFanGreetingNudge).
    greeting_ask_age: fd.get("greeting_ask_age") === "true",
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
    // Migration 088. Default 0 = tips grant no credits, which is exactly the
    // pre-088 live behaviour, so a save from an untouched form changes nothing.
    // Clamped at 0 because a negative rate would mean a tip DEDUCTS credits.
    tip_credits_per_100_stars: Math.max(0, num(fd, "tip_credits_per_100_stars", 0)),
    // Migration 090. Anything unrecognised falls back to 'block', which is both
    // the column default and mapClone's fallback, so a save can never quietly
    // DISARM the guard: switching it off has to be a deliberate pick.
    price_guard_mode: oneOf(str(fd, "price_guard_mode"), PRICE_GUARD_MODES, "block"),
    // Migration 093. Falls back to 'on', which is both the column default and
    // mapClone's fallback (supabase-store.ts:1313), so a save can never quietly
    // GHOST a fan: going silent has to be a deliberate pick.
    silence_fallback_mode: oneOf(str(fd, "silence_fallback_mode"), SILENCE_FALLBACK_MODES, "on"),

    // time awareness (IANA tz; runtime injects her current local date/time)
    timezone: str(fd, "timezone") ?? "UTC",
    // Migration 084. The timezone above is HERS. fan_time_mode is what she does
    // about HIS time of day when he has not told us his own timezone. Anything
    // unrecognised falls back to 'never_assume', the safe mode: 'assume_same'
    // is the legacy behaviour that made her greet a real fan with "how's your
    // night going" off her own clock, so it is opt-in and never a fallback.
    fan_time_mode: oneOf(str(fd, "fan_time_mode"), FAN_TIME_MODES, "never_assume"),

    // NOTE: every outbound-engagement column — the onboarding flow
    // (welcome_instruction / welcome_bundle_after[_minutes] /
    // onboarding_voice_after / onboarding_voice_instruction /
    // onboarding_collect_fields), followup_after_minutes, and the campaign
    // fields (drip_enabled / winback_lapse_days) — is owned by the Campaigns
    // page (saveCampaign in app/drip/actions.ts) and deliberately NOT written
    // here. Configure no longer renders those inputs, so writing them from this
    // form would blank them on every save. The legacy drip_per_day /
    // drip_active_window_minutes columns are unread by the runtime and dropped.

    // VIP / recurring Star subscriptions were removed from the dashboard on
    // 2026-07-29. subscriptions_enabled and subscription_tiers are deliberately
    // NOT written here any more: there is no UI for them, so writing them would
    // send false / [] on every save and wipe whatever is stored. The columns
    // stay in the DB (additive-only convention) and the bot keeps reading them,
    // so existing values are frozen exactly as they were. Do not re-add these
    // two keys without also re-adding real form inputs for them.

    // out-of-messages (paywall) flow
    smart_paywall_enabled: fd.get("smart_paywall_enabled") === "true",
    paywall_as_voice: fd.get("paywall_as_voice") === "true",
    paywall_instruction: str(fd, "paywall_instruction"),
    paywall_default_message: str(fd, "paywall_default_message"),
    paywall_button_label: str(fd, "paywall_button_label"),

    // pre-lock prime + post-lock resume (migration 069). Toggles use the
    // "true"/"false" hidden-input convention; media/instruction null = auto.
    // (The onboarding_free_preview_* columns are owned by saveCampaign, not here.)
    paywall_prime_enabled: fd.get("paywall_prime_enabled") === "true",
    paywall_prime_before: Math.max(1, num(fd, "paywall_prime_before", 3)),
    paywall_prime_instruction: str(fd, "paywall_prime_instruction"),
    paywall_prime_as_voice: fd.get("paywall_prime_as_voice") === "true",
    paywall_resume_enabled: fd.get("paywall_resume_enabled") === "true",
    paywall_resume_instruction: str(fd, "paywall_resume_instruction"),
    paywall_resume_media_id: str(fd, "paywall_resume_media_id"),
    paywall_resume_free: fd.get("paywall_resume_free") === "true",

    // The monetization-sequence cards were removed on 2026-07-27 (operator
    // decision), so those columns are no longer written here. voice_cooldown_turns
    // is kept, its control lives elsewhere and is still on the form.
    voice_cooldown_turns: Math.max(0, num(fd, "voice_cooldown_turns", 2)),

    // Restored 2026-07-29 (D6/D4): offer_pending_minutes, discount_slowdown_minutes
    // and offer_redirect_cap are STILL READ BY THE BOT (the open-offer pending
    // window, the discount quiet-gap trigger, and the redirect cap — see
    // flows/offer-state.ts and flows/actions.ts) but had no dashboard control at
    // all, so a clone's real value could never be tuned. Controls are back on the
    // Advanced tab's Discounts / Offer follow-up cards; write them here again.
    //
    // MONEY-BRAKE FIX (2026-07-29): both minute windows used to fall back to 0
    // and clamp at 0. Two separate ways that stored a literal 0, and mapClone's
    // `?? 15` (bot/src/data/supabase-store.ts) only rescues NULL, never 0:
    //   1. the field missing from the FormData (any save issued from a form that
    //      does not render the Advanced tab) took the `0` fallback;
    //   2. a clone row holding NULL renders the slider at 0 (useCloneConfig's
    //      `clone?.offer_pending_minutes ?? 0`), so Create and the first Save on
    //      any pre-migration clone posted a literal 0.
    // A stored 0 is never a legitimate configuration for either field, so both
    // now default to the bot-side default (15) when absent and clamp at a
    // 1-minute floor:
    //   offer_pending_minutes = 0  → hasPendingUnpaidOffer() is `mins < 0`, i.e.
    //     permanently FALSE. That silently disables four live guards at once: the
    //     free-media revenue leak guard in guardedMedia()/guardedPitch(), the
    //     anti-hallucination openOfferDirective(), the paymentClaimCorrection()
    //     backstop, and the spoil gate in flows/text.ts. It ALSO makes
    //     offerWasIgnored() (`mins >= 0`) permanently TRUE, so the discount gate
    //     opens the instant an offer goes out. Both directions are wrong.
    //   discount_slowdown_minutes = 0 → conversationSlowed() is `mins >= 0`, i.e.
    //     permanently TRUE, so discountEligible() is true for every fan on every
    //     turn whenever discounts are on. The UI cannot tell a deliberate 0 from
    //     an unset column, so accepting 0 means a silently zeroed brake is
    //     indistinguishable from an operator choice. A 1-minute floor is
    //     behaviourally identical to "always eligible" for any real conversation
    //     while removing the permanently-true failure mode.
    // Per bot/CLAUDE.md, these are brakes on money, not features. Removing a
    // brake makes her pushier with money, so they fail safe, not open.
    offer_pending_minutes: Math.max(1, num(fd, "offer_pending_minutes", 15)),
    discount_slowdown_minutes: Math.max(1, num(fd, "discount_slowdown_minutes", 15)),
    offer_redirect_cap: Math.max(1, num(fd, "offer_redirect_cap", 3)),
    // Migration 085 (D7) decline brake. Same money-brake floor/default
    // reasoning as offer_redirect_cap right above: a stored 0 would mean
    // "she never speaks again after one refusal", which is never a
    // legitimate operator choice, so this fails safe at a 1-decline floor
    // instead, and defaults to the bot-side default (3) when absent.
    offer_decline_cap: Math.max(1, num(fd, "offer_decline_cap", 3)),
    // Restored 2026-07-29 (D6): read by services/profile-extractor.ts to steer
    // what it prioritizes capturing into the fan's profile dossier. Unrelated to
    // the onboarding step engine (that reads onboarding_steps, not this).
    onboarding_collect_fields: parseCollectFields(fd),

    response_wait_min: num(fd, "response_wait_min", 0),
    response_wait_max: num(fd, "response_wait_max", 0),
    // Message-catch wait (migration 072) — standalone dial, reintroduced
    // separately from the rest of the removed "response pacing" bundle below.
    message_catch_wait_seconds: Math.min(14, Math.max(0, num(fd, "message_catch_wait_seconds", 3))),
    memory_window: Math.min(100, Math.max(1, num(fd, "memory_window", 24))),

    // Response pacing was removed on 2026-07-27 (operator decision), so the
    // read_delay_*, typing_stutter_*, pacing_* and batch_wait_* columns are no
    // longer written. They keep their existing DB values, deliberately unread
    // by the bot, which is back to instant read, flat wait, continuous typing.

    // response length (migrations 037/038). Blank or 0 → null (unlimited); the DB
    // column has a `> 0` check constraint, so 0 must never be written literally.
    max_response_words: (() => {
      const n = numOrNull(fd, "max_response_words");
      return n && n > 0 ? n : null;
    })(),
    match_user_length: fd.get("match_user_length") === "true",
    // Migration 091. Same blank/0 -> null handling as the ceiling above: the
    // column's check constraint rejects anything outside 5..400, so a blank
    // box must become null rather than 0.
    target_response_words: (() => {
      const n = numOrNull(fd, "target_response_words");
      return n && n > 0 ? n : null;
    })(),
    gap_awareness_enabled: fd.get("gap_awareness_enabled") === "true",
    random_voice_enabled: fd.get("random_voice_enabled") === "true",
    random_voice_chance: num(fd, "random_voice_chance", 15),

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
// target_response_words is migration 091, which is NOT applied yet — listing
// it here is what stops a save from failing outright against a database that
// does not have the column, exactly as 037/038 needed when they were new.
const RESPONSE_LENGTH_COLUMNS = ["max_response_words", "match_user_length", "target_response_words"] as const;
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
// Migration 042 — imperfection profile levels. See bot/db/migrations/042_imperfection_levels.sql.
const IMPERFECTION_LEVEL_COLUMNS = [
  "lowercase_level", "punctuation_drop_level", "typo_level", "double_text_level",
] as const;
// Migration 060: life canon (hobbies, pets, living situation). See bot/db/migrations/060_life_canon.sql.
const LIFE_CANON_COLUMNS = ["hobbies", "has_pets", "pet_details", "living_situation"] as const;
// Migration 063: favorites/catchphrases/saving-goal canon. See bot/db/migrations/063_favorites_canon.sql.
const FAVORITES_COLUMNS = ["catchphrases", "favorite_things", "dislikes", "saving_goal"] as const;
// Migration 065: how many of her own most recent outbound turns must NOT have
// been a voice note before Smart mode's decider will let "voice" fire again.
// See bot/db/migrations/065_voice_cooldown.sql and bot/src/flows/smart.ts.
const VOICE_COOLDOWN_COLUMNS = ["voice_cooldown_turns"] as const;
// Migration 069: onboarding free-preview fallback + pre-lock prime + post-lock
// resume. The onboarding_free_preview_* columns are written by saveCampaign
// (app/drip/actions.ts), the paywall_prime_*/paywall_resume_* columns by
// rowFromForm above; all listed here so the missing-column retry strips whichever
// ones this row happens to carry when the migration is not applied yet.
// See bot/db/migrations/069_*.sql.
const FLOW_069_COLUMNS = [
  "onboarding_free_preview_enabled", "onboarding_free_preview_after_minutes",
  "onboarding_free_preview_after_messages", "onboarding_free_preview_media_id",
  "paywall_prime_enabled", "paywall_prime_before", "paywall_prime_instruction",
  "paywall_prime_as_voice", "paywall_resume_enabled", "paywall_resume_instruction",
  "paywall_resume_media_id", "paywall_resume_free",
] as const;
// Migration 070: randomized voice + gap awareness. See bot/db/migrations/070_*.sql.
const FLOW_070_COLUMNS = [
  "random_voice_enabled", "random_voice_chance", "gap_awareness_enabled",
] as const;
// Migration 072: message-catch wait. See bot/db/migrations/072_*.sql.
const FLOW_072_COLUMNS = ["message_catch_wait_seconds"] as const;
// Never-resend toggle (D5(i), Track D migration applied 2026-07-29 in parallel
// with this dashboard work). Listed so a save issued before that migration
// lands strips the column and still succeeds, instead of failing the whole save.
const MEDIA_RESEND_COLUMNS = ["media_allow_resend"] as const;
// Migration 080: tip_push_level + greeting_ask_age. Both verified applied on
// aouaenqayfltoqrmpitg 2026-07-29; listed anyway so the same save still works
// against a stack where 080 has not run yet.
// NOTE: migration 082 (the widened push/sexual/nsfw CHECKs) needs no entry here
// because it adds no column, it only relaxes a constraint on existing ones.
const DIAL_080_COLUMNS = ["tip_push_level", "greeting_ask_age"] as const;
// Migration 084: fan_time_mode + the two tip re-ask brakes. Verified applied on
// aouaenqayfltoqrmpitg 2026-07-29; listed anyway so a save still succeeds
// against a stack where 084 has not run yet, instead of failing wholesale.
// See bot/db/migrations/084_fan_time_and_tip_reask.sql.
const FLOW_084_COLUMNS = [
  "fan_time_mode", "tip_reask_cooldown_seconds", "tip_reask_after_paid",
] as const;
// Migration 085 (D7): decline brake cap. Applied to aouaenqayfltoqrmpitg as
// part of this same change; listed anyway so a save still succeeds against a
// stack where 085 has not run yet, instead of failing wholesale.
// See bot/db/migrations/085_decline_brake.sql.
const FLOW_085_COLUMNS = ["offer_decline_cap"] as const;
// Migration 086: the four warmth-side dials. Listed so a save issued before 086
// is applied strips them and still succeeds, instead of failing wholesale.
// Stripping them is safe by construction: absent columns read back as "medium"
// in both mappers, and "medium" emits no prompt text, so a pre-migration save
// degrades to exactly today's behaviour rather than to a silent tone change.
// See bot/db/migrations/086_warmth_dials.sql.
const DIAL_086_COLUMNS = [
  "warmth_level", "curiosity_level", "playfulness_level", "attentiveness_level",
] as const;
// Migration 088: a tip grants message credits at this rate. Listed so a save
// issued before 088 is applied strips it and still succeeds. Stripping is safe:
// the column is absent, the bot's mapClone reads it as 0, and 0 is exactly the
// pre-088 behaviour (a tip grants nothing). It degrades to today, never to a
// silent money change. See bot/db/migrations/088_tip_credits.sql.
const MONEY_088_COLUMNS = ["tip_credits_per_100_stars"] as const;
// Migration 090: the price guard's mode. Listed so a save issued against a
// stack where 090 has not run yet strips it and still succeeds rather than
// failing wholesale. Stripping is safe and, unusually, strictly SAFER than the
// alternative: with the column absent the bot's mapClone falls back to "block",
// so a pre-090 save leaves the guard armed rather than silently disarming it.
// See bot/db/migrations/090_price_guard_mode.sql.
const MONEY_090_COLUMNS = ["price_guard_mode"] as const;
// Migration 093: the silence-fallback kill switch. Listed so a save issued
// against a stack where 093 has not run yet strips it and still succeeds.
// Stripping is safe and degrades to today: with the column absent the bot's
// mapClone (supabase-store.ts:1313) reads it as "on", which is the behaviour
// every clone has had since the module was written. As with 090, the stripped
// state is the SAFE one - a pre-093 save leaves the recovery line switched on
// rather than silently ghosting fans.
// See bot/db/migrations/093_silence_fallback_mode.sql.
const FLOW_093_COLUMNS = ["silence_fallback_mode"] as const;
// The response-pacing, monetization-sequence, re-warm-photo and
// offer-redirect column lists were removed on 2026-07-27: those columns are no
// longer written by this form at all, so they cannot appear in the row that
// the missing-column retry path strips.
const OPTIONAL_COLUMNS = [
  ...PERSONA_FACT_COLUMNS,
  ...RESPONSE_LENGTH_COLUMNS,
  ...IDENTITY_CANON_COLUMNS,
  ...PHOTO_VISION_COLUMNS,
  ...IMPERFECTION_LEVEL_COLUMNS,
  ...LIFE_CANON_COLUMNS,
  ...FAVORITES_COLUMNS,
  ...VOICE_COOLDOWN_COLUMNS,
  ...FLOW_069_COLUMNS,
  ...FLOW_070_COLUMNS,
  ...FLOW_072_COLUMNS,
  ...MEDIA_RESEND_COLUMNS,
  ...DIAL_080_COLUMNS,
  ...FLOW_084_COLUMNS,
  ...FLOW_085_COLUMNS,
  ...DIAL_086_COLUMNS,
  ...MONEY_088_COLUMNS,
  ...MONEY_090_COLUMNS,
  ...FLOW_093_COLUMNS,
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

// Two clones must never share one bot_token. There is no unique index on the
// column, and the runtime's getCloneByBotToken() uses .maybeSingle(), so a
// duplicate makes that lookup return an error plus a NULL clone: the bot goes
// silently dead for BOTH clones while looking perfectly configured in here.
// Guard at the only two places a token is written, with a message the operator
// can act on. `excludeId` skips the row being edited.
async function assertBotTokenFree(botToken: string, excludeId?: string): Promise<void> {
  let q = supabaseAdmin.from("clones").select("slug").eq("bot_token", botToken);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  // A failed check must not block a legitimate save; the insert still runs.
  if (error) return;
  if (data && data.length > 0) {
    throw new Error(
      `That bot token is already used by the clone "${data[0].slug}". Each clone needs its own token from @BotFather, sharing one takes both bots offline.`,
    );
  }
}

// ── DEFAULT CAMPAIGN: 4 STEPS ON A BRAND-NEW CLONE (2026-07-29) ──────────────
// Operator ask: "default drip campaigns to 4 steps". There was no default of any
// kind before this: clones.drip_steps has no DB default (migration 030 adds a
// plain jsonb column), rowFromForm() never wrote the key, and the Campaigns page
// renders whatever is stored, so every new clone started with an EMPTY campaign
// and drip_enabled=true, i.e. a re-engagement feature switched on with nothing to
// send. Seeded here, at insert, and ONLY here, on purpose: seeding it in the
// Campaigns form instead would show 4 phantom steps to every EXISTING clone that
// deliberately has none (the two states are indistinguishable once saved), and
// the operator saving any unrelated field on that page would silently arm a
// campaign on a live clone. This way an existing clone is never touched.
//
// All four are TEXT steps. Text is the one step type that always delivers (AI
// composes the line fresh in her voice) and the one that sells nothing, so the
// default is a safe re-engagement rhythm the operator then edits. Hours are
// spread across Telegram's 24h messaging window, and every offset is inside the
// 1-23 range the Campaigns form enforces. Shape must match what the runtime
// reads: {type, after_hours} (see mapClone -> campaignSteps, bot/src/campaign.ts).
const DEFAULT_DRIP_STEPS = [
  { type: "text", after_hours: 2 },
  { type: "text", after_hours: 6 },
  { type: "text", after_hours: 12 },
  { type: "text", after_hours: 20 },
] as const;

// Step 1 of the one-page create flow: insert the clone row from settings only
// (prompts compiled later, media uploaded later by the client). Returns the new id.
export async function createCloneRow(fd: FormData): Promise<string> {
  const name = str(fd, "name");
  const bot_token = str(fd, "bot_token");
  if (!name || !bot_token) throw new Error("Name and bot token are required");

  const slug = slugify(name);
  // `slug` is NOT NULL and UNIQUE. slugify() strips everything non-alphanumeric,
  // so a name like "???" yields "" and a repeated name yields a collision; both
  // surface as a raw Postgres unique-violation string. Check first and say what
  // the operator actually has to change.
  if (!slug) throw new Error("Name needs at least one letter or number.");
  const { data: slugTaken } = await supabaseAdmin.from("clones").select("id").eq("slug", slug).limit(1);
  if (slugTaken && slugTaken.length > 0) {
    throw new Error(`A clone named "${name}" already exists. Pick a different name.`);
  }
  await assertBotTokenFree(bot_token);

  const row = { ...rowFromForm(fd), slug, drip_steps: DEFAULT_DRIP_STEPS };
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
  const image = fd.get("dashboard_profile_image");
  const previousImagePath = str(fd, "dashboard_profile_image_path");
  let uploadedImagePath: string | null = null;

  if (image instanceof File && image.size > 0) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(image.type)) throw new Error("Profile image must be JPG, PNG, WebP or GIF.");
    if (image.size > 5 * 1024 * 1024) throw new Error("Profile image must be 5 MB or smaller.");

    const ext = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : image.type === "image/gif" ? "gif" : "jpg";
    uploadedImagePath = `${id}/profile/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("media")
      .upload(uploadedImagePath, await image.arrayBuffer(), { contentType: image.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    fd.set("dashboard_profile_image_path", uploadedImagePath);
  }

  const row = rowFromForm(fd);
  if (row.bot_token) await assertBotTokenFree(row.bot_token, id);

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
  if (error) {
    if (uploadedImagePath) await supabaseAdmin.storage.from("media").remove([uploadedImagePath]);
    throw new Error(error.message);
  }

  if (uploadedImagePath && previousImagePath && previousImagePath !== uploadedImagePath && previousImagePath.startsWith(`${id}/profile/`)) {
    await supabaseAdmin.storage.from("media").remove([previousImagePath]);
  }

  // Rebuild her persona slots on EVERY save. This used to be gated on "her
  // answers changed" because each rebuild cost an LLM call; it is now a pure
  // function (lib/persona-build.ts), so gating it only creates the bug where a
  // changed vibe preset or a cleared entry leaves stale persona text live.
  await compileClone(id);

  revalidatePath("/");
  revalidatePath("/revenue");
  revalidatePath("/clones");
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
