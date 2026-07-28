"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

function num(fd: FormData, key: string, fallback: number): number {
  const v = fd.get(key);
  if (v === null || String(v).trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// drip_media_ids (legacy global campaign media pool) is DELIBERATELY no longer
// written here (D9, 2026-07-29). Its picker UI was deleted but this action kept
// writing the column unconditionally; since the field is never present in the
// form anymore, every save silently wiped it to []. The per-step media picker
// (parseSteps below) replaces it more precisely. The column stays in the DB
// (additive rule) and campaign.ts's own read of it is being dropped by Track D
// in the bot repo — this file just stops being the thing that wipes it.

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
  instruction?: string;
};
// Step types that carry an optional per-step steer (AI-written line types).
const CAN_STEER_ONBOARDING = new Set<OnboardingStepType>(["text", "voice", "tease"]);
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
      // Per-step steer (migration 069), stored inside the jsonb, for AI-written
      // line types only, and only when non-empty.
      if (CAN_STEER_ONBOARDING.has(type)) {
        const instruction = String(s?.instruction ?? "").trim();
        if (instruction) step.instruction = instruction;
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
    // New-fan onboarding. The legacy loose fields (welcome_bundle_after[_minutes]
    // / welcome_bundle_teased / onboarding_voice_after / onboarding_voice_instruction
    // / onboarding_collect_fields / onboarding_length) were retired 2026-07-28:
    // the whole flow is now the greeting steer + the ordered step list. Those
    // columns are left untouched in the DB (additive rule), never written here.
    welcome_instruction: str(fd, "welcome_instruction"),
    // Ordered onboarding step list (migration 068). Per-step steer added in 069.
    onboarding_steps: parseOnboardingSteps(fd),
    // Free-preview fallback (migration 069). Either trigger fires (null = off);
    // media id null = she auto-picks. Written here (Campaigns owns onboarding).
    onboarding_free_preview_enabled: fd.get("onboarding_free_preview_enabled") === "true",
    onboarding_free_preview_after_minutes: numOrNull(fd, "onboarding_free_preview_after_minutes"),
    onboarding_free_preview_after_messages: numOrNull(fd, "onboarding_free_preview_after_messages"),
    onboarding_free_preview_media_id: str(fd, "onboarding_free_preview_media_id"),
    // Steer for the spoken lead-in line before the free photo (migration 073).
    onboarding_free_preview_instruction: str(fd, "onboarding_free_preview_instruction"),
    // Per-flow caption kill switch (migration 071) — overrides media_caption_mode
    // outright for that flow's photo/video/bundle sends.
    onboarding_captions_off: fd.get("onboarding_captions_off") === "true",
    // Mid-chat follow-up
    followup_after_minutes: Math.max(0, num(fd, "followup_after_minutes", 0)),
    // Campaign. (Win-back's lapse threshold is no longer operator-facing; the
    // runtime uses a fixed default — see isReturningLapsedSpender in campaign.ts.)
    drip_enabled: fd.get("drip_enabled") === "true",
    campaign_captions_off: fd.get("campaign_captions_off") === "true",
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
  if (error && /onboarding_free_preview_/i.test(error.message)) {
    // Migration 069 not applied yet: strip the free-preview columns and retry so
    // the rest of the page still saves (same additive-retry pattern as above).
    const {
      onboarding_free_preview_enabled: _fe,
      onboarding_free_preview_after_minutes: _fm,
      onboarding_free_preview_after_messages: _fc,
      onboarding_free_preview_media_id: _fi,
      onboarding_free_preview_instruction: _fii,
      ...rest
    } = row;
    ({ error } = await supabaseAdmin.from("clones").update(rest).eq("id", id));
  }
  if (error && /captions_off/i.test(error.message)) {
    // Migration 071 not applied yet: strip the caption kill switches and retry.
    const { onboarding_captions_off: _oc, campaign_captions_off: _cc, ...rest } = row;
    ({ error } = await supabaseAdmin.from("clones").update(rest).eq("id", id));
  }
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/clones/${id}`);
  revalidatePath("/drip");
}
