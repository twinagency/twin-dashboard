"use client";

import { useEffect, useState } from "react";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "./ModelSelect";
import {
  Area,
  DEFAULT_PAYWALL_BUTTON,
  DEFAULT_PAYWALL_MESSAGE,
  Field,
  MODEL_FIELDS,
  Select,
  Slider,
  SubCard,
  Toggle,
  inputCls,
} from "./clone/fields";
import { CategoryPricingEditor, SpoilMenuEditor } from "./clone/editors";
import { useCloneConfig } from "./clone/useCloneConfig";
import { saveCloneDefaults } from "@/app/settings/actions";

// The "new-clone defaults" template — nearly the full Configure field set, minus
// per-clone identity (name / token / voice ID / persona). Field `name`s match the
// `clones` columns so CreateCloneForm (which runs the same useCloneConfig +
// ConfigSections) seeds a fresh clone straight from what's saved here.
export default function CloneDefaultsForm({ defaults }: { defaults: Partial<Clone> }) {
  const [models, setModels] = useState<OrModel[]>([]);
  const [saved, setSaved] = useState(false);
  const [cfg, set] = useCloneConfig(defaults);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d) => Array.isArray(d) && setModels(d)).catch(() => {});
  }, []);

  const levelOpts = [
    { value: "low" as const, label: "Low" },
    { value: "medium" as const, label: "Med" },
    { value: "high" as const, label: "High" },
  ];
  // The three personality dials went 5-step with migration 082. These are the
  // NEW-CLONE DEFAULTS template (saved into app_settings, then seeded into a
  // fresh clones row by CreateCloneForm), so they must offer the same steps the
  // per-clone Configure page does or a default could never be set to an end
  // stop. Same vocabulary as SEG in components/clone/ConfigSections.tsx.
  const heatOpts = [
    { value: "off" as const, label: "Off" },
    { value: "mild" as const, label: "Mild" },
    { value: "medium" as const, label: "Med" },
    { value: "explicit" as const, label: "Explicit" },
    { value: "max" as const, label: "Max" },
  ];
  const pushOpts = [
    { value: "none" as const, label: "None" },
    { value: "low" as const, label: "Low" },
    { value: "medium" as const, label: "Med" },
    { value: "high" as const, label: "High" },
    { value: "relentless" as const, label: "Max" },
  ];
  // Migration 086, the four warmth-side dials. Med is the default and adds
  // nothing to the prompt, so leaving these alone changes nothing fleet-wide.
  const toneOpts = [
    { value: "off" as const, label: "Off" },
    { value: "low" as const, label: "Low" },
    { value: "medium" as const, label: "Med" },
    { value: "high" as const, label: "High" },
    { value: "max" as const, label: "Max" },
  ];

  const Group = ({ label }: { label: string }) => (
    <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{label}</span>
  );

  return (
    <form action={async (fd) => { await saveCloneDefaults(fd); setSaved(true); }} className="mt-4 grid gap-6">
      {/* ── MODE & PERSONALITY ── */}
      <div className="grid gap-3">
        <Group label="Mode & personality" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="AI mode" name="ai_mode" value={cfg.aiMode} onChange={(v) => set("aiMode", v)} options={[{ value: "classic", label: "Classic" }, { value: "smart", label: "Smart" }]} />
          <input type="hidden" name="smart_split" value={String(cfg.smartSplit)} />
          {cfg.aiMode === "smart" && (
            <Toggle label="Two-model split (writer + decider)" name="_smart_split_toggle" checked={cfg.smartSplit} onChange={(v) => set("smartSplit", v)} accent="soft" />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Flirtiness" name="sexual_level" value={cfg.sexualLevel} onChange={(v) => set("sexualLevel", v)} options={heatOpts} />
          <Select label="How explicit" name="nsfw_level" value={cfg.nsfwLevel} onChange={(v) => set("nsfwLevel", v)} options={heatOpts} />
          <Select label="Upsell push" name="push_level" value={cfg.pushLevel} onChange={(v) => set("pushLevel", v)} options={pushOpts} />
        </div>
        {/* Migration 086. Curiosity first: it is the dial behind "she never
            asks about me", and it is the one most worth raising fleet-wide. */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Curiosity" name="curiosity_level" value={cfg.curiosityLevel} onChange={(v) => set("curiosityLevel", v)} options={toneOpts} />
          <Select label="Warmth" name="warmth_level" value={cfg.warmthLevel} onChange={(v) => set("warmthLevel", v)} options={toneOpts} />
          <Select label="Playfulness" name="playfulness_level" value={cfg.playfulnessLevel} onChange={(v) => set("playfulnessLevel", v)} options={toneOpts} />
          <Select label="Memory use" name="attentiveness_level" value={cfg.attentivenessLevel} onChange={(v) => set("attentivenessLevel", v)} options={toneOpts} />
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Toggle label="Emojis" name="emojis_enabled" checked={cfg.emojis} onChange={(v) => set("emojis", v)} accent="soft" />
          {cfg.emojis ? (
            <>
              <div className="w-48"><Select label="Emoji amount" name="emoji_amount" value={cfg.emojiAmount} onChange={(v) => set("emojiAmount", v)} options={levelOpts} /></div>
              <label className="block min-w-[16rem] flex-1">
                <span className="mb-1 block text-xs text-muted">Allowed emojis (blank = any)</span>
                <input name="emoji_allowlist" value={cfg.emojiList} onChange={(e) => set("emojiList", e.target.value)} placeholder="e.g. ❤️ 😘 💕 🥹 (blank = any)" className={inputCls} />
              </label>
            </>
          ) : (
            <>
              <input type="hidden" name="emoji_amount" value={cfg.emojiAmount} />
              <input type="hidden" name="emoji_allowlist" value="" />
            </>
          )}
        </div>
      </div>

      {/* ── REALISM ── */}
      <div className="grid gap-3">
        <Group label="Realism" />
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle label="Reacts to messages" name="reactions_enabled" checked={cfg.reactions} onChange={(v) => set("reactions", v)} accent="soft" />
          <Toggle label="Read receipts" name="read_receipts_enabled" checked={cfg.readReceipts} onChange={(v) => set("readReceipts", v)} accent="soft" />
          <Toggle label="Message effects on hot lines" name="message_effects_enabled" checked={cfg.messageEffects} onChange={(v) => set("messageEffects", v)} accent="soft" />
          <Toggle label="Admits she's an AI when asked" name="ai_disclosure" checked={cfg.aiDisclosure} onChange={(v) => set("aiDisclosure", v)} accent="soft" />
        </div>
      </div>

      {/* ── MEDIA ── */}
      <div className="grid gap-3">
        <Group label="Media" />
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle label="Photos" name="photos_enabled" checked={cfg.photosEnabled} onChange={(v) => set("photosEnabled", v)} accent="soft" />
          <Toggle label="Videos" name="videos_enabled" checked={cfg.videosEnabled} onChange={(v) => set("videosEnabled", v)} accent="soft" />
          <Toggle label="Bundles" name="bundles_enabled" checked={cfg.bundlesEnabled} onChange={(v) => set("bundlesEnabled", v)} accent="soft" />
          <Toggle label="Voice" name="voice_enabled" checked={cfg.voice} onChange={(v) => set("voice", v)} accent="soft" />
          <Toggle label="She can see fan videos" name="video_vision_enabled" checked={cfg.videoVision} onChange={(v) => set("videoVision", v)} accent="soft" />
        </div>
        <div className="sm:max-w-md">
          <Select
            label="How media captions are sent"
            name="media_caption_mode"
            value={cfg.mediaCaptionMode}
            onChange={(v) => set("mediaCaptionMode", v)}
            options={[
              { value: "inline" as const, label: "On the media (caption under it)" },
              { value: "none" as const, label: "No caption (media only)" },
              { value: "separate" as const, label: "Own message, then the media" },
            ]}
          />
        </div>
      </div>

      {/* ── CATEGORY PRICING ── */}
      <div className="grid gap-3">
        <Group label="Category pricing (⭐)" />
        <CategoryPricingEditor cfg={cfg} set={set} />
      </div>

      {/* ── MONETIZATION ── */}
      <div className="grid gap-3">
        <Group label="Message credits" />
        <Toggle label={cfg.charge ? "Charge for messages" : "Messages are free"} name="charge_messages" checked={cfg.charge} onChange={(v) => set("charge", v)} accent="soft" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Starting credits (free)" name="starting_credits" type="number" defaultValue={defaults.starting_credits ?? 50} />
          <Field label="Pack size (msgs)" name="credit_pack_size" type="number" defaultValue={defaults.credit_pack_size ?? 50} />
          <Field label="Pack price (⭐)" name="credit_pack_price_stars" type="number" defaultValue={defaults.credit_pack_price_stars ?? 199} />
        </div>
        {/* Migration 088. Fleet default for what a tip gives back. 0 = a tip
            grants no credits, which is what every clone did before 088. */}
        <Field
          label="Credits per 100 ⭐ tipped"
          name="tip_credits_per_100_stars"
          type="number"
          min={0}
          step={1}
          defaultValue={defaults.tip_credits_per_100_stars ?? 0}
          hint="What a tip gives back in message credits, for new clones. 0 means tips give no credits. At 5, a 1000 star tip gives 50 messages. Rounded down, and set per clone on its own page."
        />
      </div>

      <div className="grid gap-3">
        <Group label="Discounts" />
        <Toggle label={cfg.discountsEnabled ? "She can offer discounts" : "No discounts"} name="discounts_enabled" checked={cfg.discountsEnabled} onChange={(v) => set("discountsEnabled", v)} accent="soft" />
        {cfg.discountsEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Slider label="Photos max discount" name="discount_max_photo" value={cfg.discMaxPhoto} onChange={(v) => set("discMaxPhoto", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
            <Slider label="Videos max discount" name="discount_max_video" value={cfg.discMaxVideo} onChange={(v) => set("discMaxVideo", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
            <Slider label="Bundles max discount" name="discount_max_bundle" value={cfg.discMaxBundle} onChange={(v) => set("discMaxBundle", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
            <Slider label="Message packs max discount" name="discount_max_credits" value={cfg.discMaxCredits} onChange={(v) => set("discMaxCredits", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <Group label="Tips & extras" />
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle label="Tips / spoil me" name="tips_enabled" checked={cfg.tips} onChange={(v) => set("tips", v)} accent="soft" />
          <Toggle label="Live captions" name="live_captions_enabled" checked={cfg.liveCaptions} onChange={(v) => set("liveCaptions", v)} accent="soft" />
          <Toggle label="Auto thank-you" name="thank_you_enabled" checked={cfg.thankYou} onChange={(v) => set("thankYou", v)} accent="soft" />
        </div>
        {cfg.tips && <SpoilMenuEditor cfg={cfg} set={set} />}
      </div>

      {/* ── ENGAGEMENT / ONBOARDING ── */}
      <div className="grid gap-3">
        <Group label="New user flow" />
        <Area label="Welcome greeting instruction (optional)" name="welcome_instruction" rows={2} placeholder="e.g. greet him warmly, introduce yourself, ask his name" defaultValue={defaults.welcome_instruction} />
        {/* The four legacy loose onboarding controls (onboarding_voice_after,
            welcome_bundle_after, onboarding_voice_instruction,
            welcome_bundle_after_minutes) were removed 2026-07-29. They were dead
            on both sides: the runtime stopped reading those columns when
            onboarding became the ordered step list (see bot/src/onboarding.ts,
            "onboardingSteps is now the ONLY onboarding engine"), and the clone
            save action deliberately never wrote them either. Onboarding is
            configured per clone on the Flows page now. Columns are left in
            place per the additive-only rule, they are simply never written or
            read. None of the four was a cap or gate on something still running,
            so nothing is left uncapped by removing them. */}
      </div>

      {/* ── PAYWALL ── */}
      <div className="grid gap-3">
        <Group label="Out of messages flow" />
        <SubCard>
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Default message text</span>
              <textarea name="paywall_default_message" rows={2} value={cfg.paywallDefault} onChange={(e) => set("paywallDefault", e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Button text</span>
              <input name="paywall_button_label" value={cfg.paywallButton} onChange={(e) => set("paywallButton", e.target.value)} className={inputCls} />
            </label>
            <button
              type="button"
              onClick={() => { set("paywallDefault", DEFAULT_PAYWALL_MESSAGE); set("paywallButton", DEFAULT_PAYWALL_BUTTON); }}
              className="justify-self-start text-[11px] font-medium text-muted underline transition hover:text-ink"
            >
              Reset to default
            </button>
          </div>
        </SubCard>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle label="Smart first-time message (she writes it once)" name="smart_paywall_enabled" checked={cfg.smartPaywall} onChange={(v) => set("smartPaywall", v)} accent="soft" />
          {/* Unconditional hidden input carries the real value, same pattern as
              smart_split / speaker boost below. The visible toggle uses a
              differently-named field so mounting/unmounting it can never drop
              the stored value from the submitted form. */}
          <input type="hidden" name="paywall_as_voice" value={String(cfg.paywallVoice)} />
          {cfg.smartPaywall && (
            <Toggle label="Send that first one as a voice note" name="_paywall_as_voice_toggle" checked={cfg.paywallVoice} onChange={(v) => set("paywallVoice", v)} accent="soft" />
          )}
        </div>
        <Area label="Paywall instruction (optional)" name="paywall_instruction" rows={2} placeholder="e.g. be sweet, remind him what he's missing, nudge him to grab more messages" defaultValue={defaults.paywall_instruction} />

        {/* Warmup before the wall (pre-lock prime, migration 069) */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle label={cfg.paywallPrimeEnabled ? "Warm him up before the wall" : "No pre-lock warmup"} name="paywall_prime_enabled" checked={cfg.paywallPrimeEnabled} onChange={(v) => set("paywallPrimeEnabled", v)} accent="soft" />
          {/* Unconditional hidden input, same pattern as paywall_as_voice above. */}
          <input type="hidden" name="paywall_prime_as_voice" value={String(cfg.paywallPrimeVoice)} />
          {cfg.paywallPrimeEnabled && (
            <>
              <div className="w-40"><Field label="Messages before he runs out" name="paywall_prime_before" type="number" min={1} defaultValue={cfg.paywallPrimeBefore} /></div>
              <Toggle label="Send warmup as a voice note" name="_paywall_prime_as_voice_toggle" checked={cfg.paywallPrimeVoice} onChange={(v) => set("paywallPrimeVoice", v)} accent="soft" />
            </>
          )}
        </div>
        {cfg.paywallPrimeEnabled && (
          <Area label="Warmup steer (optional)" name="paywall_prime_instruction" rows={2} placeholder="e.g. hint she's got more coming, build the anticipation" defaultValue={defaults.paywall_prime_instruction} />
        )}

        {/* Pick up after they pay (post-lock resume, migration 069) */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle label={cfg.paywallResumeEnabled ? "Pick up warmly after he pays" : "No post-pay pickup"} name="paywall_resume_enabled" checked={cfg.paywallResumeEnabled} onChange={(v) => set("paywallResumeEnabled", v)} accent="soft" />
          {/* Unconditional hidden input for the free/paid choice. */}
          <input type="hidden" name="paywall_resume_free" value={String(cfg.paywallResumeFree)} />
          {cfg.paywallResumeEnabled && (
            <Toggle label={cfg.paywallResumeFree ? "Send the pickup image free" : "Send the pickup image paid"} name="_paywall_resume_free_toggle" checked={cfg.paywallResumeFree} onChange={(v) => set("paywallResumeFree", v)} accent="soft" />
          )}
        </div>
        {cfg.paywallResumeEnabled && (
          <>
            <Area label="Pickup steer (optional)" name="paywall_resume_instruction" rows={2} placeholder="e.g. thank him, pick the mood back up right where it left off" defaultValue={defaults.paywall_resume_instruction} />
            <Field label="Promised image (media id, blank = auto)" name="paywall_resume_media_id" defaultValue={defaults.paywall_resume_media_id} placeholder="blank = she auto-picks" />
          </>
        )}
      </div>

      {/* ── FLOWS ── */}
      <div className="grid gap-3">
        <Group label="Flows / re-engagement" />
        <Toggle label={cfg.dripEnabled ? "Flow is on" : "Flow is off"} name="drip_enabled" checked={cfg.dripEnabled} onChange={(v) => set("dripEnabled", v)} accent="soft" />
        {/* Win-back lapse threshold (winback_lapse_days) is NOT edited here. It is
            a per-clone flow setting and lives on the Flows page, where
            saveCampaign writes it to the clones row, which is the only place
            bot/src/campaign.ts reads it from (wired 2026-07-29). It was previously
            edited here and saved into app_settings, which nothing ever read back.
            Do not add it back to this fleet-defaults form. */}
        {cfg.dripEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
            <Field label="Follow-up if quiet mid-chat (minutes, 0 = off)" name="followup_after_minutes" type="number" defaultValue={defaults.followup_after_minutes ?? 0} placeholder="0" />
          </div>
        )}
      </div>

      {/* ── VOICE TUNING ── */}
      <div className="grid gap-3">
        <Group label="Voice tuning (ElevenLabs)" />
        <Field label="ElevenLabs model" name="eleven_model" defaultValue={defaults.eleven_model ?? "eleven_multilingual_v2"} placeholder="eleven_multilingual_v2" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Slider label="Stability" name="voice_stability" value={cfg.stability} onChange={(v) => set("stability", v)} />
          <Slider label="Similarity" name="voice_similarity" value={cfg.similarity} onChange={(v) => set("similarity", v)} />
          <Slider label="Style" name="voice_style" value={cfg.style} onChange={(v) => set("style", v)} />
          <Slider label="Speed" name="voice_speed" value={cfg.speed} onChange={(v) => set("speed", v)} min={0.5} max={1.2} />
        </div>
        <input type="hidden" name="voice_speaker_boost" value={String(cfg.speakerBoost)} />
        <Toggle label="Speaker boost" name="_sb_toggle" checked={cfg.speakerBoost} onChange={(v) => set("speakerBoost", v)} accent="soft" />
      </div>

      {/* ── TIMING & MEMORY ── */}
      <div className="grid gap-3">
        <Group label="Response timing & memory" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Slider label="Min wait" name="response_wait_min" value={cfg.waitMin} onChange={(v) => set("waitMin", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
          <Slider label="Max wait" name="response_wait_max" value={cfg.waitMax} onChange={(v) => set("waitMax", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
          <Slider label="Past messages remembered" name="memory_window" value={cfg.memoryWindow} onChange={(v) => set("memoryWindow", v)} min={1} max={100} step={1} format={(v) => `${v} msgs`} />
        </div>
      </div>

      {/* ── DEFAULT MODELS ── */}
      <div className="grid gap-3">
        <Group label="Default models" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MODEL_FIELDS.map((m) => (
            <ModelSelect
              key={m.name}
              label={m.label}
              name={m.name}
              models={models}
              defaultValue={(defaults[m.name as keyof Clone] as string) || m.def}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" onClick={() => setSaved(false)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep">
          Save defaults
        </button>
        {saved && <span className="text-sm font-medium text-good">Saved ✓</span>}
      </div>
    </form>
  );
}
