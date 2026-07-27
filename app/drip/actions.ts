"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

function num(fd: FormData, key: string, fallback: number): number {
  const v = fd.get(key);
  if (v === null || String(v).trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Hand-picked media arrives as a JSON string in a hidden field. Coerce to a clean
// [{type,id}] list (only photo/video, non-empty id) so the runtime is money/lookup safe.
function parseMediaIds(fd: FormData): { type: "photo" | "video" | "bundle"; id: string }[] {
  const raw = fd.get("drip_media_ids");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: { type: "photo" | "video" | "bundle"; id: string }[] = [];
    for (const m of arr) {
      const type = m?.type === "video" ? "video" : m?.type === "photo" ? "photo" : m?.type === "bundle" ? "bundle" : null;
      const id = String(m?.id ?? "").trim();
      if (!type || !id) continue;
      const key = `${type}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type, id });
    }
    return out;
  } catch {
    return [];
  }
}

// Campaign steps arrive as a JSON string in a hidden field. Coerce to the clean
// timed shape [{type, after_hours}] the runtime reads (campaign.ts): known types
// only, hour offset clamped to 1-23 (always inside Telegram's 24h messaging
// window), sorted by hour so the stored list IS the firing order.
const STEP_TYPES = ["text", "voice", "photo", "video", "bundle"] as const;
type StepType = (typeof STEP_TYPES)[number];
type StepOut = { type: StepType; after_hours: number; media_id?: string };
function parseSteps(fd: FormData): StepOut[] {
  const raw = fd.get("drip_steps");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    const out: StepOut[] = [];
    for (const s of arr) {
      const type = STEP_TYPES.includes(s?.type) ? (s.type as StepType) : null;
      if (!type) continue;
      const hours = Math.round(Number(s?.after_hours));
      if (!Number.isFinite(hours)) continue;
      const step: StepOut = { type, after_hours: Math.min(23, Math.max(1, hours)) };
      // Per-step hand-picked media (photo/video/bundle only). Blank = AI auto-picks.
      const mediaId = String(s?.media_id ?? "").trim();
      if (mediaId && (type === "photo" || type === "video" || type === "bundle")) step.media_id = mediaId;
      out.push(step);
    }
    return out.sort((a, b) => a.after_hours - b.after_hours);
  } catch {
    return [];
  }
}

// Onboarding steps arrive as a JSON string in a hidden field (same pattern as
// drip_steps above). Coerce to the shape the runtime reads (bot/src/onboarding.ts):
// known types only, after_messages clamped to 1-50, media_id/free for photo/
// video/bundle steps only, collect_field for collect steps only. Unlike
// drip_steps, this is NOT re-sorted — onboarding fires sequentially through the
// array in the operator's saved order (see migration 068's writeup on why the
// fire-once tracking is an array of indexes, not a counter: reordering must stay
// safe, which only holds if the runtime respects the order actually saved).
const ONBOARDING_STEP_TYPES = ["text", "voice", "photo", "video", "bundle", "collect", "tease"] as const;
type OnboardingStepType = (typeof ONBOARDING_STEP_TYPES)[number];
type OnboardingStepOut = {
  type: OnboardingStepType;
  after_messages: number;
  media_id?: string;
  free?: boolean;
  collect_field?: string;
};
function parseOnboardingSteps(fd: FormData): OnboardingStepOut[] {
  const raw = fd.get("onboarding_steps");
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    const out: OnboardingStepOut[] = [];
    for (const s of arr) {
      const type = ONBOARDING_STEP_TYPES.includes(s?.type) ? (s.type as OnboardingStepType) : null;
      if (!type) continue;
      const afterRaw = Math.round(Number(s?.after_messages));
      if (!Number.isFinite(afterRaw)) continue;
      const step: OnboardingStepOut = { type, after_messages: Math.min(50, Math.max(1, afterRaw)) };
      const isMedia = type === "photo" || type === "video" || type === "bundle";
      if (isMedia) {
        const mediaId = String(s?.media_id ?? "").trim();
        if (mediaId) step.media_id = mediaId;
        if (s?.free === true) step.free = true;
      }
      if (type === "collect") {
        const collectField = String(s?.collect_field ?? "").trim();
        if (collectField) step.collect_field = collectField;
      }
      out.push(step);
    }
    return out;
  } catch {
    return [];
  }
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  const s = v === null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function numOrNull(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

// Save the Campaigns page: every outbound-engagement setting for the clone —
// the new-fan onboarding flow, the mid-chat follow-up, the automated campaign's
// step list, the win-back lapse, and the hand-picked media pool.
//
// These onboarding/follow-up columns used to be written by updateClone (the
// Configure page's Engagement tab). They are owned HERE now and deliberately
// removed from updateClone — if both wrote them, whichever page you saved last
// would clobber the other. The legacy cadence columns (drip_per_day /
// drip_active_window_minutes / drip_mode / drip_sequence / drip_step_mode) are
// no longer read by the runtime and are never written here.
export async function saveCampaign(id: string, fd: FormData) {
  const row: Record<string, unknown> = {
    // New-fan onboarding
    welcome_instruction: str(fd, "welcome_instruction"),
    welcome_bundle_after: num(fd, "welcome_bundle_after", 10),
    welcome_bundle_after_minutes: numOrNull(fd, "welcome_bundle_after_minutes"),
    welcome_bundle_teased: fd.get("welcome_bundle_teased") === "true",
    onboarding_voice_after: numOrNull(fd, "onboarding_voice_after"),
    onboarding_voice_instruction: str(fd, "onboarding_voice_instruction"),
    onboarding_collect_fields: parseCollectFields(fd),
    onboarding_length: Math.max(1, num(fd, "onboarding_length", 8)),
    // Ordered onboarding step list (migration 068) — additive, see
    // parseOnboardingSteps above. Legacy onboarding_voice_after/
    // welcome_bundle_after/welcome_bundle_teased/onboarding_collect_fields
    // above are still written unconditionally (never touched by this column)
    // so an unmigrated clone's config is untouched by saving this page.
    onboarding_steps: parseOnboardingSteps(fd),
    // Mid-chat follow-up
    followup_after_minutes: Math.max(0, num(fd, "followup_after_minutes", 0)),
    // Campaign. (Win-back's lapse threshold is no longer operator-facing; the
    // runtime uses a fixed default — see isReturningLapsedSpender in campaign.ts.)
    drip_enabled: fd.get("drip_enabled") === "true",
    drip_media_ids: parseMediaIds(fd),
    drip_steps: parseSteps(fd),
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabaseAdmin.from("clones").update(row).eq("id", id);
  if (error && /drip_steps/i.test(error.message)) {
    // Migration 029 not applied yet: save everything else so the page still works.
    const { drip_steps: _s, ...rest } = row;
    ({ error } = await supabaseAdmin.from("clones").update(rest).eq("id", id));
  }
  if (error && /onboarding_steps/i.test(error.message)) {
    // Migration 068 not applied yet: save everything else so the page still works.
    const { onboarding_steps: _o, ...rest } = row;
    ({ error } = await supabaseAdmin.from("clones").update(rest).eq("id", id));
  }
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/clones/${id}`);
  revalidatePath("/drip");
}
