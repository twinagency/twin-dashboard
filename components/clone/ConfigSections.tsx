"use client";

import { useState } from "react";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "../ModelSelect";
import {
  Area,
  Collapse,
  DEFAULT_PAYWALL_BUTTON,
  DEFAULT_PAYWALL_MESSAGE,
  ELEVEN_MODEL_OPTIONS,
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
  selectCls,
} from "./fields";
import type { CloneConfigState, SetConfig } from "./useCloneConfig";
import { CategoryPricingEditor, SpoilMenuEditor } from "./editors";
import { BetaBadge } from "../ui/primitives";
// New dedicated file (migration 056 monetization sequence) — kept out of this
// file's own card definitions so it doesn't collide with concurrent edits here.
import MonetizationSequenceFields from "./MonetizationSequenceFields";

// ── Configure page IA ─────────────────────────────────────────────────────────
// Re-sorted 2026-07-26 by one rule: Identity is anything a fan could ask her
// about (facts), Config is the machinery an operator dials in for HOW she
// behaves, Monetization is money, Advanced is power-user settings nobody
// touches configuring a fresh clone. Deliberately shallow: one card per topic,
// so the page is tab → card → fields, never tab → card → sub-card → fields.
//   Identity     — who she is: name, physical/creator/content canon, socials,
//                  vibe, behaviour policy, daily rhythm, hard limits, the
//                  onboarding questionnaire (rendered by CloneForm into this
//                  tab's slots — they need the clone's saved intake blob)
//   Config       — the machinery: connection, AI mode, what she can send,
//                  models, timing, personality dials (flirt/nsfw/push, emoji,
//                  realism, language), response pacing, imperfection profile
//   Monetization — credits+paywall, tips, extras, VIP (create mode only; in
//                  edit mode this is a page-level tab, see CloneForm)
//   Advanced     — rarely-touched power settings: smart-split model routing,
//                  voice tuning, memory window, category pricing, discounts
//   View         — read-only Flow + Prompts (rendered by CloneForm)
// The old separate Media & Safety tab folded into Config (one card's worth of
// toggles); Emojis/Realism folded into Personality & style, which itself moved
// from Identity into Config (it's a behaviour dial, not a fan-facing fact).
// Engagement moved OUT entirely: the new-fan flow, the follow-up nudge and the
// campaign toggle now live on the Campaigns page (/drip) with the campaign
// steps they belong to, and are saved by saveCampaign — not by this form.
// All groups stay mounted at once (just hidden via CSS) so switching tabs never
// drops an uncontrolled field's value before Save.
type Tab = string;
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "identity", label: "🪪 Identity", hint: "Who she is: facts, socials, vibe, canon, limits, questionnaire" },
  { key: "config", label: "⚙️ Config", hint: "Connection, AI mode, media, models, timing, personality dials" },
  { key: "money", label: "💰 Monetization", hint: "Credits, pricing, tips, VIP" },
  { key: "advanced", label: "🛠 Advanced", hint: "Power-user: smart-split, voice tuning, memory, category pricing, discounts" },
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

