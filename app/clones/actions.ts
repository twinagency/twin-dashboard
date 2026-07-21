"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { compileClone } from "@/lib/compiler";
import { INTAKE_FIELD_KEYS, assembleAnswers } from "@/lib/intake";
import { vibePresetFor } from "@/lib/vibes";

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
  return {
    "Date of birth": str(fd, "date_of_birth") ?? "",
    Gender: str(fd, "gender") ?? "",
    Height: str(fd, "height") ?? "",
    "Ethnicity / heritage": str(fd, "ethnicity") ?? "",
    Sexuality: str(fd, "sexuality") ?? "",
    Hometown: str(fd, "hometown") ?? "",
    "Current city": str(fd, "current_city") ?? "",
    "Job (what she tells fans)": str(fd, "occupation") ?? "",
    "Social handles": socials,
    "Pet names she calls fans": parseJsonStringArray(fd, "fan_nicknames").join(", "),
    "Vibe / archetype": vibe && vibe.value !== "custom" ? `${vibe.label} (${vibe.blurb})` : "",
    "Turn-ons": parseJsonStringArray(fd, "turn_ons").join(", "),
    "Turn-offs": parseJsonStringArray(fd, "turn_offs").join(", "),
    "Hard limits (checklist)": parseJsonStringArray(fd, "hard_limits").join(", "),
    "Hard limits (extra)": str(fd, "hard_limits_extra") ?? "",
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
    ...(fd.has("persona_facts")
      ? {
          date_of_birth: str(fd, "date_of_birth"),
          gender: str(fd, "gender"),
          height: str(fd, "height"),
          ethnicity: str(fd, "ethnicity"),
          sexuality: str(fd, "sexuality"),
          hometown: str(fd, "hometown"),
          current_city: str(fd, "current_city"),
          occupation: str(fd, "occupation"),
          socials: parseSocials(fd),
          fan_nicknames: parseJsonStringArray(fd, "fan_nicknames"),
          vibe_preset: str(fd, "vibe_preset"),
          turn_ons: parseJsonStringArray(fd, "turn_ons"),
          turn_offs: parseJsonStringArray(fd, "turn_offs"),
          hard_limits: parseJsonStringArray(fd, "hard_limits"),
          hard_limits_extra: str(fd, "hard_limits_extra"),
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

    response_wait_min: num(fd, "response_wait_min", 0),
    response_wait_max: num(fd, "response_wait_max", 0),
    memory_window: Math.min(100, Math.max(1, num(fd, "memory_window", 24))),

    // Prompts: only included when the form actually sends them (the review/edit
    // form does; the create form doesn't — there the compile step fills them).
    ...(fd.has("text_prompt") ? { text_prompt: str(fd, "text_prompt") } : {}),
    ...(fd.has("voice_prompt") ? { voice_prompt: str(fd, "voice_prompt") } : {}),
    ...(fd.has("routing_prompt") ? { routing_prompt: str(fd, "routing_prompt") } : {}),
    ...(fd.has("photo_reply_prompt") ? { photo_reply_prompt: str(fd, "photo_reply_prompt") } : {}),
  };
}

// The migration-033 columns. Pre-migration (columns absent) a write including
// them fails with PostgREST's missing-column error — writeClone retries without
// them so a save never crashes; the typed facts just aren't persisted until
// migration 033 is applied.
const PERSONA_FACT_COLUMNS = [
  "date_of_birth", "gender", "height", "ethnicity", "sexuality", "hometown",
  "current_city", "occupation", "socials", "fan_nicknames", "vibe_preset",
  "turn_ons", "turn_offs", "hard_limits", "hard_limits_extra",
] as const;

function withoutPersonaFactColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const c of PERSONA_FACT_COLUMNS) delete copy[c];
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
