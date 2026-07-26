"use client";

import { useState } from "react";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "../ModelSelect";
import {
  Area,
  DEFAULT_PAYWALL_BUTTON,
  DEFAULT_PAYWALL_MESSAGE,
  Field,
  LANGUAGE_OPTIONS,
  MODEL_FIELDS,
  RECOMMENDED,
  FieldLabel,
  Info,
  Section,
  Segmented,
  Select,
  Slider,
  SubHead,
  TIMEZONE_OPTIONS,
  Toggle,
  ToggleCard,
  WEAK,
  inputCls,
} from "./fields";
import type { CloneConfigState, SetConfig } from "./useCloneConfig";
import { CategoryPricingEditor, SpoilMenuEditor } from "./editors";
import { BetaBadge } from "../ui/primitives";

// ── Configure page IA ─────────────────────────────────────────────────────────
// Deliberately shallow: 4 groups, one card per topic. Related settings live
// together in a single card rather than being split across near-empty ones,
// so the page is tab → card → fields, never tab → card → sub-card → fields.
//   Identity     — who she is: name, facts, socials, vibe, personality dials,
//                  hard limits, onboarding questionnaire (the last two are
//                  rendered by CloneForm into this tab's slot)
//   Config       — the machinery: connection, AI mode, what she can send,
//                  models, timing, memory, voice tuning
//   Money        — credits, pricing, tips, VIP, discounts
//   View         — read-only Flow + Prompts (rendered by CloneForm)
//   Monetization — credits+paywall, media+tips, VIP (create mode only; in edit
//                  mode this is a page-level tab, see CloneForm)
//   Advanced     — models, voice tuning, timing + memory
// The old separate Media & Safety tab folded into Her (it was one card's worth
// of toggles); Emojis/Realism folded into Personality; Timing/Memory merged.
// Engagement moved OUT entirely: the new-fan flow, the follow-up nudge and the
// campaign toggle now live on the Campaigns page (/drip) with the campaign
// steps they belong to, and are saved by saveCampaign — not by this form.
// All groups stay mounted at once (just hidden via CSS) so switching tabs never
// drops an uncontrolled field's value before Save.
type Tab = string;
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "identity", label: "🪪 Identity", hint: "Who she is: facts, socials, vibe, personality, limits" },
  { key: "config", label: "⚙️ Config", hint: "Connection, AI mode, media, models, timing" },
  { key: "money", label: "💰 Monetization", hint: "Credits, pricing, tips, VIP, discounts" },
];

// Segmented dial options — same low/medium/high values the Selects submitted;
// the long descriptions moved into hover titles.
const SEG = {
  sexual: [
    { value: "low" as const, label: "😊 Low", title: "Mostly cute" },
    { value: "medium" as const, label: "😘 Medium", title: "Naturally flirty" },
    { value: "high" as const, label: "🔥 High", title: "Openly forward" },
  ],
  nsfw: [
    { value: "low" as const, label: "🙈 Low", title: "Keeps it PG-13" },
    { value: "medium" as const, label: "😏 Medium", title: "Dirty when led" },
    { value: "high" as const, label: "🔞 High", title: "Fully explicit" },
  ],
  push: [
    { value: "low" as const, label: "🍃 Low", title: "Rarely brings it up" },
    { value: "medium" as const, label: "💵 Medium", title: "Offers at good moments" },
    { value: "high" as const, label: "🤑 High", title: "Proactively upsells" },
  ],
  emoji: [
    { value: "low" as const, label: "A little", title: "Most messages have none" },
    { value: "medium" as const, label: "Some", title: "About every other message" },
    { value: "high" as const, label: "A lot", title: "Most messages have one or two" },
  ],
};

