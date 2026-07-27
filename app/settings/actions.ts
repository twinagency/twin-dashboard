"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import type { Clone } from "@/lib/types";
import { API_KEY_FIELDS, CLONE_DEFAULTS_KEY } from "./fields";

export async function saveApiKeys(fd: FormData) {
  const now = new Date().toISOString();
  for (const { key } of API_KEY_FIELDS) {
    const v = String(fd.get(key) ?? "").trim();
    if (!v) continue; // blank = keep the existing key (don't wipe it)
    if (v === "__CLEAR__") {
      await supabaseAdmin.from("app_settings").delete().eq("key", key);
      continue;
    }
    await supabaseAdmin.from("app_settings").upsert({ key, value: v, updated_at: now });
  }
  revalidatePath("/settings");
}

// Which keys are currently set (for a masked status display — never returns the
// raw secret).
export async function getApiKeyStatus(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").in("key", API_KEY_FIELDS.map((f) => f.key));
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const v = String(r.value ?? "");
    if (v) out[r.key] = v.length > 4 ? `••••${v.slice(-4)}` : "••••";
  }
  return out;
}

// ── New-clone defaults ────────────────────────────────────────────────────────
// The template a fresh clone inherits (toggles/dials/models). Stored as one JSON
// blob in app_settings; CreateCloneForm seeds from it, falling back to the
// built-in defaults for anything unset. Field names match `clones` columns so
// they map straight through.
type CloneDefaults = Partial<Clone>;

const DEFAULT_TOGGLES = [
  "smart_split", "photos_enabled", "videos_enabled", "video_vision_enabled", "bundles_enabled",
  "voice_enabled", "charge_messages", "tips_enabled", "live_captions_enabled", "thank_you_enabled",
  "discounts_enabled", "drip_enabled", "emojis_enabled",
  "reactions_enabled", "read_receipts_enabled", "message_effects_enabled", "ai_disclosure",
  "subscriptions_enabled", "smart_paywall_enabled", "paywall_as_voice", "voice_speaker_boost",
] as const;
// Enum selects + free-text strings — stored verbatim when non-empty.
const DEFAULT_SELECTS = [
  "ai_mode", "sexual_level", "nsfw_level", "push_level", "emoji_amount", "media_caption_mode",
  "emoji_allowlist", "welcome_instruction", "onboarding_voice_instruction", "paywall_instruction",
  "paywall_default_message", "paywall_button_label", "eleven_model",
] as const;
// Numeric dials/fields — stored as numbers (ints and floats both fine via Number()).
// NOTE: drip_per_day / drip_active_window_minutes stay listed for harmless
// backward-compat parsing, but CloneDefaultsForm never renders inputs named
// this, so fd.get() is always null and these never actually get written. Both
// columns are dead: superseded by drip_steps (migration 029/030), see the
// comment in app/drip/actions.ts. winback_lapse_days was removed 2026-07-27
// (CloneDefaultsForm no longer renders it either) — the runtime hardcodes a
// fixed 7-day win-back lapse, see isReturningLapsedSpender in bot/src/campaign.ts.
const DEFAULT_NUMBERS = [
  "starting_credits", "credit_pack_size", "credit_pack_price_stars",
  "discount_max_photo", "discount_max_video", "discount_max_bundle", "discount_max_credits",
  "welcome_bundle_after", "welcome_bundle_after_minutes", "onboarding_voice_after",
  "drip_per_day", "drip_active_window_minutes", "followup_after_minutes",
  "response_wait_min", "response_wait_max", "memory_window",
  "voice_stability", "voice_similarity", "voice_style", "voice_speed",
] as const;
// JSON blobs (hidden inputs carry a stringified object/array) — parsed + stored.
const DEFAULT_JSON = ["category_pricing", "spoil_options", "subscription_tiers"] as const;
const DEFAULT_MODELS = [
  "text_model", "voice_model", "media_model", "routing_model",
  "photo_reply_model", "vision_model", "voice_enhance_model",
] as const;