// ── Language picker (collapsed multi-select, controlled) ──────────────────────
// Same collapsed-summary pattern as fields.tsx's MultiSelect, but wired to the
// controlled cfg/set state (languages needs to be readable by the flow preview
// and other config, so it can't own its own uncontrolled state).
function LanguagePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0 ? "English (default)" : value.length <= 2 ? value.join(", ") : `${value.slice(0, 2).join(", ")} +${value.length - 2}`;
  return (
    <div className="block">
      <FieldLabel label="Allowed languages" hint="She only writes in these. First picked is her primary. Pick none = English. A reply drifting into any other script is auto-retried." />
      <input type="hidden" name="languages" value={JSON.stringify(value)} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={inputCls + " flex items-center justify-between gap-2 text-left"}
      >
        <span className={"min-w-0 flex-1 truncate " + (value.length ? "text-ink" : "text-muted")} title={summary}>{summary}</span>
        <span className="shrink-0 text-[11px] text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-lg border border-line bg-bg/40 p-2">
          {LANGUAGE_OPTIONS.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
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
      )}
    </div>
  );
}

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
  identityCreatorSlot,
  identityPhysicalSlot,
  identitySocialsSlot,
  identityVibeSlot,
  identityBehaviourSlot,
  identityRhythmSlot,
  identityContentSlot,
  identityImperfectionSlot,
  identityLimitsSlot,
  identityLifeSlot,
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
  // Identity canon (migration 039) additions — same reasoning as the block
  // above: they need the clone's saved columns/intake blob, so CloneForm
  // renders them and passes the finished node in.
  identityCreatorSlot?: React.ReactNode;
  identityPhysicalSlot?: React.ReactNode;
  identityBehaviourSlot?: React.ReactNode;
  identityRhythmSlot?: React.ReactNode;
  identityContentSlot?: React.ReactNode;
  identityImperfectionSlot?: React.ReactNode;
  identitySocialsSlot?: React.ReactNode;
  identityVibeSlot?: React.ReactNode;
  identityLimitsSlot?: React.ReactNode;
  // Life canon (migration 060): living situation, pets, hobbies. Same reason
  // as the slots above, needs the clone's saved columns/intake blob.
  identityLifeSlot?: React.ReactNode;
  identityQuestionnaireSlot?: React.ReactNode;
}) {
  const [tabState, setTabState] = useState<Tab>("identity");
  const tab = tabProp ?? tabState;
  const setTab = onTabChange ?? setTabState;
  // Not part of `cfg` (useCloneConfig), standalone toggles, same submit
  // pattern as everything else here (hidden input, saved with the rest of the
  // form by rowFromForm in app/clones/actions.ts). Split into one per safety
  // category (migration 061) instead of one blanket switch, so an operator
  // can e.g. always auto-block MINOR while leaving JAILBREAK as log-only.
  // Each falls back to the old single auto_block_enabled value so a clone
  // saved before this split still shows its real prior behavior.
  const [autoBlockMinor, setAutoBlockMinor] = useState(clone?.auto_block_minor ?? clone?.auto_block_enabled ?? false);
  const [autoBlockHate, setAutoBlockHate] = useState(clone?.auto_block_hate ?? clone?.auto_block_enabled ?? false);
  const [autoBlockIllegal, setAutoBlockIllegal] = useState(clone?.auto_block_illegal ?? clone?.auto_block_enabled ?? false);
  const [autoBlockJailbreak, setAutoBlockJailbreak] = useState(clone?.auto_block_jailbreak ?? clone?.auto_block_enabled ?? false);
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

      {/* ── IDENTITY - facts a fan could ask about her ─────────────
          Personality & style (flirt/nsfw/push dials, emoji, realism, language)
          moved OUT to Config 2026-07-26: those are operator dials for HOW she
          behaves, not facts about her, so they don't belong in this tab. */}
      <div className={show("identity")}>
        {/* Columns are hand-balanced to end at the same height. */}
        <div className="grid content-start gap-3">
          {identityWhoSlot}
          {identityPhysicalSlot}
          {identitySocialsSlot}
          {identityQuestionnaireSlot}
        </div>
        <div className="grid content-start gap-3">
          {identityCreatorSlot}
          {identityBehaviourSlot}
          {identityRhythmSlot}
          {identityLifeSlot}
          {identityContentSlot}
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
        {/* The two-model split toggle itself moved to Advanced (power-user
            routing decision, not something touched setting up a fresh clone).
            The hidden inputs above already always submit ai_mode/smart_split
            regardless of which tab is open, so this is just a pointer. */}
        {cfg.aiMode === "smart" && (
          <p className="mt-1 text-xs text-muted">
            Model split (one model vs. writer + decider) is under the 🛠 Advanced tab.
          </p>
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
        </div>
        {/* Vision lives in its own row: every toggle above controls what she SENDS,
            these control what she RECEIVES, and grouping them together read as
            send toggles. Both default on. Turning either off means she ignores
            that media type entirely, so she will reply to the caption only. */}
        <div className="border-t border-line pt-2">
          <SubHead
            emoji="👁"
            label="What she can see"
            tip="Off means she ignores that media entirely and replies to the caption only. Video costs more than photos, the bot downloads the file and grabs a single frame."
          />
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            <ToggleCard emoji="📸" label="Sees fan photos" title="She looks at photos fans send her" name="photo_vision_enabled" checked={cfg.photoVision} onChange={(v) => set("photoVision", v)} />
            <ToggleCard emoji="🎬" label="Sees fan videos" title="She can see videos fans send her" name="video_vision_enabled" checked={cfg.videoVision} onChange={(v) => set("videoVision", v)} />
          </div>
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

      {/* Safety (migration 047, split per-category by migration 061). The
          hard-limit guard in src/safety.ts always runs and always flags a
          breach internally regardless of these toggles; each one only
          controls what happens NEXT for that specific category. Off
          (default) = log only, the conversation carries on untouched. On =
          a fan flagged for that category is blocked automatically, the same
          users.blocked switch as a manual block. Previously one blanket
          switch covered all four categories; split so e.g. minors can always
          auto-block while a jailbreak attempt stays log-only for review. */}
      <Section
        icon="🛡"
        accent="red"
        title="Safety"
        hint="What happens after the built-in safety guard flags a fan, per category. The guard itself always runs and always logs every breach for review, on top of whatever these are set to."
      >
        <div className="grid grid-cols-2 gap-1.5">
          <ToggleCard
            emoji="🔞"
            label="Minors / underage"
            title="The most serious category. On: a flagged minor-content breach blocks the fan automatically. Off: only logged for review."
            name="auto_block_minor"
            checked={autoBlockMinor}
            onChange={setAutoBlockMinor}
          />
          <ToggleCard
            emoji="🗯"
            label="Hate speech"
            title="Racism, slurs, or hate targeting a group. On: auto-blocks. Off: only logged for review."
            name="auto_block_hate"
            checked={autoBlockHate}
            onChange={setAutoBlockHate}
          />
          <ToggleCard
            emoji="⚠️"
            label="Illegal content"
            title="Weapon/drug how-to, hiring violence, non-consent. On: auto-blocks. Off: only logged for review."
            name="auto_block_illegal"
            checked={autoBlockIllegal}
            onChange={setAutoBlockIllegal}
          />
          <ToggleCard
            emoji="🔓"
            label="Jailbreak attempts"
            title="Trying to override her rules to make her say something banned. On: auto-blocks. Off: only logged for review."
            name="auto_block_jailbreak"
            checked={autoBlockJailbreak}
            onChange={setAutoBlockJailbreak}
          />
        </div>
      </Section>

      {/* Personality, emoji style and realism touches were three separate cards
          for what is really one question — how she comes across. One card.
          Moved here from Identity 2026-07-26: this is an operator dial for HOW
          she behaves, not a fact a fan could ask about, so it's Config. */}
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
            Chinese, etc.). Pick none = English is assumed. Collapsed multi-select
            (not the old always-open 22-chip grid) since this is usually one value. */}
        <div className="grid content-start gap-1.5 border-t border-line pt-2">
          <SubHead emoji="🌐" label="Language" tip="Force her replies into set languages instead of mirroring the fan. Catches a model randomly switching to Chinese/another script and retries it." />
          <input type="hidden" name="language_lock" value={String(cfg.languageLock)} />
          <Toggle
            label={cfg.languageLock ? "Force set languages" : "Mirrors the fan"}
            name="_language_lock_toggle"
            checked={cfg.languageLock}
            onChange={(v) => set("languageLock", v)}
            accent="soft"
          />
          {cfg.languageLock && (
            <LanguagePicker value={cfg.languages} onChange={(v) => set("languages", v)} />
          )}
          {!cfg.languageLock && <input type="hidden" name="languages" value="[]" />}
        </div>
      </Section>

        {/* Timing (memory window moved to Advanced — not something touched
            setting up a fresh clone). */}
        <Collapse
          emoji="⏱"
          label="Timing & length"
          accent="cyan"
          hint="Silent wait before typing (random between min and max, 0s = instant) and reply length."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Slider label="Min wait" name="response_wait_min" value={cfg.waitMin} onChange={(v) => set("waitMin", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
            <Slider label="Max wait" name="response_wait_max" value={cfg.waitMax} onChange={(v) => set("waitMax", v)} min={0} max={120} step={1} format={(v) => `${v}s`} />
          </div>
          <div className="mt-1 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
            <Field
              label="Max reply length"
              name="max_response_words"
              type="number"
              defaultValue={clone?.max_response_words ?? undefined}
              placeholder="0 = unlimited"
              hint="Hard ceiling on how many words she can send in one reply. Blank or 0 = unlimited. Applies to text, voice and photo replies."
            />
            <div className="block">
              <FieldLabel label="Match length" />
              <Toggle
                label={cfg.matchUserLength ? "Scales to his message" : "Her normal style"}
                name="match_user_length"
                checked={cfg.matchUserLength}
                onChange={(v) => set("matchUserLength", v)}
                accent="soft"
                hint="When on, she writes shorter replies to short messages and longer ones to long messages, instead of her usual fixed length. The max reply length above still applies as a ceiling."
              />
            </div>
          </div>
        </Collapse>

        {/* Response pacing (migration 041) - operator/machinery dials that
            replace the flat wait with something richer: read delay, typing
            stutter, a conversation-stage speed ramp, and the per-clone
            double-text batching window. Sits right beside Timing & memory,
            same placement pattern as the imperfection-profile slot below. */}
        <Collapse
          emoji="⏳"
          label="Response pacing"
          accent="cyan"
          hint="Read delay, typing stutter, a slower-to-faster ramp across the conversation, and how long she waits for a fan to finish double-texting. Every range defaults to today's behavior until you touch it."
        >
          <div>
            <SubHead
              emoji="👀"
              label="Read delay"
              tip="How long she waits before marking his message as read, instead of instantly. 0/0 = instant, today's behavior."
            />
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <Slider label="Min" name="read_delay_min" value={cfg.readDelayMin} onChange={(v) => set("readDelayMin", v)} min={0} max={30} step={1} format={(v) => `${v}s`} />
              <Slider label="Max" name="read_delay_max" value={cfg.readDelayMax} onChange={(v) => set("readDelayMax", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
            </div>
          </div>

          <div className="mt-2 border-t border-line pt-2">
            <SubHead
              emoji="⌨️"
              label="Typing stutter"
              tip="Stops and restarts the typing indicator once or twice mid-reply instead of showing it continuously. Off by default."
            />
            <input type="hidden" name="typing_stutter_enabled" value={String(cfg.typingStutterEnabled)} />
            <Toggle
              label={cfg.typingStutterEnabled ? "Stutters" : "Continuous"}
              name="_typing_stutter_toggle"
              checked={cfg.typingStutterEnabled}
              onChange={(v) => set("typingStutterEnabled", v)}
              accent="soft"
            />
            {cfg.typingStutterEnabled ? (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <Slider label="Min pause" name="typing_stutter_min_pause" value={cfg.typingStutterMinPause} onChange={(v) => set("typingStutterMinPause", v)} min={1} max={10} step={1} format={(v) => `${v}s`} />
                <Slider label="Max pause" name="typing_stutter_max_pause" value={cfg.typingStutterMaxPause} onChange={(v) => set("typingStutterMaxPause", v)} min={1} max={15} step={1} format={(v) => `${v}s`} />
              </div>
            ) : (
              <>
                <input type="hidden" name="typing_stutter_min_pause" value={String(cfg.typingStutterMinPause)} />
                <input type="hidden" name="typing_stutter_max_pause" value={String(cfg.typingStutterMaxPause)} />
              </>
            )}
          </div>

          <div className="mt-2 border-t border-line pt-2">
            <SubHead
              emoji="📈"
              label="Conversation pacing ramp"
              tip="Slower with a brand new fan, faster once she's warmed up. Interpolates from the new-conversation range to the established range across this many messages. 0 = off, uses the flat wait above instead."
            />
            <Slider
              label="Ramp length"
              name="pacing_ramp_messages"
              value={cfg.pacingRampMessages}
              onChange={(v) => set("pacingRampMessages", v)}
              min={0}
              max={50}
              step={1}
              format={(v) => (v === 0 ? "off" : `${v} msgs`)}
            />
            {cfg.pacingRampMessages > 0 ? (
              <div className="mt-1.5 grid gap-2">
                <p className="text-[11px] text-muted">New conversation</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Slider label="Min" name="pacing_new_wait_min" value={cfg.pacingNewWaitMin} onChange={(v) => set("pacingNewWaitMin", v)} min={0} max={120} step={1} format={(v) => `${v}s`} />
                  <Slider label="Max" name="pacing_new_wait_max" value={cfg.pacingNewWaitMax} onChange={(v) => set("pacingNewWaitMax", v)} min={0} max={180} step={1} format={(v) => `${v}s`} />
                </div>
                <p className="text-[11px] text-muted">Established</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Slider label="Min" name="pacing_established_wait_min" value={cfg.pacingEstablishedWaitMin} onChange={(v) => set("pacingEstablishedWaitMin", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
                  <Slider label="Max" name="pacing_established_wait_max" value={cfg.pacingEstablishedWaitMax} onChange={(v) => set("pacingEstablishedWaitMax", v)} min={0} max={120} step={1} format={(v) => `${v}s`} />
                </div>
              </div>
            ) : (
              <>
                <input type="hidden" name="pacing_new_wait_min" value={String(cfg.pacingNewWaitMin)} />
                <input type="hidden" name="pacing_new_wait_max" value={String(cfg.pacingNewWaitMax)} />
                <input type="hidden" name="pacing_established_wait_min" value={String(cfg.pacingEstablishedWaitMin)} />
                <input type="hidden" name="pacing_established_wait_max" value={String(cfg.pacingEstablishedWaitMax)} />
              </>
            )}
          </div>

          <div className="mt-2 border-t border-line pt-2">
            <SubHead
              emoji="💬"
              label="Double-text batching"
              tip="How long she waits for a fan to finish a burst of quick messages before replying to all of them at once. Defaults match today's fleet-wide 3s window."
            />
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <Slider label="Min" name="batch_wait_min" value={cfg.batchWaitMin} onChange={(v) => set("batchWaitMin", v)} min={1} max={15} step={1} format={(v) => `${v}s`} />
              <Slider label="Max" name="batch_wait_max" value={cfg.batchWaitMax} onChange={(v) => set("batchWaitMax", v)} min={1} max={30} step={1} format={(v) => `${v}s`} />
            </div>
          </div>
        </Collapse>

        {/* Imperfection profile (migrations 039 + 042) is texting MECHANICS -
            how she types, not a fact a fan could ask about - so it lives in
            Config next to the other timing/mechanics dials, not in Identity.
            It arrives pre-rendered as its own Collapse (see
            PersonaFactsFields), so it sits beside Timing & length rather
            than nested inside it. */}
        {identityImperfectionSlot}

        <Collapse
          emoji="⚙️"
          label="AI Models"
          accent="blue"
          className="xl:col-span-2"
          hint="Search by name. Price per 1M tokens (in / out). ⭐ Best, 💰 Value, 🪙 Cheapest pinned on top."
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
        </Collapse>
      </div>

      {/* ── ADVANCED - power-user settings, nobody touches these configuring
          a fresh clone. Everything here used to live in Config or Monetization;
          moved out 2026-07-26 so those tabs aren't padded with dials an
          operator only needs once they already know exactly what they're
          doing. All controlled state (cfg.smartSplit, cfg.stability, ...) is
          shared across tabs regardless of which one is visible, so nothing
          here needs its own hidden-input duplication. */}
      <div className={show("advanced")}>
        {/* Two-model split: only relevant once AI mode (Config) is Smart. The
            ai_mode/smart_split hidden inputs in Config's Connection & mode
            card always submit the current value no matter which tab is open,
            so this card is just the visible control. */}
        {cfg.aiMode === "smart" && (
          <Section
            icon="🧠"
            accent="purple"
            title="Smart mode: model split"
            hint="Whether one model both writes and fires actions, or two models split the job."
          >
            <Toggle
              label="Two-model split (writer + decider)"
              name="_smart_split_toggle"
              checked={cfg.smartSplit}
              onChange={(v) => set("smartSplit", v)}
              accent="soft"
            />
            <p className="text-xs leading-relaxed text-muted">
              {cfg.smartSplit
                ? "On: your Text model writes her replies, your Routing model fires photo/voice/tip actions (must support tool-calling). Set both under AI Models in Config."
                : "Off: one model (your Text model) both writes her replies and fires actions in a single call. Cheaper, but it must support tool-calling."}
            </p>
            <Field
              label="Voice cooldown (turns)"
              name="voice_cooldown_turns"
              type="number"
              min={0}
              step={1}
              defaultValue={clone?.voice_cooldown_turns ?? 2}
              hint="How many of her own most recent replies must NOT have been a voice note before Smart mode will pick voice again, unless he freshly and explicitly asks for another one, that always overrides this. Without a cooldown the decider can pattern-match its own recent voice sends and get stuck replying with only voice notes for several turns straight. 0 turns it off entirely for a clone that should send voice often."
            />
          </Section>
        )}

        <Collapse emoji="🎛" label="Voice tuning" accent="purple" hint="ElevenLabs sound controls.">
          <label className="block">
            <FieldLabel label="Model" hint="Which ElevenLabs TTS model generates her voice notes." />
            <select name="eleven_model" defaultValue={clone?.eleven_model ?? "eleven_multilingual_v2"} className={selectCls}>
              {ELEVEN_MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {clone?.eleven_model && !ELEVEN_MODEL_OPTIONS.some((o) => o.value === clone.eleven_model) && (
                <option value={clone.eleven_model}>{clone.eleven_model}</option>
              )}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Slider label="Stability" name="voice_stability" value={cfg.stability} onChange={(v) => set("stability", v)} />
            <Slider label="Similarity" name="voice_similarity" value={cfg.similarity} onChange={(v) => set("similarity", v)} />
            <Slider label="Style" name="voice_style" value={cfg.style} onChange={(v) => set("style", v)} />
            <Slider label="Speed" name="voice_speed" value={cfg.speed} onChange={(v) => set("speed", v)} min={0.5} max={1.2} />
          </div>
          <input type="hidden" name="voice_speaker_boost" value={String(cfg.speakerBoost)} />
          <Toggle label="Speaker boost" name="_sb_toggle" checked={cfg.speakerBoost} onChange={(v) => set("speakerBoost", v)} accent="soft" />
        </Collapse>

        <Collapse
          emoji="🧠"
          label="Memory"
          accent="cyan"
          hint="How many past messages she recalls each reply. Higher costs more tokens per reply."
        >
          <Slider label="Memory window" name="memory_window" value={cfg.memoryWindow} onChange={(v) => set("memoryWindow", v)} min={1} max={100} step={1} format={(v) => `${v} msgs`} />
        </Collapse>

        {/* ── Category pricing (moved from Monetization) ────────────── */}
        <Section
          icon="🏷"
          accent="pink"
          title="Category pricing"
          hint="Suggested ⭐ price per content type."
          tip="When you upload a photo/video it's auto-tagged by AI (bikini, lingerie, full nude, ...) and priced from this guide: the highest-priced matching category wins. Leave a price blank on upload to auto-price; type one to override. Prices only ever come from here, she never invents a number."
        >
          <CategoryPricingEditor cfg={cfg} set={set} />
        </Section>

        {/* ── Discounts (moved from Monetization) ───────────────────── */}
        <Collapse
          emoji="💸"
          label={<>Discounts <BetaBadge /></>}
          accent="green"
          filled={cfg.discountsEnabled}
          hint="She picks when and how hard, % capped here. She only decides WHEN and how hard (light/medium/max); the price is always computed in code. 0 = never discount that type. Beta: ships inert until you set caps above zero."
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
        </Collapse>
      </div>

      {/* ── MONETIZATION - sections live in MonetizationSections (end of
          file) so edit mode can host them under the page-level Monetization
          tab instead, inside the same <form>. Create mode keeps them here. */}
      {showMoney && (
        <div className={show("money")}>
          <MonetizationSections cfg={cfg} set={set} clone={clone} />
          {/* Monetization sequence (migration 056) — its own file, see
              components/clone/MonetizationSequenceFields.tsx. */}
          <MonetizationSequenceFields clone={clone} />
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
            {/* Real submitted field is this unconditional hidden input, same pattern
                as smart_split / voice_speaker_boost / subscriptions_enabled below.
                It always carries the true value regardless of whether the visible
                toggle is mounted, so hiding it when smartPaywall is off can never
                drop the stored value on Save. The visible Toggle below uses a
                differently-named field (never read by the server) purely for its
                checked/onChange UI. */}
            <input type="hidden" name="paywall_as_voice" value={String(cfg.paywallVoice)} />
            {cfg.smartPaywall && (
              <div className="mt-1.5">
                <Toggle label="As voice note" hint="Sends that first personal out-of-credits line as a voice note instead of text." name="_paywall_as_voice_toggle" checked={cfg.paywallVoice} onChange={(v) => set("paywallVoice", v)} accent="soft" />
              </div>
            )}
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

      {/* Category pricing moved to the Advanced tab 2026-07-26 — sensible
          defaults ship out of the box, so it's a power-user override, not
          something touched configuring a fresh clone. */}

      {/* ── 🎁 Tips (own box) ────────────────────────────────────── */}
      <Collapse
        emoji="🎁"
        label="Tips"
        accent="amber"
        filled={cfg.tips}
        hint="She can ask to be spoiled with Stars. Recorded as tip revenue, never as message credits. The spoil menu is what he sees when he wants to tip but names no amount."
      >
        <Toggle
          label={cfg.tips ? "She can ask for tips" : "No tips"}
          name="tips_enabled"
          checked={cfg.tips}
          onChange={(v) => set("tips", v)}
          accent="soft"
        />
        {cfg.tips && <SpoilMenuEditor cfg={cfg} set={set} />}
      </Collapse>

      {/* ── 💌 Extras (own box) ────────────────────────────────────
          Discounts moved to the Advanced tab 2026-07-26 (off by default,
          beta) — used to share this column with Extras so neither one padded
          out to a full row on its own; now the only thing here, still fine
          as a single card. */}
      <Collapse
        emoji="💌"
        label="Extras"
        accent="cyan"
        filled={cfg.thankYou}
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
      </Collapse>

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

