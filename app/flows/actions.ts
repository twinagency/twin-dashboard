"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { revalidatePath } from "next/cache";
import { invalidateCloneCaches } from "@/lib/query-cache";
import { randomUUID } from "node:crypto";
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
const ONBOARDING_STEP_TYPES = ["text", "voice", "photo", "video", "bundle", "collect", "tease", "location_gate"] as const;
type OnboardingStepType = (typeof ONBOARDING_STEP_TYPES)[number];
type OnboardingStepOut = {
  id: string;
  type: OnboardingStepType;
  after_messages: number;
  media_id?: string;
  free?: boolean;
  collect_field?: string;
  instruction?: string;
  condition?: "agreed";
  condition_within_messages?: number;
  condition_lapse?: "skip";
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
      // STABLE ID (migration 087). Preserved when the form sends one back,
      // minted here when it doesn't (a brand-new step, or a step saved by a
      // pre-087 form). This is the whole fix for the desync bug: a step must
      // carry the SAME id across every edit, or every live fan mid-onboarding
      // sees it as new. Never re-issue an id for a step that already has one.
      const existingId = String(s?.id ?? "").trim();
      const step: OnboardingStepOut = {
        id: existingId || randomUUID(),
        type,
        after_messages: Math.min(50, Math.max(1, afterRaw)),
      };
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
      // The "if" half of the trigger (migration 087). Only written when the
      // operator actually picked a condition, so an untouched step's jsonb is
      // byte-identical to what it was before and the runtime treats it as
      // "none" — today's behaviour exactly.
      if (s?.condition === "agreed") {
        step.condition = "agreed";
        const withinRaw = Math.round(Number(s?.condition_within_messages));
        if (Number.isFinite(withinRaw)) {
          step.condition_within_messages = Math.min(50, Math.max(1, withinRaw));
        }
        // "send" is the default in the bot, so only the non-default is stored.
        if (s?.condition_lapse === "skip") step.condition_lapse = "skip";
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

// Save the Flows page (renamed from Campaigns, route moved /drip -> /flows,
// 2026-07-29): every outbound-engagement setting for the clone — the new-fan
// onboarding flow, the mid-chat follow-up, the automated flow's step list,
// the win-back lapse, and the hand-picked media pool. Function name kept as
// saveCampaign (not user-visible, and matches bot/src/campaign.ts which owns
// the runtime side of this).
//
// These onboarding/follow-up columns used to be written by updateClone (the
// Configure page's Engagement tab). They are owned HERE now and deliberately
// removed from updateClone — if both wrote them, whichever page you saved last
// would clobber the other. The legacy cadence columns (drip_per_day /
// drip_active_window_minutes / drip_mode / drip_sequence / drip_step_mode) are
// no longer read by the runtime and are never written here.
export async function saveCampaign(id: string, fd: FormData) {
  await guardDashboardAction("app/flows/actions.ts#saveCampaign", [id, fd]);
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
    // Migration 133. Gates the location_gate step's block action, not the
    // question itself — see FlowsForm.tsx's Toggle hint.
    block_us_fans_enabled: fd.get("block_us_fans_enabled") === "true",
    // Mid-chat follow-up
    followup_after_minutes: Math.max(0, num(fd, "followup_after_minutes", 0)),
    // Campaign. winback_lapse_days is read for real by isReturningLapsedSpender
    // in bot/src/campaign.ts (wired 2026-07-29). It MUST be written to the clones
    // row, which is the only place the bot reads it from. An earlier control for
    // this saved into app_settings instead and nothing ever read it back, which
    // is how the setting died the first time. Clamped to at least 1 day: 0 would
    // mark every paying fan as lapsed immediately.
    winback_lapse_days: Math.max(1, num(fd, "winback_lapse_days", 7)),
    drip_enabled: fd.get("drip_enabled") === "true",
    campaign_captions_off: fd.get("campaign_captions_off") === "true",
    drip_steps: parseSteps(fd),
    // ── NEW FLOWS (migration 130) ────────────────────────────────────────────
    // Which funnel engine this clone runs. Validated against the SAME two-value
    // vocabulary the database CHECK constraint enforces and the bot's
    // funnelPolicyFor() reads, and anything else becomes 'legacy'. A dropdown
    // cannot normally send a third value, but this column decides whether a
    // live clone changes how it sells, so it is not left to the client.
    funnel_policy: fd.get("funnel_policy") === "intent_v1" ? "intent_v1" : "legacy",
    // The two intent-only dials. Clamped at 0 (0 legitimately DISABLES each
    // brake) and defaulted to the migration's own values, so a blank field can
    // never quietly become a different number than the runtime's fallback.
    intent_rejection_cooldown_messages: Math.max(0, num(fd, "intent_rejection_cooldown_messages", 8)),
    intent_post_purchase_cooldown_minutes: Math.max(0, num(fd, "intent_post_purchase_cooldown_minutes", 45)),
    // ── PHASE 2, the trigger redesign (migration 131) ──────────────────────
    // BOTH BOOLEANS DEFAULT TRUE ON A MISSING FIELD, which is the opposite of
    // how funnel_policy above resolves an unknown value, and the difference is
    // deliberate. funnel_policy decides WHICH ENGINE RUNS, so an unreadable
    // value must fail toward the old behaviour. These two only mean anything on
    // a clone somebody has already moved to the intent engine by hand, so an
    // absent field must not silently switch off the thing that clone was moved
    // over to get. Both mirror the bot's own accessors exactly
    // (naturalTriggersEnabled / directPurchaseOverrideFor in
    // bot/src/intent/state.ts): off is an explicit "false", never an absence.
    //
    // A Toggle that is off does post its field, so "false" arrives as a real
    // value; the default only covers a form rendered before this section
    // existed.
    intent_natural_triggers: fd.get("intent_natural_triggers") !== "false",
    intent_direct_purchase_override: fd.get("intent_direct_purchase_override") !== "false",
    // Clamped at 0, which legitimately disables each one (no fallback attempt
    // ever / never stop offering), and defaulted to the migration's own values
    // so a blank field cannot become a different number than the runtime's
    // fallback.
    intent_fallback_offer_after_messages: Math.max(0, num(fd, "intent_fallback_offer_after_messages", 8)),
    intent_max_ignored_offers: Math.max(0, num(fd, "intent_max_ignored_offers", 2)),
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
  if (error && /intent_natural_triggers|intent_direct_purchase_override|intent_fallback_offer_after_messages|intent_max_ignored_offers/i.test(error.message)) {
    // Migration 131 not applied yet: strip the phase-2 columns and retry, same
    // additive pattern as every block around this one. Dropping them leaves the
    // clone on whatever funnel engine it already had, with phase 1's behaviour,
    // which is the correct outcome when the columns do not exist.
    const {
      intent_natural_triggers: _nt,
      intent_direct_purchase_override: _dp,
      intent_fallback_offer_after_messages: _fo,
      intent_max_ignored_offers: _mi,
      ...rest
    } = row;
    ({ error } = await supabaseAdmin.from("clones").update(rest).eq("id", id));
  }
  if (error && /funnel_policy|intent_rejection_cooldown|intent_post_purchase_cooldown/i.test(error.message)) {
    // Migration 130 not applied yet: strip the funnel-engine columns and retry
    // so the rest of the page still saves (same additive-retry pattern as the
    // four above). Dropping them means the clone stays on the legacy funnel,
    // which is the correct outcome when the column does not exist.
    const {
      funnel_policy: _fp,
      intent_rejection_cooldown_messages: _ir,
      intent_post_purchase_cooldown_minutes: _ip,
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
  revalidatePath("/flows");
  await invalidateCloneCaches();
}
