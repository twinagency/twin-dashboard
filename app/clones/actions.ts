"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { compileClone } from "@/lib/compiler";
import { INTAKE_FIELD_KEYS, assembleAnswers } from "@/lib/intake";

// Gather the structured intake_<key> fields into { fields, answers } where
// `answers` is the labelled blob the AI compiler reads. Falls back to the legacy
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
  return { fields, answers: assembleAnswers(fields, name ?? undefined) };
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
    thank_you_enabled: fd.get("thank_you_enabled") === "true",
    emojis_enabled: fd.get("emojis_enabled") === "true",
    emoji_amount: str(fd, "emoji_amount") ?? "medium",
    emoji_allowlist: str(fd, "emoji_allowlist"),
    sexual_level: str(fd, "sexual_level") ?? "medium",
    nsfw_level: str(fd, "nsfw_level") ?? "medium",
    push_level: str(fd, "push_level") ?? "medium",
    discounts_enabled: fd.get("discounts_enabled") === "true",
    discount_max_photo: Math.min(90, Math.max(0, num(fd, "discount_max_photo", 0))),
    discount_max_video: Math.min(90, Math.max(0, num(fd, "discount_max_video", 0))),
    discount_max_bundle: Math.min(90, Math.max(0, num(fd, "discount_max_bundle", 0))),
    discount_max_credits: Math.min(90, Math.max(0, num(fd, "discount_max_credits", 0))),
    spoil_options: parseSpoilOptions(fd),
    intake: intakeFromForm(fd, str(fd, "name")),

    text_model: str(fd, "text_model") ?? "deepseek/deepseek-v4-flash",
    voice_model: str(fd, "voice_model") ?? "deepseek/deepseek-v4-flash",
    media_model: str(fd, "media_model") ?? "deepseek/deepseek-v4-flash",
    routing_model: str(fd, "routing_model") ?? "openai/gpt-4.1-mini",
    voice_enhance_model: str(fd, "voice_enhance_model") ?? "openai/gpt-4.1-mini",
    photo_reply_model: str(fd, "photo_reply_model") ?? "qwen/qwen2.5-vl-72b-instruct",
    vision_model: str(fd, "vision_model") ?? "qwen/qwen2.5-vl-72b-instruct",

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

    // new-user (onboarding) flow
    welcome_instruction: str(fd, "welcome_instruction"),
    welcome_bundle_after: num(fd, "welcome_bundle_after", 10),
    welcome_bundle_after_minutes: numOrNull(fd, "welcome_bundle_after_minutes"),
    onboarding_voice_after: numOrNull(fd, "onboarding_voice_after"),

    // drip / re-engagement
    drip_enabled: fd.get("drip_enabled") === "true",
    drip_per_day: num(fd, "drip_per_day", 1),
    drip_active_window_minutes: num(fd, "drip_active_window_minutes", 360),

    // out-of-messages (paywall) flow
    smart_paywall_enabled: fd.get("smart_paywall_enabled") === "true",
    paywall_as_voice: fd.get("paywall_as_voice") === "true",
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
  const { data, error } = await supabaseAdmin.from("clones").insert(row).select("id").single();
  if (error) throw new Error(error.message);
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

  const { error } = await supabaseAdmin
    .from("clones")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);
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
