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
import { CategoryPricingEditor, SpoilMenuEditor, SubscriptionTiersEditor } from "./clone/editors";
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
          <Select label="Flirtiness" name="sexual_level" value={cfg.sexualLevel} onChange={(v) => set("sexualLevel", v)} options={levelOpts} />
          <Select label="How explicit" name="nsfw_level" value={cfg.nsfwLevel} onChange={(v) => set("nsfwLevel", v)} options={levelOpts} />
          <Select label="Upsell push" name="push_level" value={cfg.pushLevel} onChange={(v) => set("pushLevel", v)} options={levelOpts} />
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

      <div className="grid gap-3">
        <Group label="Subscriptions / VIP" />
        <input type="hidden" name="subscriptions_enabled" value={String(cfg.subscriptionsEnabled)} />
        <Toggle label={cfg.subscriptionsEnabled ? "She can offer VIP subscriptions" : "No subscriptions"} name="_subs_toggle" checked={cfg.subscriptionsEnabled} onChange={(v) => set("subscriptionsEnabled", v)} accent="soft" />
        <SubscriptionTiersEditor cfg={cfg} set={set} />
      </div>

      {/* ── ENGAGEMENT / ONBOARDING ── */}
      <div className="grid gap-3">
        <Group label="New user flow" />
        <Area label="Welcome greeting instruction (optional)" name="welcome_instruction" rows={2} placeholder="e.g. greet him warmly, introduce yourself, ask his name" defaultValue={defaults.welcome_instruction} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Voice-note reply on fan's Nth message (blank = off)" name="onboarding_voice_after" type="number" defaultValue={defaults.onboarding_voice_after} placeholder="e.g. 3" />
          <Field label="Photo bundle after fan's Nth message" name="welcome_bundle_after" type="number" defaultValue={defaults.welcome_bundle_after ?? 10} />
        </div>
        <Area label="Onboarding voice instruction (optional)" name="onboarding_voice_instruction" rows={2} placeholder="e.g. say hi in her voice, keep it short and warm" defaultValue={defaults.onboarding_voice_instruction} />
        <Field label="…or send the bundle on a timer if he goes quiet (minutes, blank = off)" name="welcome_bundle_after_minutes" type="number" defaultValue={defaults.welcome_bundle_after_minutes} placeholder="e.g. 30" />
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
      </div>

      {/* ── CAMPAIGNS ── */}
      <div className="grid gap-3">
        <Group label="Campaigns / re-engagement" />
        <Toggle label={cfg.dripEnabled ? "Campaign is on" : "Campaign is off"} name="drip_enabled" checked={cfg.dripEnabled} onChange={(v) => set("dripEnabled", v)} accent="soft" />
        {/* Win-back lapse threshold used to be editable here (winback_lapse_days),
            but the runtime hardcodes a fixed 7-day threshold and deliberately does
            not read this column (see isReturningLapsedSpender in bot/src/campaign.ts
            and the matching comment in dashboard/app/drip/actions.ts). The field was
            removed 2026-07-27 because it saved into app_settings and nothing ever
            read it back, an operator "setting" something that silently did nothing.
            The clones.winback_lapse_days column and its Clone type field are kept
            (never dropped from a live DB) but are otherwise legacy/unused. */}
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
