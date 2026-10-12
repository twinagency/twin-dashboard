"use client";

import { useEffect, useState } from "react";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import { describeVisionAnalysisModels } from "@/lib/vision-model";
import ModelSelect from "./ModelSelect";
import {
  Field,
  MODEL_FIELDS,
  Select,
  Slider,
  Toggle,
} from "./clone/fields";
import { CategoryPricingEditor, SpoilMenuEditor } from "./clone/editors";
import { useCloneConfig } from "./clone/useCloneConfig";
import { saveCloneDefaults } from "@/app/settings/actions";

// Operational defaults for new and selected existing clones. Personality,
// identity, creator-specific style and welcome prose intentionally stay on each
// creator. Field names match `clones` columns for safe, allowlisted seeding.
export default function CloneDefaultsForm({ defaults }: { defaults: Partial<Clone> }) {
  const [models, setModels] = useState<OrModel[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [cfg, set] = useCloneConfig(defaults);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d) => Array.isArray(d) && setModels(d)).catch(() => {});
  }, []);

  const pushOpts = [
    { value: "none" as const, label: "None" },
    { value: "low" as const, label: "Low" },
    { value: "medium" as const, label: "Med" },
    { value: "high" as const, label: "High" },
    { value: "relentless" as const, label: "Max" },
  ];
  const Group = ({ label }: { label: string }) => (
    <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{label}</span>
  );

  return (
    <form
      action={async (fd) => {
        setSaveState("saving");
        setSaveMessage(null);
        try {
          const result = await saveCloneDefaults(fd);
          setSaveState("saved");
          setSaveMessage(
            result.appliedFollowers > 0
              ? `Saved and applied to ${result.appliedFollowers} creator${result.appliedFollowers === 1 ? "" : "s"}.`
              : "Defaults saved.",
          );
        } catch (error) {
          setSaveState("error");
          setSaveMessage(error instanceof Error ? error.message : "Could not save defaults");
        }
      }}
      onSubmit={(event) => {
        if (!window.confirm("Save this operational template and apply it now to every creator following the fleet default?")) {
          event.preventDefault();
        }
      }}
      className="mt-4 grid gap-6"
    >
      {/* Personality, explicitness, warmth, curiosity, playfulness, memory-use
          style, emoji style and welcome prose stay per creator. They are not
          rendered, persisted, or mass-applied from this operational template. */}
      <div className="grid gap-3">
        <Group label="AI mode & sales behavior" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="AI mode" name="ai_mode" value={cfg.aiMode} onChange={(v) => set("aiMode", v)} options={[{ value: "classic", label: "Classic" }, { value: "smart", label: "Smart" }]} />
          <input type="hidden" name="smart_split" value={String(cfg.smartSplit)} />
          {cfg.aiMode === "smart" && (
            <Toggle label="Two-model split (writer + decider)" name="_smart_split_toggle" checked={cfg.smartSplit} onChange={(v) => set("smartSplit", v)} accent="soft" />
          )}
          <Select label="Upsell push" name="push_level" value={cfg.pushLevel} onChange={(v) => set("pushLevel", v)} options={pushOpts} />
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
          <Field label="Starting credits (free)" name="starting_credits" type="number" min={0} step={1} defaultValue={defaults.starting_credits ?? 20} />
          <Field label="Pack size (msgs)" name="credit_pack_size" type="number" min={1} step={1} defaultValue={defaults.credit_pack_size ?? 30} />
          <Field label="Pack price (⭐)" name="credit_pack_price_stars" type="number" min={1} step={1} defaultValue={defaults.credit_pack_price_stars ?? 299} />
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
          hint="What a tip gives back in message credits, for new creators. 0 means tips give no credits. At 5, a 1000 star tip gives 50 messages. Rounded down, and set per creator on its own page."
        />
      </div>

      <div className="grid gap-3">
        <Group label="Discounts" />
        <Toggle label={cfg.discountsEnabled ? "She can offer discounts" : "No discounts"} name="discounts_enabled" checked={cfg.discountsEnabled} onChange={(v) => set("discountsEnabled", v)} accent="soft" />
        {cfg.discountsEnabled ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Slider label="Photos max discount" name="discount_max_photo" value={cfg.discMaxPhoto} onChange={(v) => set("discMaxPhoto", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Videos max discount" name="discount_max_video" value={cfg.discMaxVideo} onChange={(v) => set("discMaxVideo", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Bundles max discount" name="discount_max_bundle" value={cfg.discMaxBundle} onChange={(v) => set("discMaxBundle", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Message packs max discount" name="discount_max_credits" value={cfg.discMaxCredits} onChange={(v) => set("discMaxCredits", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
            </div>
            {/* Migration 095's two dial groups, added to the template
                2026-09-01 (were missing here, only present per-clone in
                ConfigSections — this whole audit pass exists because the
                template had drifted behind the real Config tab). */}
            <div className="border-t border-line pt-2 text-xs font-semibold uppercase tracking-wide text-muted">How hard each level bites</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Slider label="Light" name="discount_level_light_pct" value={cfg.discLevelLight} onChange={(v) => set("discLevelLight", v)} min={1} max={100} step={1} format={(v) => `${v}%`} />
              <Slider label="Medium" name="discount_level_medium_pct" value={cfg.discLevelMedium} onChange={(v) => set("discLevelMedium", v)} min={1} max={100} step={1} format={(v) => `${v}%`} />
              <Slider label="Max" name="discount_level_max_pct" value={cfg.discLevelMax} onChange={(v) => set("discLevelMax", v)} min={1} max={100} step={1} format={(v) => `${v}%`} />
            </div>
            <div className="border-t border-line pt-2 text-xs font-semibold uppercase tracking-wide text-muted">How much a fan reaches, by what he has spent</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              <Slider label="New" name="discount_tier_share_none_pct" value={cfg.discTierNone} onChange={(v) => set("discTierNone", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
              <Slider label="Low" name="discount_tier_share_low_pct" value={cfg.discTierLow} onChange={(v) => set("discTierLow", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
              <Slider label="Mid" name="discount_tier_share_mid_pct" value={cfg.discTierMid} onChange={(v) => set("discTierMid", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
              <Slider label="High" name="discount_tier_share_high_pct" value={cfg.discTierHigh} onChange={(v) => set("discTierHigh", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
              <Slider label="Whale" name="discount_tier_share_whale_pct" value={cfg.discTierWhale} onChange={(v) => set("discTierWhale", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
            </div>
          </div>
        ) : (
          /* Same trap ConfigSections already fixed for the per-clone page: with
             discounts off these fields don't render, so posting nothing would
             either zero them (rowFromForm's num(...,0) fallback for a per-clone
             save) or, here, simply drop them from the saved template blob on
             the next Save (saveCloneDefaults skips a null field rather than
             writing 0 — but a dropped key still loses the value on the NEXT
             save, since the blob is replaced whole, not merged). Mirroring cfg
             keeps whatever was set before the toggle was switched off. */
          <>
            <input type="hidden" name="discount_max_photo" value={cfg.discMaxPhoto} />
            <input type="hidden" name="discount_max_video" value={cfg.discMaxVideo} />
            <input type="hidden" name="discount_max_bundle" value={cfg.discMaxBundle} />
            <input type="hidden" name="discount_max_credits" value={cfg.discMaxCredits} />
            <input type="hidden" name="discount_level_light_pct" value={cfg.discLevelLight} />
            <input type="hidden" name="discount_level_medium_pct" value={cfg.discLevelMedium} />
            <input type="hidden" name="discount_level_max_pct" value={cfg.discLevelMax} />
            <input type="hidden" name="discount_tier_share_none_pct" value={cfg.discTierNone} />
            <input type="hidden" name="discount_tier_share_low_pct" value={cfg.discTierLow} />
            <input type="hidden" name="discount_tier_share_mid_pct" value={cfg.discTierMid} />
            <input type="hidden" name="discount_tier_share_high_pct" value={cfg.discTierHigh} />
            <input type="hidden" name="discount_tier_share_whale_pct" value={cfg.discTierWhale} />
          </>
        )}
      </div>

      {/* ── MONEY GUARDRAILS (added 2026-09-01, mirrors ConfigSections' card
          of the same name — these are the two hard ceilings that sit above
          everything else money-related, so the template should set them too) ── */}
      <div className="grid gap-3">
        <Group label="Money guardrails" />
        <Slider
          label="Absolute discount ceiling"
          name="discount_absolute_max_pct"
          value={cfg.discountAbsoluteMaxPct}
          onChange={(v) => set("discountAbsoluteMaxPct", v)}
          min={1}
          max={100}
          step={1}
          format={(v) => `${v}%`}
        />
        <Field
          label="Single-tip sanity ceiling (Stars)"
          name="tip_max_stars"
          type="number"
          min={1}
          step={1}
          defaultValue={defaults.tip_max_stars ?? 100000}
        />
      </div>

      {/* ── BEHAVIOR GUARDRAILS (added 2026-09-01) ── */}
      <div className="grid gap-3">
        <Group label="Behavior guardrails" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            label="If she types an invented price"
            name="price_guard_mode"
            value={cfg.priceGuardMode}
            onChange={(v) => set("priceGuardMode", v)}
            options={[
              { value: "block" as const, label: "Block" },
              { value: "log" as const, label: "Watch only" },
              { value: "off" as const, label: "Off" },
            ]}
          />
          <Select
            label="If she cannot generate a reply"
            name="silence_fallback_mode"
            value={cfg.silenceFallbackMode}
            onChange={(v) => set("silenceFallbackMode", v)}
            options={[
              { value: "on" as const, label: "Send a recovery line" },
              { value: "off" as const, label: "Say nothing" },
            ]}
          />
          <Select
            label="Repeating herself"
            name="variety_guard"
            value={cfg.varietyGuard}
            onChange={(v) => set("varietyGuard", v)}
            options={[
              { value: "normal" as const, label: "Normal" },
              { value: "strict" as const, label: "Strict" },
              { value: "off" as const, label: "Off" },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Toggle label={cfg.realismEffectsEnabled ? "Reactions & message effects on" : "Reactions & message effects off"} name="realism_effects_enabled" checked={cfg.realismEffectsEnabled} onChange={(v) => set("realismEffectsEnabled", v)} accent="soft" />
          <Toggle label={cfg.strictOnboardingSteps ? "Strict onboarding steps on" : "Strict onboarding steps off"} name="strict_onboarding_steps" checked={cfg.strictOnboardingSteps} onChange={(v) => set("strictOnboardingSteps", v)} accent="soft" />
        </div>
      </div>

      {/* ── PACING & RETRIES (added 2026-09-01) ── */}
      <div className="grid gap-3">
        <Group label="Pacing & retries" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Slider label="Bubble delay, minimum" name="bubble_delay_min_ms" value={cfg.bubbleDelayMinMs} onChange={(v) => set("bubbleDelayMinMs", v)} min={0} max={5000} step={100} format={(v) => `${v}ms`} />
          <Slider label="Bubble delay, maximum" name="bubble_delay_max_ms" value={cfg.bubbleDelayMaxMs} onChange={(v) => set("bubbleDelayMaxMs", v)} min={0} max={5000} step={100} format={(v) => `${v}ms`} />
        </div>
        <Slider label="Model retry attempts before giving up" name="llm_max_tries" value={cfg.llmMaxTries} onChange={(v) => set("llmMaxTries", v)} min={1} max={5} step={1} format={(v) => `${v}×`} />
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

      {/* ── PAYWALL ── */}
      <div className="grid gap-3">
        <Group label="Out of messages flow" />
        <p className="text-xs text-muted">
          Timing and enablement can follow the fleet default. Customer-facing copy and promised media stay creator-specific.
        </p>
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
        {/* Pick up after they pay (post-lock resume, migration 069) */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle label={cfg.paywallResumeEnabled ? "Pick up warmly after he pays" : "No post-pay pickup"} name="paywall_resume_enabled" checked={cfg.paywallResumeEnabled} onChange={(v) => set("paywallResumeEnabled", v)} accent="soft" />
          {/* Unconditional hidden input for the free/paid choice. */}
          <input type="hidden" name="paywall_resume_free" value={String(cfg.paywallResumeFree)} />
          {cfg.paywallResumeEnabled && (
            <Toggle label={cfg.paywallResumeFree ? "Send the pickup image free" : "Send the pickup image paid"} name="_paywall_resume_free_toggle" checked={cfg.paywallResumeFree} onChange={(v) => set("paywallResumeFree", v)} accent="soft" />
          )}
        </div>
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
              effectiveFor={m.name === "vision_model" ? describeVisionAnalysisModels : undefined}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saveState === "saving"} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep disabled:opacity-50">
          {saveState === "saving" ? "Saving…" : "Save defaults"}
        </button>
        {saveMessage && (
          <span role={saveState === "error" ? "alert" : "status"} className={`text-sm font-medium ${saveState === "error" ? "text-crit" : "text-good"}`}>
            {saveMessage}
          </span>
        )}
      </div>
    </form>
  );
}
