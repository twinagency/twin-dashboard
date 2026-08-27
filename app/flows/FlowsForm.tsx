"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, Field, FieldLabel, GroupHeader, Info, Section, Select, Toggle, inputCls, selectCls, COLLECT_FIELD_OPTIONS } from "@/components/clone/fields";
import { MediaPicker as StepMediaPicker, type MediaRow, type BundleRow } from "@/components/clone/MediaPicker";
import { saveCampaign } from "./actions";

type StepType = "text" | "voice" | "photo" | "video" | "bundle";
// mediaId: for photo/video/bundle steps, the specific item to send; null = AI picks.
type Step = { type: StepType; afterHours: number; mediaId: string | null };
const isMediaType = (t: StepType) => t === "photo" || t === "video" || t === "bundle";

// Emoji type chips, same visual language as the Fans page filter chips.
const STEP_TYPES: { key: StepType; label: string; emoji: string; hint: string }[] = [
  { key: "text", label: "Text", emoji: "💬", hint: "AI writes a fresh line in her voice." },
  { key: "voice", label: "Voice", emoji: "🎙️", hint: "AI writes the line, sent as a voice note." },
  { key: "photo", label: "Photo", emoji: "📷", hint: "Teases a fresh pic he hasn't seen." },
  { key: "video", label: "Video", emoji: "🎥", hint: "Teases a fresh video he hasn't seen." },
  { key: "bundle", label: "Bundle", emoji: "🎁", hint: "Sends the next bundle he hasn't been sent." },
];
const STEP_EMOJI: Record<StepType, string> = Object.fromEntries(
  STEP_TYPES.map((t) => [t.key, t.emoji]),
) as Record<StepType, string>;

// ── Onboarding step list (migration 068) ─────────────────────────────────────
// Same picker as the automated flow above, but fires on the fan's MESSAGE
// COUNT rather than hours quiet (a new fan chatting away is never quiet — see
// bot/db/migrations/068_onboarding_steps.sql). Two extra types beyond the
// campaign's five: collect (ask for one detail, fire-once) and tease (a short
// flirty lead-in line — pairs with a free photo step for "tease then a free pic").
type OnboardingStepType = "text" | "voice" | "photo" | "video" | "bundle" | "collect" | "tease";
type OnboardingStepData = {
  // Stable id (migration 087). null on a step the operator just added; the
  // server mints one on save. It MUST survive every edit round-trip: delivery
  // is recorded against it, so a lost id makes the step look brand new to every
  // fan mid-onboarding, which is the desync bug 087 exists to fix.
  id: string | null;
  type: OnboardingStepType;
  afterMessages: number;
  mediaId: string | null;
  free: boolean;
  collectField: string | null;
  // Optional per-step steer for text/voice/tease lines. Blank = she decides.
  instruction: string | null;
  // The "if" half of the trigger (migration 087). "none" = fires on the message
  // count alone, exactly as every step did before.
  condition: "none" | "agreed";
  conditionWithinMessages: number | null;
  conditionLapse: "send" | "skip";
};
// Step types where a custom-line steer makes sense (AI-written lines only).
const canSteerOnboarding = (t: OnboardingStepType) => t === "text" || t === "voice" || t === "tease";
const isOnboardingMediaType = (t: OnboardingStepType) => t === "photo" || t === "video" || t === "bundle";
const ONBOARDING_STEP_TYPES: { key: OnboardingStepType; label: string; emoji: string; hint: string }[] = [
  { key: "text", label: "Text", emoji: "💬", hint: "AI writes a fresh extra line in her voice." },
  { key: "voice", label: "Voice", emoji: "🎙️", hint: "AI writes the line, sent as a voice note." },
  { key: "photo", label: "Photo", emoji: "📷", hint: "Sends a fresh pic he hasn't seen." },
  { key: "video", label: "Video", emoji: "🎥", hint: "Sends a fresh video he hasn't seen." },
  { key: "bundle", label: "Bundle", emoji: "🎁", hint: "Sends the next bundle he hasn't been sent." },
  { key: "collect", label: "Collect", emoji: "❓", hint: "She naturally works one detail into this reply (name, age, etc)." },
  { key: "tease", label: "Tease", emoji: "😏", hint: "A short flirty lead-in line, e.g. right before a free photo step." },
];