// The full, shared block of clone settings — identical between Configure (edit)
// and Create, so new clones never miss an option. `clone` seeds uncontrolled
// fields; toggles/dials/selects are controlled through cfg/set.
export default function ConfigSections({
  cfg,
  set,
  clone,
  models,
  mode,
  showMoney = true,
  tab: tabProp,
  onTabChange,
  extraTabs = [],
  leadingTabs = [],
  identityWhoSlot,
  identitySocialsSlot,
  identityVibeSlot,
  identityLimitsSlot,
  identityQuestionnaireSlot,
}: {
  cfg: CloneConfigState;
  set: SetConfig;
  clone?: Partial<Clone>;
  models: OrModel[];
  mode: "create" | "edit";
  // Edit mode pulls money out to the page-level Monetization tab — pass false
  // there so the group + its tab disappear here (MonetizationSections renders
  // them instead, still inside the same <form>).
  showMoney?: boolean;
  // Optional controlled-tab mode: CloneForm owns the active tab so it can add
  // its own entries (Prompts / Flow) to this same tab strip and render their
  // content itself, below.
  tab?: Tab;
  onTabChange?: (t: Tab) => void;
  extraTabs?: { key: Tab; label: string; hint: string }[];
  // Tabs pinned BEFORE the built-in ones (PPVs leads the bar).
  leadingTabs?: { key: Tab; label: string; hint: string }[];
  // CloneForm renders the structured persona facts, hard limits and the
  // onboarding questionnaire into the Identity tab. They live there (not here)
  // because they need the clone's saved intake blob, which only CloneForm has.
  // Identity is composed as two hand-balanced columns rather than left to
  // row-wise auto-placement, which paired the short Socials card against the
  // tall Who-she-is card and left a ~190px void.
  identityWhoSlot?: React.ReactNode;
  identitySocialsSlot?: React.ReactNode;
  identityVibeSlot?: React.ReactNode;
  identityLimitsSlot?: React.ReactNode;
  identityQuestionnaireSlot?: React.ReactNode;
}) {
  const [tabState, setTabState] = useState<Tab>("identity");
  const tab = tabProp ?? tabState;
  const setTab = onTabChange ?? setTabState;
  const visibleTabs = [
    ...leadingTabs,
    ...TABS.filter((t) => showMoney || t.key !== "money"),
    ...extraTabs,
  ];
  // Condensed 2-col grid (wide screens): small sections pair up side by side,
  // big ones span both via Section's className="xl:col-span-2".
  const show = (t: Tab) =>
    tab !== t
      ? "hidden"
      : t === "money"
        ? "grid items-start gap-3 xl:grid-cols-3"
        : t === "identity"
          ? "grid items-start gap-3 sm:grid-cols-2"
          : "grid gap-3 sm:grid-cols-2";

  return (
    <div className="grid gap-4">
      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl bg-muted/10 p-1">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hint}
            onClick={() => setTab(t.key)}
            className={
              "flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition " +
              (tab === t.key
                ? "bg-panel text-ink shadow-sm"
                : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PERSONA ─────────────────────────────────────────────── */}
      <div className={show("identity")}>
        {/* Columns are hand-balanced to end at the same height. */}
        <div className="grid content-start gap-3">
          {identityWhoSlot}
          {identitySocialsSlot}
          {identityQuestionnaireSlot}
        </div>
        <div className="grid content-start gap-3">
  {/* Personality, emoji style and realism touches were three separate cards
            for what is really one question — how she comes across. One card. */}
        <Section
          icon="💋"
          accent="pink"
          title="Personality & style"
          hint="Her tone, emoji use and human touches. Hard limits and prices stay locked in code."
          tip="These never override the built-in hard limits, and money stays locked in code (push only changes how eager she is, never prices)."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Segmented
              label="Flirtiness"
              name="sexual_level"
              value={cfg.sexualLevel}
              onChange={(v) => set("sexualLevel", v)}
              options={SEG.sexual}
              accent="pink"
              hint="Does SHE start it: how boldly she flirts first."
            />
            <Segmented
              label="NSFW"
              name="nsfw_level"
              value={cfg.nsfwLevel}
              onChange={(v) => set("nsfwLevel", v)}
              options={SEG.nsfw}
              accent="red"
              hint="How graphic once things heat up."
            />
            <Segmented
              label="Content pushing"
              name="push_level"
              value={cfg.pushLevel}
              onChange={(v) => set("pushLevel", v)}
              options={SEG.push}
              accent="green"
              hint="How eagerly she upsells. Never changes prices."
            />
          </div>

          {/* Emoji settings and realism toggles sit side by side - stacked, they
              pushed this card well past a screen on their own. */}
          <div className="grid gap-3 border-t border-line pt-2 lg:grid-cols-2">
          <div className="grid content-start gap-1.5">
          <SubHead emoji="😊" label="Emojis" tip="Applies to text and photo replies, never voice notes." />
          <Toggle label={cfg.emojis ? "Uses emojis" : "No emojis at all"} name="emojis_enabled" checked={cfg.emojis} onChange={(v) => set("emojis", v)} accent="soft" />
          {cfg.emojis && (
            <Segmented label="Amount" name="emoji_amount" value={cfg.emojiAmount} onChange={(v) => set("emojiAmount", v)} options={SEG.emoji} accent="amber" />
          )}
          {cfg.emojis && (
            <label className="block">
              <FieldLabel label="Allowed emojis" hint="When set, these are the ONLY emojis she can ever use. Leave blank to let her choose any (still sparingly)." />
              <input
                name="emoji_allowlist"
                value={cfg.emojiList}
                onChange={(e) => set("emojiList", e.target.value)}
                placeholder="e.g. ❤️ 😘 💕 🥹 (blank = any)"
                className={inputCls}
              />
              <span className="mt-0.5 block text-[10px] text-muted" title="When set, these are the ONLY emojis she can ever use. Leave blank to let her choose any (still sparingly).">
                When set, these are the ONLY emojis she can use.
              </span>
            </label>
          )}
          {!cfg.emojis && <input type="hidden" name="emoji_allowlist" value="" />}
          </div>

          <div className="grid content-start gap-1.5">
          <SubHead
            emoji="✨"
            label="Realism touches"
            tip="All fail-soft: if Telegram doesn't support one on a chat, it's quietly skipped and never affects her reply."
          />
          {/* Reactions and message effects were demo-only and never verified on a
              business chat, so their toggles are gone. Their saved values still
              submit as hidden inputs — updateClone writes both columns on every
              save, so dropping the inputs entirely would silently disable them. */}
          <input type="hidden" name="reactions_enabled" value={String(cfg.reactions)} />
          <input type="hidden" name="message_effects_enabled" value={String(cfg.messageEffects)} />
          <div className="grid gap-1.5">
            <ToggleCard emoji="👀" label="Read receipts" title="Marks his message read" name="read_receipts_enabled" checked={cfg.readReceipts} onChange={(v) => set("readReceipts", v)} />
          </div>
          </div>
          </div>

          {/* Language lock - off = she mirrors whatever the fan writes. On = she
              only ever writes in the picked languages, and the runtime retries a
              reply that drifts into a foreign script (a model randomly emitting
              Chinese, etc.). Pick none = English is assumed. */}
          <div className="grid content-start gap-1.5 border-t border-line pt-2">
            <SubHead emoji="🌐" label="Language" tip="Force her replies into set languages instead of mirroring the fan. Catches a model randomly switching to Chinese/another script and retries it." />
            <input type="hidden" name="language_lock" value={String(cfg.languageLock)} />
            <Toggle
              label={cfg.languageLock ? "Force set languages" : "Mirrors the fan's language"}
              name="_language_lock_toggle"
              checked={cfg.languageLock}
              onChange={(v) => set("languageLock", v)}
              accent="soft"
            />
            {cfg.languageLock && (
              <>
                <FieldLabel label="Allowed languages" hint="She only writes in these. First picked is her primary. Pick none = English. A reply drifting into any other script is auto-retried." />
                <input type="hidden" name="languages" value={JSON.stringify(cfg.languages)} />
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGE_OPTIONS.map((o) => {
                    const on = cfg.languages.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() =>
                          set("languages", (prev) =>
                            prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value],
                          )
                        }
                        aria-pressed={on}
                        className={
                          "rounded-full border px-3 py-1 text-xs font-medium transition " +
                          (on
                            ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-300"
                            : "border-line text-muted hover:border-accent/60")
                        }
                      >
                        {o.value}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {!cfg.languageLock && <input type="hidden" name="languages" value="[]" />}
          </div>
        </Section>
          {identityVibeSlot}
          {identityLimitsSlot}
        </div>
      </div>

      {/* ── CONFIG ──────────────────────────────────────────────── */}
      <div className={show("config")}>
      <Section
        icon="🔌"
        accent="blue"
        title="Connection & mode"
        cols={2}
        hint="Bot token from @BotFather."
      >
        <Field
          label="Bot token"
          name="bot_token"
          defaultValue={clone && clone.bot_token !== "PLACEHOLDER" ? clone.bot_token : ""}
          required
          placeholder="1234:ABC..."
          secret
        />
        {mode === "edit" ? (
          <div className="block">
            <span className="mb-0.5 block text-xs text-muted">Status</span>
            <input type="hidden" name="status" value={cfg.active ? "active" : "paused"} />
            <Toggle label={cfg.active ? "Active" : "Paused"} name="_status_toggle" checked={cfg.active} onChange={(v) => set("active", v)} />
          </div>
        ) : (
          <input type="hidden" name="status" value="paused" />
        )}
        <Select
          label="Timezone"
          name="timezone"
          value={cfg.timezone}
          onChange={(v) => set("timezone", v)}
          options={TIMEZONE_OPTIONS}
          hint="She always knows the live date and time in this zone. Default UTC."
        />

        {/* AI mode - used to be its own card, but it's one control; it belongs
            with the rest of "what this clone fundamentally is". */}
        <div
          className="grid gap-1.5 border-t border-line pt-2 sm:col-span-2"
          title="How she decides what to do with each message. Classic follows fixed rules; Smart lets one AI figure it out. Money rules stay the same either way."
        >
          <span className="flex items-center gap-1 text-xs text-muted">🧠 AI mode<Info text="How she decides what to do with each message. Classic follows fixed rules; Smart lets one AI figure it out. Money rules stay the same either way." /></span>
        <input type="hidden" name="ai_mode" value={cfg.aiMode} />
        <input type="hidden" name="smart_split" value={cfg.smartSplit ? "true" : "false"} />
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {(["classic", "smart"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set("aiMode", m)}
              aria-pressed={cfg.aiMode === m}
              className={
                "rounded-md px-4 py-1.5 text-sm font-semibold capitalize transition " +
                (cfg.aiMode === m ? "bg-purple-500/20 text-purple-400" : "text-muted hover:text-ink")
              }
            >
              {m === "classic" ? "🧭 classic" : "🧠 smart"}
            </button>
          ))}
        </div>
        {cfg.aiMode === "smart" && (
          <div className="mt-1 grid gap-2">
            <Toggle
              label="Two-model split (writer + decider)"
              name="_smart_split_toggle"
              checked={cfg.smartSplit}
              onChange={(v) => set("smartSplit", v)}
              accent="soft"
            />
            <p
              className="text-xs leading-relaxed text-muted"
              title={
                cfg.smartSplit
                  ? "On: your Text model writes her replies (use any uncensored model), and your Routing model decides which photo / voice / tip actions fire (must support tool-calling, e.g. Grok or DeepSeek). Set both under Advanced, AI Models."
                  : "Off: one model (your Text model) both writes her replies AND fires actions in a single call. Cheaper, but that model must support tool-calling."
              }
            >
              {cfg.smartSplit
                ? "On: Text model writes, Routing model fires actions. Set both under Advanced."
                : "Off: one model writes AND fires actions. Cheaper, but it must support tool-calling."}
            </p>
          </div>
        )}
        </div>
      </Section>

      {/* Media types, the voice ID and the AI-disclosure toggle used to be a
          whole separate tab holding three thin cards. It's one card. */}
      <Section
        icon="🖼"
        accent="blue"
        title="What she can send"
        hint="What she sends, what she sees, and the bot-question policy."
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <ToggleCard emoji="📷" label="Photos" name="photos_enabled" checked={cfg.photosEnabled} onChange={(v) => set("photosEnabled", v)} />
          <ToggleCard emoji="🎥" label="Videos" name="videos_enabled" checked={cfg.videosEnabled} onChange={(v) => set("videosEnabled", v)} />
          <ToggleCard emoji="🎁" label="Photo bundles" title="Fans can request them" name="bundles_enabled" checked={cfg.bundlesEnabled} onChange={(v) => set("bundlesEnabled", v)} />
          <ToggleCard emoji="🎙" label="Voice messages" name="voice_enabled" checked={cfg.voice} onChange={(v) => set("voice", v)} />
          <ToggleCard emoji="👁" label="Sees fan videos" title="She can see videos fans send her" name="video_vision_enabled" checked={cfg.videoVision} onChange={(v) => set("videoVision", v)} />
        </div>
        <div className="grid gap-2 border-t border-line pt-2 sm:grid-cols-2">
          <ToggleCard
            emoji="✍️"
            label="Live captions"
            title="AI rewrites media captions live instead of sending the saved one"
            name="live_captions_enabled"
            checked={cfg.liveCaptions}
            onChange={(v) => set("liveCaptions", v)}
          />
          <Select
            label="Caption style"
            name="media_caption_mode"
            value={cfg.mediaCaptionMode}
            onChange={(v) => set("mediaCaptionMode", v)}
            options={[
              { value: "inline" as const, label: "On the media" },
              { value: "none" as const, label: "No caption" },
              { value: "separate" as const, label: "Own message, then media" },
            ]}
          />
          <Field
            label="Voice ID"
            name="voice_id"
            defaultValue={clone?.voice_id}
            placeholder="Paste voice ID"
            secret
          />
          <div
            className="block"
            title={`What she does when a fan asks if she's an AI. Default: she stays fully in character as a real woman and deflects. On: she admits she's an AI companion.`}
          >
            <FieldLabel label="🛡 Bot question" hint={`What she does when a fan asks if she's an AI. Default: she stays fully in character as a real woman and deflects. On: she admits she's an AI companion.`} />
            <Toggle
              label={cfg.aiDisclosure ? "Admits she's an AI when asked" : "Stays human (never admits she's AI)"}
              name="ai_disclosure"
              checked={cfg.aiDisclosure}
              onChange={(v) => set("aiDisclosure", v)}
              accent="soft"
            />
          </div>
        </div>
      </Section>

        <Section icon="🎛" accent="purple" title="Voice tuning" hint="ElevenLabs sound controls.">
          <Field
            label="Model"
            name="eleven_model"
            defaultValue={clone?.eleven_model ?? "eleven_multilingual_v2"}
            placeholder="eleven_multilingual_v2"
            hint="e.g. eleven_multilingual_v2 or eleven_turbo_v2_5."
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Slider label="Stability" name="voice_stability" value={cfg.stability} onChange={(v) => set("stability", v)} />
            <Slider label="Similarity" name="voice_similarity" value={cfg.similarity} onChange={(v) => set("similarity", v)} />
            <Slider label="Style" name="voice_style" value={cfg.style} onChange={(v) => set("style", v)} />
            <Slider label="Speed" name="voice_speed" value={cfg.speed} onChange={(v) => set("speed", v)} min={0.5} max={1.2} />
          </div>
          <input type="hidden" name="voice_speaker_boost" value={String(cfg.speakerBoost)} />
          <Toggle label="Speaker boost" name="_sb_toggle" checked={cfg.speakerBoost} onChange={(v) => set("speakerBoost", v)} accent="soft" />
        </Section>

        {/* Timing and memory were a card each for two and one slider. */}
        <Section
          icon="⏱"
          accent="cyan"
          title="Timing & memory"
          hint="Silent wait before typing (random between min and max, 0s = instant), and how far back she remembers."
          tip="Memory: how many past messages she remembers each reply. Higher = better continuity but costs more tokens; lower = cheaper, shorter memory."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Slider label="Min wait" name="response_wait_min" value={cfg.waitMin} onChange={(v) => set("waitMin", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
            <Slider label="Max wait" name="response_wait_max" value={cfg.waitMax} onChange={(v) => set("waitMax", v)} min={0} max={120} step={1} format={(v) => `${v}s`} />
          </div>
          <div className="mt-1 border-t border-line pt-3">
            <Slider label="Memory" name="memory_window" value={cfg.memoryWindow} onChange={(v) => set("memoryWindow", v)} min={1} max={100} step={1} format={(v) => `${v} msgs`} />
          </div>
        </Section>

        <Section
          icon="⚙️"
          accent="blue"
          title="AI Models"
          className="xl:col-span-2"
          hint="Search by name. Price per 1M tokens (in / out). ⭐ Best · 💰 Value · 🪙 Cheapest pinned on top."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {MODEL_FIELDS.map((m) => (
              <ModelSelect
                key={m.name}
                label={m.label}
                name={m.name}
                models={models}
                defaultValue={(clone?.[m.name as keyof Clone] as string) || m.def}
                recommended={RECOMMENDED[m.name]}
                weak={WEAK[m.name]}
              />
            ))}
          </div>
        </Section>
      </div>

      {/* ── MONETIZATION - sections live in MonetizationSections (end of
          file) so edit mode can host them under the page-level Monetization
          tab instead, inside the same <form>. Create mode keeps them here. */}
      {showMoney && (
        <div className={show("money")}>
          <MonetizationSections cfg={cfg} set={set} clone={clone} />
        </div>
      )}
    </div>
  );
}

// ── Monetization sections ─────────────────────────────────────────────────────
// Everything that touches money, grouped into three clearly-colored cards:
//   💬 Credits & paywall  — message charging + the out-of-messages flow
//   🏷 Category pricing   · 🎁 Tips · 💌 Extras · 💸 Discounts — each its own box
// Create mode renders this inside ConfigSections' own Monetization tab; edit
// mode (CloneForm) hosts it under the page-level Monetization tab instead —
// still inside the same <form>, and always mounted (hidden via CSS) so a Save
// from any tab persists these fields too.
export function MonetizationSections({
  cfg,
  set,
  clone,
}: {
  cfg: CloneConfigState;
  set: SetConfig;
  clone?: Partial<Clone>;
}) {
  return (
    <>
      {/* ── 💬 Credits & paywall ─────────────────────────────────── */}
      <Section
        icon="💬"
        accent="green"
        title="Credits & paywall"
        className="xl:col-span-3"
        hint="Telegram Stars. Credits = messages."
      >
        {/* Charge toggle and the three price fields on one row instead of four
            stacked rows. */}
        <div className="grid gap-2 sm:grid-cols-4">
          <Toggle label={cfg.charge ? "Charge for messages" : "Messages are free"} name="charge_messages" checked={cfg.charge} onChange={(v) => set("charge", v)} accent="soft" />
          {cfg.charge && (
            <>
              <Field label="Starting credits" name="starting_credits" type="number" defaultValue={clone?.starting_credits ?? 50} />
              <Field label="Pack size" name="credit_pack_size" type="number" defaultValue={clone?.credit_pack_size ?? 50} />
              <Field label="Pack price" name="credit_pack_price_stars" type="number" defaultValue={clone?.credit_pack_price_stars ?? 199} />
            </>
          )}
        </div>
        <div className="border-t border-line pt-2">
          <SubHead
            emoji="🚧"
            label="Out of messages"
            tip="What a fan sees when he runs out of message credits. The buy-more button is attached automatically."
          />
        </div>
        {/* Plain 2-col split, not two nested sub-cards - the card border around
            each one added a third layer of chrome for no grouping benefit. */}
        <div className="grid items-start gap-3 xl:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">Default</p>
            <div className="grid gap-2">
              {/* Message + button side by side rather than stacked. */}
              <div className="grid items-start gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-0.5 block text-xs text-muted">Message text</span>
                  <textarea name="paywall_default_message" rows={2} value={cfg.paywallDefault} onChange={(e) => set("paywallDefault", e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-muted">Button text</span>
                  <input name="paywall_button_label" value={cfg.paywallButton} onChange={(e) => set("paywallButton", e.target.value)} className={inputCls} />
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  set("paywallDefault", DEFAULT_PAYWALL_MESSAGE);
                  set("paywallButton", DEFAULT_PAYWALL_BUTTON);
                }}
                className="justify-self-start text-[11px] font-medium text-muted underline transition hover:text-ink"
              >
                Reset to default
              </button>
            </div>
          </div>
          <div>
            <Toggle label="Smart first message" hint="Only the very first time a fan runs out, she writes a personal line referencing the chat. Off = the default message is used every time." name="smart_paywall_enabled" checked={cfg.smartPaywall} onChange={(v) => set("smartPaywall", v)} accent="soft" />
            {cfg.smartPaywall && (
              <div className="mt-1.5">
                <Toggle label="As voice note" hint="Sends that first personal out-of-credits line as a voice note instead of text." name="paywall_as_voice" checked={cfg.paywallVoice} onChange={(v) => set("paywallVoice", v)} accent="soft" />
              </div>
            )}
            {/* Toggle above unmounts (and its hidden input with it) when smartPaywall
                is off, so paywall_as_voice would be missing from the form entirely and
                get saved as false — silently discarding the real value. Keep it in the
                submitted form either way. */}
            {!cfg.smartPaywall && <input type="hidden" name="paywall_as_voice" value={String(cfg.paywallVoice)} />}
            <div className="mt-3">
              <Area
                label="Paywall steer"
                name="paywall_instruction"
                rows={2}
                placeholder="e.g. be sweet, remind him what he's missing, gently nudge him to grab more messages"
                defaultValue={clone?.paywall_instruction}
                hint="Steers her first out-of-credits line. Blank = she decides freely."
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 🏷 Category pricing (own box) ────────────────────────── */}
      <Section
        icon="🏷"
        accent="pink"
        title="Category pricing"
        hint="Suggested ⭐ price per content type."
        tip="When you upload a photo/video it's auto-tagged by AI (bikini, lingerie, full nude, ...) and priced from this guide: the highest-priced matching category wins. Leave a price blank on upload to auto-price; type one to override. Prices only ever come from here, she never invents a number."
      >
        <CategoryPricingEditor cfg={cfg} set={set} />
      </Section>

      {/* ── 🎁 Tips (own box) ────────────────────────────────────── */}
      <Section
        icon="🎁"
        accent="amber"
        title="Tips"
        hint="She can ask to be spoiled with Stars."
        tip="Fans tip in Telegram Stars. Recorded as tip revenue, never as message credits. The spoil menu below is what he sees when he wants to tip but names no amount."
      >
        <Toggle
          label={cfg.tips ? "She can ask for tips" : "No tips"}
          name="tips_enabled"
          checked={cfg.tips}
          onChange={(v) => set("tips", v)}
          accent="soft"
        />
        {cfg.tips && <SpoilMenuEditor cfg={cfg} set={set} />}
      </Section>

      {/* Extras is one toggle - stacked with Discounts in a shared column
          so it stops padding out to a full row height. */}
      <div className="grid content-start gap-3">
        {/* ── 💌 Extras (own box) ──────────────────────────────────── */}
        <Section
          icon="💌"
          accent="cyan"
          title="Extras"
          hint="Automatic follow-ups after money changes hands."
        >
          <ToggleCard
            emoji="💌"
            label="Auto thank-you"
            title="She sends a thank-you after any purchase or gift"
            name="thank_you_enabled"
            checked={cfg.thankYou}
            onChange={(v) => set("thankYou", v)}
          />
        </Section>
        {/* ── 💸 Discounts (own box) ───────────────────────────────── */}
        <Section
          icon="💸"
          accent="green"
          title={<>Discounts <BetaBadge /></>}
          hint="She picks when and how hard; % capped here."
          tip="Let her offer a limited discount to close a sale. She only decides WHEN and how hard (light/medium/max); the % is capped by what you set here and the price is always computed in code. 0 = never discount that type. Beta: ships inert until you set caps above zero."
        >
          <Toggle label={cfg.discountsEnabled ? "She can offer discounts" : "No discounts"} name="discounts_enabled" checked={cfg.discountsEnabled} onChange={(v) => set("discountsEnabled", v)} accent="soft" />
          {cfg.discountsEnabled && (
            <div className="grid gap-2">
              <Slider label="Photos" name="discount_max_photo" value={cfg.discMaxPhoto} onChange={(v) => set("discMaxPhoto", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Videos" name="discount_max_video" value={cfg.discMaxVideo} onChange={(v) => set("discMaxVideo", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Bundles" name="discount_max_bundle" value={cfg.discMaxBundle} onChange={(v) => set("discMaxBundle", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Message packs" name="discount_max_credits" value={cfg.discMaxCredits} onChange={(v) => set("discMaxCredits", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
            </div>
          )}
        </Section>
      </div>

      {/* VIP subscriptions removed from the UI (unverified beta). The columns
          are still written by updateClone on every save, so the current values
          ride along as hidden inputs — dropping them outright would silently
          flip subscriptions off and wipe any tiers already configured. */}
      <input type="hidden" name="subscriptions_enabled" value={String(cfg.subscriptionsEnabled)} />
      <input
        type="hidden"
        name="subscription_tiers"
        value={JSON.stringify(
          cfg.subscriptionTiers
            .map((t) => ({
              name: (t.name ?? "").trim(),
              price_stars: Math.max(0, Math.round(Number(t.price_stars) || 0)),
              monthly_credits: Math.max(0, Math.round(Number(t.monthly_credits) || 0)),
              priority: !!t.priority,
              exclusive: !!t.exclusive,
              unlimited: !!t.unlimited,
              discount_boost: Math.min(100, Math.max(0, Math.round(Number(t.discount_boost) || 0))),
            }))
            .filter((t) => t.name && t.price_stars >= 1),
        )}
      />
    </>
  );
}

