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
const DEFAULT_NUMBERS = [
  "starting_credits", "credit_pack_size", "credit_pack_price_stars",
  "discount_max_photo", "discount_max_video", "discount_max_bundle", "discount_max_credits",
  "welcome_bundle_after", "welcome_bundle_after_minutes", "onboarding_voice_after",
  "drip_per_day", "drip_active_window_minutes", "winback_lapse_days", "followup_after_minutes",
  "response_wait_min", "response_wait_max", "memory_window",
  "voice_stability", "voice_similarity", "voice_style", "voice_speed",
] as const;
// JSON blobs (hidden inputs carry a stringified object/array) — parsed + stored.
const DEFAULT_JSON = ["category_pricing", "spoil_options", "subscription_tiers"] as const;
const DEFAULT_MODELS = [
  "text_model", "voice_model", "media_model", "routing_model",
  "photo_reply_model", "vision_model", "voice_enhance_model",
] as const;

export async function getCloneDefaults(): Promise<CloneDefaults> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", CLONE_DEFAULTS_KEY).maybeSingle();
  if (!data?.value) return {};
  try {
    const parsed = JSON.parse(String(data.value));
    return parsed && typeof parsed === "object" ? (parsed as CloneDefaults) : {};
  } catch {
    return {};
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