type Initial = {
  enabled: boolean;
  // Per-flow caption kill switch (migration 071): true = every photo/video/
  // bundle THIS flow sends goes out captionless, overriding media_caption_mode
  // outright. Two independent toggles — one per flow.
  campaignCaptionsOff: boolean;
  onboardingCaptionsOff: boolean;
  steps: Step[];
  // New-fan onboarding: free-text steer for her first message. The rest of the
  // onboarding flow (voice note, welcome bundle, detail collection) is now built
  // entirely from the ordered onboarding step list below.
  welcomeInstruction: string | null;
  // Free-preview fallback (migration 069): a free taste if he hasn't bought the
  // welcome bundle within the window. Either trigger fires (null = that trigger
  // off); media id null = she auto-picks.
  freePreviewEnabled: boolean;
  freePreviewAfterMinutes: number | null;
  freePreviewAfterMessages: number | null;
  freePreviewMediaId: string | null;
  // Steer for the spoken lead-in line before the free photo (migration 073).
  // Blank/null = the bot's default lead-in.
  freePreviewInstruction: string | null;
  followupAfterMinutes: number;
  // Days of silence after which a fan who HAS paid before gets the warm win-back
  // instead of a normal campaign step. Read for real by isReturningLapsedSpender
  // in bot/src/campaign.ts, saved to the clones row by saveCampaign.
  winbackLapseDays: number;
  // Ordered onboarding step list (migration 068) — see the DripForm section below.
  onboardingSteps: OnboardingStepData[];
  // ── NEW FLOWS (migration 130) ──────────────────────────────────────────────
  // Which funnel engine this clone runs. 'legacy' is every clone until someone
  // switches one here, and switching back is the whole point of the control.
  funnelPolicy: FunnelPolicy;
  intentNaturalTriggers: boolean;
  intentDirectPurchaseOverride: boolean;
  intentFallbackOfferAfterMessages: number;
  intentMaxIgnoredOffers: number;
  intentRejectionCooldownMessages: number;
  intentPostPurchaseCooldownMinutes: number;
};

export type FunnelPolicy = "legacy" | "intent_v1";

// Small 0h to 24h strip with a dot per step, so the day's rhythm reads at a glance.
function Timeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="pt-1">
      <div className="relative mx-1 h-9">
        {/* baseline */}
        <div className="absolute left-0 right-0 top-6 h-px bg-line" />
        {/* window edges */}
        <div className="absolute left-0 top-5 h-2 w-px bg-line" />
        <div className="absolute right-0 top-5 h-2 w-px bg-line" />
        {steps.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 -translate-x-1/2 text-center"
            style={{ left: `${(s.afterHours / 24) * 100}%` }}
            title={`${STEP_EMOJI[s.type]} ${s.afterHours}h`}
          >
            <div className="text-sm leading-4">{STEP_EMOJI[s.type]}</div>
            <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
          </div>
        ))}
      </div>
      <div className="mx-1 flex justify-between text-[10px] text-muted">
        <span>0h (his last message)</span>
        <span>24h (window closes)</span>
      </div>
    </div>
  );
}