// Built-in fallback for anything the owner hasn't set a template value for yet.
// Every entry here exists because useCloneConfig's `initial()` falls back to a
// plain `?? 0` / `?? false` for that field, which DISAGREES with the `clones`
// column's own DB default (set by a later migration, after useCloneConfig was
// first written). Without an entry here, a fresh Create form with no saved
// template silently starts these at the OLD broken value instead of the DB's
// real default, so a new clone is written with that broken value baked in
// forever (rowFromForm always sends these fields, so the DB column default
// never gets a chance to apply on insert). Confirmed against the migration
// that introduced each default:
//   videos_enabled                    -> true   (clones table default)
//   discount_max_photo/video/bundle/credits -> 15/20/25/10 (migration 043:
//     discounts_enabled defaults false and is untouched, but if an operator
//     later flips it on for a clone that inherited 0 caps, haggling silently
//     never moves the price at all - see 043_discount_cap_defaults.sql)
//   response_wait_min/max             -> 8/45  (migration 055)
//   read_delay_min/max                -> 2/9   (migration 055)
//   typing_stutter_enabled            -> true  (migration 055)
//   pacing_ramp_messages              -> 25    (migration 055)
//   pacing_new_wait_min/max           -> 20/75 (migration 055)
//   pacing_established_wait_min/max   -> 6/30  (migration 055)
// Migration 055's own comment: "the whole response-pacing feature" was
// launched fully inert because every column defaulted to 0/null/false - the
// same failure mode this object exists to stop from happening again in the
// dashboard's own create-flow default. A saved template value (including an
// explicit "off"/0) always wins over anything here.
const BUILTIN_CLONE_DEFAULTS: CloneDefaults = {
  videos_enabled: true,
  discount_max_photo: 15,
  discount_max_video: 20,
  discount_max_bundle: 25,
  discount_max_credits: 10,
  response_wait_min: 8,
  response_wait_max: 45,
  // The response-pacing defaults (read delay, typing stutter, the ramp) were
  // removed on 2026-07-27 along with the feature itself. The flat
  // response_wait_min/max above is the whole pacing story now.
};

export async function getCloneDefaults(): Promise<CloneDefaults> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", CLONE_DEFAULTS_KEY).maybeSingle();
  if (!data?.value) return { ...BUILTIN_CLONE_DEFAULTS };
  try {
    const parsed = JSON.parse(String(data.value));
    return parsed && typeof parsed === "object"
      ? { ...BUILTIN_CLONE_DEFAULTS, ...(parsed as CloneDefaults) }
      : { ...BUILTIN_CLONE_DEFAULTS };
  } catch {
    return { ...BUILTIN_CLONE_DEFAULTS };
  }
}

export async function saveCloneDefaults(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const k of DEFAULT_SELECTS) {
    const v = fd.get(k);
    if (v != null && String(v).trim() !== "") out[k] = String(v);
  }
  for (const k of DEFAULT_TOGGLES) {
    const v = fd.get(k);
    if (v != null) out[k] = String(v) === "true";
  }
  for (const k of DEFAULT_NUMBERS) {
    const v = fd.get(k);
    if (v == null || String(v).trim() === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  for (const k of DEFAULT_JSON) {
    const raw = fd.get(k);
    if (raw == null) continue;
    try {
      const parsed = JSON.parse(String(raw));
      // Only persist a usable value: a non-empty object (category_pricing) or a
      // non-empty array (spoil_options / subscription_tiers). Empty → fall back.
      if (Array.isArray(parsed)) {
        if (parsed.length) out[k] = parsed;
      } else if (parsed && typeof parsed === "object" && Object.keys(parsed).length) {
        out[k] = parsed;
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  for (const k of DEFAULT_MODELS) {
    const v = fd.get(k);
    if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
  }
  await supabaseAdmin.from("app_settings").upsert({
    key: CLONE_DEFAULTS_KEY,
    value: JSON.stringify(out),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/settings");
  revalidatePath("/clones/new");
}