export default function FlowsForm({
  cloneId,
  photosEnabled,
  videosEnabled,
  bundlesEnabled,
  photos,
  videos,
  bundles,
  initial,
}: {
  cloneId: string;
  photosEnabled: boolean;
  videosEnabled: boolean;
  bundlesEnabled: boolean;
  photos: MediaRow[];
  videos: MediaRow[];
  bundles: BundleRow[];
  initial: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [funnelPolicy, setFunnelPolicy] = useState<FunnelPolicy>(initial.funnelPolicy);
  // Phase 2 (migration 131). Ronan asked for the redesign to be switchable on
  // and off without dropping the whole clone back to the standard flow, so
  // these are two switches, not one: the engine above, and the trigger
  // behaviour inside it.
  const [naturalTriggers, setNaturalTriggers] = useState<boolean>(initial.intentNaturalTriggers);
  const [directPurchase, setDirectPurchase] = useState<boolean>(initial.intentDirectPurchaseOverride);
  const [campaignCaptionsOff, setCampaignCaptionsOff] = useState(initial.campaignCaptionsOff);
  const [onboardingCaptionsOff, setOnboardingCaptionsOff] = useState(initial.onboardingCaptionsOff);
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStepData[]>(initial.onboardingSteps);
  const [freePreviewEnabled, setFreePreviewEnabled] = useState(initial.freePreviewEnabled);
  const [freePreviewMediaId, setFreePreviewMediaId] = useState<string | null>(initial.freePreviewMediaId);

  // Switching a step's type clears any picked media (ids don't carry across
  // types, and text/voice steps have no media).
  const setStepType = (i: number, type: StepType) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, type, mediaId: null } : s)));
  const setStepMedia = (i: number, mediaId: string | null) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, mediaId } : s)));
  const setStepHours = (i: number, raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const afterHours = Math.min(23, Math.max(1, n));
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, afterHours } : s)));
  };
  const addStep = () =>
    setSteps((prev) => {
      // Default the new step a couple hours past the latest one, capped at 23.
      const last = prev.reduce((m, s) => Math.max(m, s.afterHours), 0);
      return [...prev, { type: "text", afterHours: Math.min(23, Math.max(1, last + 2)), mediaId: null }];
    });
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const sortedSteps = [...steps].sort((a, b) => a.afterHours - b.afterHours);

  // Onboarding steps: unlike drip's sortedSteps above, this list is NOT
  // re-sorted anywhere (save or render) — it fires sequentially through the
  // array in exactly the order saved here, so reordering with the ↑/↓ buttons
  // is the only thing that changes firing order (see migration 068 for why
  // the fire-once tracking needs the saved order to stay stable).
  const setOnboardingStepType = (i: number, type: OnboardingStepType) =>
    setOnboardingSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, type, mediaId: null, free: false, collectField: null } : s)),
    );
  const setOnboardingStepMedia = (i: number, mediaId: string | null) =>
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, mediaId } : s)));
  const setOnboardingStepFree = (i: number, free: boolean) =>
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, free } : s)));
  const setOnboardingStepCollectField = (i: number, collectField: string) =>
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, collectField } : s)));
  const setOnboardingStepInstruction = (i: number, instruction: string) =>
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, instruction } : s)));
  const setOnboardingStepCondition = (i: number, condition: "none" | "agreed") =>
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, condition } : s)));
  const setOnboardingStepConditionLapse = (i: number, conditionLapse: "send" | "skip") =>
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, conditionLapse } : s)));
  const setOnboardingStepConditionWithin = (i: number, raw: string) => {
    const n = Math.round(Number(raw));
    const conditionWithinMessages = Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : null;
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, conditionWithinMessages } : s)));
  };
  const setOnboardingStepAfter = (i: number, raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const afterMessages = Math.min(50, Math.max(1, n));
    setOnboardingSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, afterMessages } : s)));
  };
  const addOnboardingStep = () =>
    setOnboardingSteps((prev) => {
      const last = prev.reduce((m, s) => Math.max(m, s.afterMessages), 0);
      return [...prev, { id: null, type: "text", afterMessages: Math.min(50, last + 1), mediaId: null, free: false, collectField: null, instruction: null, condition: "none", conditionWithinMessages: null, conditionLapse: "send" }];
    });
  const removeOnboardingStep = (i: number) => setOnboardingSteps((prev) => prev.filter((_, idx) => idx !== i));
  const moveOnboardingStep = (i: number, dir: -1 | 1) =>
    setOnboardingSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function onSubmit(fd: FormData) {
    // Steps save sorted by hour: the stored list is the firing order.
    fd.set(
      "drip_steps",
      JSON.stringify(
        sortedSteps.map((s) => ({
          type: s.type,
          after_hours: s.afterHours,
          ...(isMediaType(s.type) && s.mediaId ? { media_id: s.mediaId } : {}),
        })),
      ),
    );
    // Onboarding steps: same hidden-field JSON pattern, saved in EXACTLY the
    // order shown (not re-sorted like drip's steps above) — see migration 068
    // for why firing order must match the saved array order.
    fd.set(
      "onboarding_steps",
      JSON.stringify(
        onboardingSteps.map((s) => ({
          // Round-trip the stable id untouched (migration 087). A step with no
          // id is genuinely new and the server mints one.
          ...(s.id ? { id: s.id } : {}),
          type: s.type,
          after_messages: s.afterMessages,
          ...(isOnboardingMediaType(s.type) && s.mediaId ? { media_id: s.mediaId } : {}),
          ...(isOnboardingMediaType(s.type) && s.free ? { free: true } : {}),
          ...(s.type === "collect" && s.collectField ? { collect_field: s.collectField } : {}),
          // Per-step steer (migration 069) — only for AI-written line types, and
          // only when actually filled in, so a blank never overrides her freedom.
          ...(canSteerOnboarding(s.type) && s.instruction && s.instruction.trim()
            ? { instruction: s.instruction.trim() }
            : {}),
          // The "if" gate (migration 087). Only written when actually chosen, so
          // an untouched step's saved shape is unchanged and the bot reads it as
          // "none" = today's behaviour.
          ...(s.condition === "agreed"
            ? {
                condition: "agreed",
                ...(s.conditionWithinMessages ? { condition_within_messages: s.conditionWithinMessages } : {}),
                ...(s.conditionLapse === "skip" ? { condition_lapse: "skip" } : {}),
              }
            : {}),
        })),
      ),
    );
    // Free-preview media id: controlled, carried as a hidden field (null → blank
    // → she auto-picks). The enabled toggle + the two number fields submit by name.
    fd.set("onboarding_free_preview_media_id", freePreviewMediaId ?? "");
    startTransition(async () => {
      await saveCampaign(cloneId, fd);
      setSteps(sortedSteps);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form action={onSubmit} className="mx-auto grid w-full min-w-0 max-w-5xl grid-cols-1 gap-6">
      {/* ── New fan onboarding. The whole flow (greeting steer + the ordered
          step list) lives here now; the legacy loose fields (voice-on-msg-N,
          bundle-on-msg-N, teased, collect-fields, onboarding length) were
          retired in favour of the step list below. ──────────────────────── */}
      <GroupHeader
        label="New fan"
        hint="How she opens a brand-new fan, plus the free-preview safety net. The rest of the onboarding flow is the ordered step list below."
      />
      <Section
        icon="🚀"
        accent="cyan"
        title="Onboarding"
        hint="The whole new-fan flow in one place: her opening line, the ordered step sequence, and a free-preview safety net. Everything here is timed off HIS message count."
      >
        <Area
          label="First message instructions"
          name="welcome_instruction"
          defaultValue={initial.welcomeInstruction}
          rows={2}
          placeholder='blank = "greet him warmly, introduce yourself by name, be flirty, and ask his name"'
          hint="How she opens the very FIRST message to a brand-new fan - a free-text steer, written into her own AI-generated line."
        />

        {/* ── The ordered step sequence (migration 068) ─────────────────── */}
        <div className="border-t border-line pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
            Steps
            <Info text="Ordered steps timed off HIS message count (not hours quiet like the flow below). They fire in the order shown, use ↑/↓ to reorder. Text, voice and tease lines are AI-written fresh in her voice with an optional per-step steer; photo, video and bundle steps tease a fresh unseen item unless you pick one, and can be toggled Free. Collect steps gently work one detail into that reply, once. Empty = she just greets and chats naturally." />
          </p>

          {onboardingSteps.length === 0 && (
            <p className="text-[11px] text-muted">No steps yet - she greets and chats naturally with no scripted onboarding steps.</p>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-2">
          {onboardingSteps.map((s, i) => (
            <div key={i} className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
              <span className="w-5 shrink-0 text-right text-xs font-medium text-muted">{i + 1}</span>
              <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink">
                after
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={s.afterMessages}
                  onChange={(e) => setOnboardingStepAfter(i, e.target.value)}
                  className={inputCls + " w-16 text-center"}
                />
                msgs
              </label>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {ONBOARDING_STEP_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setOnboardingStepType(i, t.key)}
                    title={t.hint}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                      (s.type === t.key
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-line text-ink/70 hover:border-accent/40")
                    }
                  >
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex shrink-0 gap-1">
                <button type="button" onClick={() => moveOnboardingStep(i, -1)} disabled={i === 0} className="rounded border border-line px-1.5 text-xs text-muted disabled:opacity-30" title="Move up">↑</button>
                <button type="button" onClick={() => moveOnboardingStep(i, 1)} disabled={i === onboardingSteps.length - 1} className="rounded border border-line px-1.5 text-xs text-muted disabled:opacity-30" title="Move down">↓</button>
                <button type="button" onClick={() => removeOnboardingStep(i)} className="rounded border border-line px-1.5 text-xs text-crit" title="Remove">✕</button>
              </div>
              {isOnboardingMediaType(s.type) && (
                <div className="w-full min-w-0 max-w-full">
                  <StepMediaPicker
                    type={s.type as "photo" | "video" | "bundle"}
                    photos={photos}
                    videos={videos}
                    bundles={bundles}
                    photosEnabled={photosEnabled}
                    videosEnabled={videosEnabled}
                    bundlesEnabled={bundlesEnabled}
                    value={s.mediaId}
                    onPick={(id) => setOnboardingStepMedia(i, id)}
                  />
                  <button
                    type="button"
                    onClick={() => setOnboardingStepFree(i, !s.free)}
                    title="Free = sent unlocked with no charge and no paywall, regardless of how this item is priced elsewhere."
                    className={
                      "mt-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                      (s.free ? "border-good/50 bg-good/15 text-good" : "border-line text-ink/70 hover:border-accent/40")
                    }
                  >
                    {s.free ? "🆓 Free (no charge)" : "🔒 Paid (normal price)"}
                  </button>
                </div>
              )}
              {s.type === "collect" && (
                <div className="w-full sm:w-64">
                  <select
                    value={s.collectField ?? ""}
                    onChange={(e) => setOnboardingStepCollectField(i, e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Pick a detail…</option>
                    {COLLECT_FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {canSteerOnboarding(s.type) && (
                <div className="w-full">
                  <FieldLabel
                    label="Custom line / steer"
                    hint="Optional steer for this AI-written line (e.g. 'ask what he's into'). Blank = she decides what to say."
                  />
                  <input
                    type="text"
                    value={s.instruction ?? ""}
                    onChange={(e) => setOnboardingStepInstruction(i, e.target.value)}
                    placeholder="blank = she decides"
                    className={inputCls}
                  />
                </div>
              )}
              {/* ── The "if" gate (migration 087) ─────────────────────────────
                  "after N msgs" is WHEN this step may fire. This is WHETHER it
                  should. Before this existed, a step saying "send the bundle
                  after they say yes" fired on the counter regardless of his
                  answer. */}
              <div className="w-full">
                <FieldLabel
                  label="Only if"
                  hint="Extra gate on top of the message count. 'He says yes' holds the step until he actually agrees, so an ask like 'can I show you something?' is answered before the next step fires. Anything = fires on the count alone, which is the original behaviour."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { key: "none", label: "Anything (fires on the count)" },
                      { key: "agreed", label: "He says yes" },
                    ] as const).map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setOnboardingStepCondition(i, c.key)}
                        className={
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                          (s.condition === c.key
                            ? "border-accent/50 bg-accent/15 text-accent"
                            : "border-line text-ink/70 hover:border-accent/40")
                        }
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {s.condition === "agreed" && (
                    <>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink">
                        wait
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={s.conditionWithinMessages ?? ""}
                          onChange={(e) => setOnboardingStepConditionWithin(i, e.target.value)}
                          placeholder="10"
                          className={inputCls + " w-16 text-center"}
                        />
                        msgs
                        <Info text="How long to keep waiting for him to say yes. Blank uses the built-in 10. The wait is always capped: a step that could wait forever would freeze his credits and he would chat free forever with nothing in the logs." />
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          { key: "send", label: "then send anyway" },
                          { key: "skip", label: "then skip it" },
                        ] as const).map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setOnboardingStepConditionLapse(i, c.key)}
                            className={
                              "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                              (s.conditionLapse === c.key
                                ? "border-accent/50 bg-accent/15 text-accent"
                                : "border-line text-ink/70 hover:border-accent/40")
                            }
                          >
                            {c.label}
                          </button>
                        ))}
                        <Info text="What happens if he never says yes inside that window. 'Send anyway' is the default and keeps today's behaviour. 'Skip it' drops the step entirely, which on a paid step means giving up that sale." />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          </div>

          <button
            type="button"
            onClick={addOnboardingStep}
            className="mt-2 justify-self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg"
          >
            + Add step
          </button>
        </div>

        {/* ── Caption kill switch (migration 071) ───────────────────────── */}
        <div className="border-t border-line pt-3">
          <Toggle
            label={onboardingCaptionsOff ? "Captions off: no caption on anything onboarding sends" : "Captions follow the normal rules (Configure)"}
            name="onboarding_captions_off"
            checked={onboardingCaptionsOff}
            onChange={setOnboardingCaptionsOff}
            accent="soft"
            hint="Overrides the caption placement set in Configure just for onboarding: every photo, video and bundle the steps above (and the free-preview fallback below) send goes out with NO caption at all, no matter what."
          />
        </div>

        {/* ── Free-preview fallback (migration 069) ─────────────────────── */}
        <div className="border-t border-line pt-3">
          <Toggle
            label={freePreviewEnabled ? "Free preview if he hasn't bought" : "No free-preview fallback"}
            name="onboarding_free_preview_enabled"
            checked={freePreviewEnabled}
            onChange={setFreePreviewEnabled}
            accent="soft"
            hint="A safety net: if he hasn't bought the welcome bundle within the window below, she sends one free taste. Either trigger can fire; leave both blank to turn the triggers off."
          />
          {freePreviewEnabled && (
            <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="After (minutes)"
                name="onboarding_free_preview_after_minutes"
                type="number"
                defaultValue={initial.freePreviewAfterMinutes}
                placeholder="blank = off"
                hint="Fires this many minutes after onboarding starts if he still hasn't bought. Blank = this trigger off."
              />
              <Field
                label="After (messages)"
                name="onboarding_free_preview_after_messages"
                type="number"
                defaultValue={initial.freePreviewAfterMessages}
                placeholder="blank = off"
                hint="Fires after this many of his messages if he still hasn't bought. Blank = this trigger off."
              />
              <div className="min-w-0 sm:col-span-2">
                <FieldLabel
                  label="Free-preview media"
                  hint="The item she sends as the free taste. Leave on AI picks and she chooses a fresh unseen one."
                />
                <StepMediaPicker
                  type="photo"
                  photos={photos}
                  videos={videos}
                  bundles={bundles}
                  photosEnabled={photosEnabled}
                  videosEnabled={videosEnabled}
                  bundlesEnabled={bundlesEnabled}
                  value={freePreviewMediaId}
                  onPick={setFreePreviewMediaId}
                />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <Area
                  label="Lead-in line instructions"
                  name="onboarding_free_preview_instruction"
                  defaultValue={initial.freePreviewInstruction}
                  rows={2}
                  placeholder='blank = "tell him sweetly she will show him one for free first"'
                  hint="Steers what she SAYS right before sending the free photo - a free-text steer, written into her own AI-generated line. Blank = the default sweet lead-in. Separate from the photo's own caption, which the Captions-off switch above controls either way."
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── NEW FLOWS: which funnel engine this clone runs (migration 130) ── */}
      <GroupHeader
        label="Funnel engine"
        hint="Which set of rules decides when she offers something paid. Per creator, and switchable back at any time."
      />
      <Section
        icon="🎯"
        accent="purple"
        title="Selling rules"
        hint="The standard flow fires steps off his message count. The intent flow remembers what he has already bought, whether he said no, and whether he is in a cooldown, and checks all of that before any paid offer."
        tip="Switching to the intent flow does NOT change the step builder below, the follow-up, or the win-back: those keep working exactly as they do now. What changes is that a paid offer has to clear a hard eligibility check first. Switch back to Standard at any time and behaviour returns to what it is today."
      >
        <Select
          label="Funnel engine"
          name="funnel_policy"
          value={funnelPolicy}
          onChange={setFunnelPolicy}
          options={[
            { value: "legacy", label: "Standard flow (what every creator runs today)" },
            { value: "intent_v1", label: "Intent flow (remembers what he bought and what he refused)" },
          ]}
          hint="Standard is the default. Only creators set to Intent use the new rules; every other creator is untouched."
        />

        {/* HIDDEN, NOT UNMOUNTED, and the difference is a real bug rather than a
            style choice. React unmounting these fields removes their inputs from
            the form, so the next save posts nothing for them and the action
            falls back to the shipped defaults - silently rewriting a clone's
            cooldowns to 8 and 45 the moment anyone saved this page with the
            engine set to Standard. Kept mounted and display:none, they post the
            values the clone actually has, so a save while they are hidden is a
            no-op on them. Same reason for the phase-2 block below. */}
        <div className={funnelPolicy === "intent_v1" ? "" : "hidden"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Back off after a no (his messages)"
              name="intent_rejection_cooldown_messages"
              type="number"
              min={0}
              defaultValue={initial.intentRejectionCooldownMessages}
              hint="After he explicitly says no to a paid offer, she makes no new paid offer until he has sent this many more messages. Counted in HIS messages, not minutes, so it clears by him warming back up rather than by the clock. If he plainly asks to buy in the meantime, that overrides it. Default 8. 0 turns this brake off."
            />
            <Field
              label="Quiet after a purchase (minutes)"
              name="intent_post_purchase_cooldown_minutes"
              type="number"
              min={0}
              defaultValue={initial.intentPostPurchaseCooldownMinutes}
              hint="Straight after he pays, she does not pitch again for this long. This is also what cancels an already-scheduled paid send if he buys just before it was due to fire. Default 45. 0 turns it off."
            />
          </div>
        </div>

        {/* ── PHASE 2: the trigger redesign, and its own off switch ────── */}
        <div className={funnelPolicy === "intent_v1" ? "" : "hidden"}>
          <div className="border-t border-line pt-3">
            <Toggle
              label={
                naturalTriggers
                  ? "New flows: she offers when HE brings it up"
                  : "New flows off: she only offers when he says he wants to buy"
              }
              name="intent_natural_triggers"
              checked={naturalTriggers}
              onChange={setNaturalTriggers}
              accent="soft"
              hint="ON: the paid ask is triggered by what he just said - he asks about pics, he sounds keen, he shows real interest - instead of by how many messages he has sent. OFF: everything above still applies (she still remembers what he bought and what he refused) but she only ever asks when he plainly says he wants to buy. Switching this off never makes her pushier, only quieter."
            />
            <div className={naturalTriggers ? "mt-3" : "hidden"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Ask anyway after (his messages)"
                  name="intent_fallback_offer_after_messages"
                  type="number"
                  min={0}
                  defaultValue={initial.intentFallbackOfferAfterMessages}
                  hint="The safety net for a fan who flirts happily but never asks for anything. If he has never been offered a single thing and has sent this many messages, she makes one attempt anyway. Default 8. 0 means never - she will only ever sell to him if he brings it up himself."
                />
                <Field
                  label="Stop after this many ignored offers"
                  name="intent_max_ignored_offers"
                  type="number"
                  min={0}
                  defaultValue={initial.intentMaxIgnoredOffers}
                  hint="If he leaves this many offers in a row with no reply at all, she stops offering him things. Ignoring is not refusing: this arms no cooldown, and if he later says he wants to buy she sells to him straight away. Raising this number brings those fans back on their next message. Default 2. 0 means never stop."
                />
              </div>
            </div>
            <div className={naturalTriggers ? "mt-3" : "hidden"}>
              <div>
                <Toggle
                  label={
                    directPurchase
                      ? "If he asks to buy, sell to him right away"
                      : "Keep him on the flow even if he asks to buy"
                  }
                  name="intent_direct_purchase_override"
                  checked={directPurchase}
                  onChange={setDirectPurchase}
                  accent="soft"
                  hint="ON (recommended): a fan who says 'got any photos?' on his second message gets a real offer there and then, instead of waiting for the flow to reach that step. It never overrides safety, never offers him something he already owns, and never overrides 'Keep her on script' in onboarding."
                />
              </div>
            </div>
          </div>
        </div>

        {funnelPolicy === "intent_v1" && (
          <p className="text-[11px] leading-relaxed text-muted">
            On the intent flow she never offers something he already has, never pitches
            straight after a refusal, and never sends a scheduled paid item if he bought
            in the meantime. Safety rules are unchanged and cannot be overridden by
            anything a fan says.
          </p>
        )}
      </Section>

      {/* ── Mid-chat follow-up (moved off Configure) ─────────────── */}
      <Section
        icon="⏰"
        accent="amber"
        title="Follow-up"
        hint="One short nudge in her voice if he goes quiet mid-chat, once per hang, never repeated until he replies."
      >
        <Field
          label="Follow-up (mins)"
          name="followup_after_minutes"
          type="number"
          defaultValue={initial.followupAfterMinutes}
          placeholder="0"
        />
      </Section>

      {/* ── Automated flow ───────────────────────────────────────── */}
      <GroupHeader
        label="Automated flow"
        hint="Timed steps that fire while a fan goes quiet. Telegram only lets her message a fan within 24 hours of his last activity, so every step lands inside that window."
      />
      <Section
        title="Steps"
        hint="Each step is WHEN (hours after his last message) plus WHAT (text, voice, photo, video, or bundle). Content is never canned: text and voice lines are AI-written fresh in her voice, media is always something he hasn't seen. The moment he replies, the timer resets to 0."
        tip="Steps fire in hour order (they re-sort on save). Voice, photo, video and bundle steps only fire when that feature is on for this creator; a step with nothing fresh to send falls back to an AI text line."
      >
        <Toggle
          label={enabled ? "Flow is on: she re-engages quiet fans" : "Flow is off: she never messages first"}
          name="drip_enabled"
          checked={enabled}
          onChange={setEnabled}
          accent="soft"
        />

        {/* Win-back lapse threshold. Rendered UNCONDITIONALLY, never behind the
            `enabled` gate: saveCampaign always writes this column, so a form that
            did not carry the field would silently reset the operator's value to
            the 7-day fallback on every save. Same hazard the offer_pending_minutes
            / discount_slowdown_minutes defaults have. */}
        <div className="sm:max-w-xs">
          <Field
            label="Win-back after (days quiet)"
            name="winback_lapse_days"
            type="number"
            min={1}
            defaultValue={initial.winbackLapseDays}
            hint="A fan who has PAID before and then goes quiet this many days gets the warm win-back (a softer one-time discount plus a fresh teaser) on his next flow step instead of a normal one. Fans who never paid are unaffected. Default 7. Lower means she chases returning payers sooner."
          />
        </div>

        {enabled && (
          <Toggle
            label={campaignCaptionsOff ? "Captions off: no caption on anything the flow sends" : "Captions follow the normal rules (Configure)"}
            name="campaign_captions_off"
            checked={campaignCaptionsOff}
            onChange={setCampaignCaptionsOff}
            accent="soft"
            hint="Overrides the caption placement set in Configure just for the automated flow: every photo, video and bundle a step below sends goes out with NO caption at all, no matter what."
          />
        )}

        {enabled && (
          <>
            {steps.length === 0 && (
              <p className="text-[11px] text-warn">No steps yet. She won't reach out until you add at least one.</p>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-2">
              {steps.map((s, i) => {
                return (
                  <div key={i} className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
                    <span className="w-5 shrink-0 text-right text-xs font-medium text-muted">{i + 1}</span>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink">
                      after
                      <input
                        type="number"
                        min={1}
                        max={23}
                        value={s.afterHours}
                        onChange={(e) => setStepHours(i, e.target.value)}
                        className={inputCls + " w-16 text-center"}
                      />
                      h
                    </label>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {STEP_TYPES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setStepType(i, t.key)}
                          title={t.hint}
                          className={
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                            (s.type === t.key
                              ? "border-accent/50 bg-accent/15 text-accent"
                              : "border-line text-ink/70 hover:border-accent/40")
                          }
                        >
                          {t.emoji} {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex shrink-0 gap-1">
                      <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded border border-line px-1.5 text-xs text-muted disabled:opacity-30" title="Move up">↑</button>
                      <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="rounded border border-line px-1.5 text-xs text-muted disabled:opacity-30" title="Move down">↓</button>
                      <button type="button" onClick={() => removeStep(i)} className="rounded border border-line px-1.5 text-xs text-crit" title="Remove">✕</button>
                    </div>
                    {isMediaType(s.type) && (
                      <StepMediaPicker
                        type={s.type as "photo" | "video" | "bundle"}
                        photos={photos}
                        videos={videos}
                        bundles={bundles}
                        photosEnabled={photosEnabled}
                        videosEnabled={videosEnabled}
                        bundlesEnabled={bundlesEnabled}
                        value={s.mediaId}
                        onPick={(id) => setStepMedia(i, id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addStep}
              className="justify-self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg"
            >
              + Add step
            </button>

            <Timeline steps={sortedSteps} />
          </>
        )}

      </Section>

      {/* ── Save bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-deep disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save flow"}
        </button>
        {saved && <span className="text-sm text-good">Saved ✓</span>}
      </div>
    </form>
  );
}
