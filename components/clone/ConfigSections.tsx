"use client";

import { useState } from "react";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "../ModelSelect";
import {
  Area,
  COLLECT_FIELD_OPTIONS,
  Collapse,
  DEFAULT_PAYWALL_BUTTON,
  DEFAULT_PAYWALL_MESSAGE,
  ELEVEN_MODEL_OPTIONS,
  Field,
  LANGUAGE_OPTIONS,
  MODEL_FIELDS,
  MultiSelect,
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
import { MediaPicker, type MediaRow, type BundleRow } from "./MediaPicker";
// New dedicated file (migration 056 monetization sequence) — kept out of this
// file's own card definitions so it doesn't collide with concurrent edits here.

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
//   Monetization — credits+paywall, tips, extras (create mode only; in
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
  { key: "money", label: "💰 Monetization", hint: "Credits, pricing, tips, extras" },
  { key: "advanced", label: "🛠 Advanced", hint: "Power-user: smart-split, voice tuning, memory, category pricing, discounts" },
];

// Segmented dial options. Five steps each as of migration 082, which widened
// the DB CHECK constraints so the ends of the scale can finally be saved.
// Every `title` below is a condensed but faithful read of the exact prompt
// string the bot sends for that step: SEXUAL_TEXT / NSFW_TEXT / PUSH_TEXT in
// bot/src/flows/human.ts:490-512 and TIP_PUSH_TEXT in bot/src/handler.ts:147.
// A legacy low/high row is mapped onto its equivalent step on read (heatLevel()
// in useCloneConfig.ts), so no existing clone changes behaviour.
const SEG = {
  sexual: [
    { value: "off" as const, label: "🚫 Off", title: "Completely clean. Warm and friendly, but does not flirt and redirects if he steers it sexual." },
    { value: "mild" as const, label: "😊 Mild", title: "Mostly cute and wholesome, light flirting. Never turns sexual on her own." },
    { value: "medium" as const, label: "😘 Med", title: "Naturally flirty and a little suggestive, comfortable with innuendo." },
    { value: "explicit" as const, label: "🔥 Hot", title: "Openly forward. She brings the sexual energy herself instead of waiting for him." },
    { value: "max" as const, label: "💋 Max", title: "Unmistakably sexual from the start. Leads the tension almost every exchange, escalates, never coy." },
  ],
  nsfw: [
    { value: "off" as const, label: "🚫 Off", title: "Never explicit. Deflects sexual detail warmly and changes the subject every time." },
    { value: "mild" as const, label: "🙈 Mild", title: "PG-13 when it heats up. Deflects explicit requests playfully, never graphic." },
    { value: "medium" as const, label: "😏 Med", title: "Talks dirty when he leads there, but keeps it tasteful rather than graphic." },
    { value: "explicit" as const, label: "🔞 Hard", title: "Goes fully explicit and graphic in the moment, leaning in rather than softening." },
    { value: "max" as const, label: "💦 Max", title: "As filthy and graphic as he wants, blunt language, no hedging, no fade to black, never cuts a hot moment short." },
  ],
  push: [
    { value: "none" as const, label: "🚫 None", title: "NEVER brings up paid content or tips on her own, not even a tease. If HE asks to buy, she sells fully and enthusiastically." },
    { value: "low" as const, label: "🍃 Low", title: "Rarely brings it up, only when it comes up naturally, and keeps it soft. No proactive pitching." },
    { value: "medium" as const, label: "💵 Med", title: "Offers photos, videos and tips at good moments, not on plain small talk." },
    { value: "high" as const, label: "🤑 High", title: "Proactively steers toward paid content and tips, nudging him often, while staying warm." },
    { value: "relentless" as const, label: "📣 Max", title: "Looks for a sell in almost every exchange, teases what he is missing, keeps circling back even when he changes the subject." },
  ],
  // Migration 086, the four warmth-side dials. Every dial above this point is
  // about sex or selling, which is exactly why "make her friendlier" never
  // worked: there was nothing to turn. "Med" is the default on all four and
  // adds NOTHING to her prompt, because medium is defined as how she already
  // behaves, so leaving these alone is a true no-op.
  warmth: [
    { value: "off" as const, label: "🧊 Off", title: "Friendly but emotionally neutral. Offers no comfort, reassurance or affection." },
    { value: "low" as const, label: "🙂 Low", title: "Pleasant and easy, but keeps emotional distance. Does not get soft or affectionate." },
    { value: "medium" as const, label: "💗 Med", title: "How she behaves today. Warm and easy, responds kindly when something is bothering him. Adds nothing to her prompt." },
    { value: "high" as const, label: "🤗 High", title: "Openly affectionate. Acknowledges how a hard thing sounds for HIM before anything else, and does not go cold when he is low or short with her." },
    { value: "max" as const, label: "💞 Max", title: "Unmistakably affectionate in almost every message. Sits with hard things properly instead of fixing them, and never answers vulnerability with a joke or a subject change." },
  ],
  curiosity: [
    { value: "off" as const, label: "🚫 Off", title: "Does not ask him about himself at all. Responds to what he says and lets him lead." },
    { value: "low" as const, label: "🍃 Low", title: "Asks about him occasionally and keeps it light. Does not dig into anything he has not offered up." },
    { value: "medium" as const, label: "🙂 Med", title: "How she behaves today. Shows interest and asks at natural moments. Adds nothing to her prompt." },
    { value: "high" as const, label: "💬 High", title: "Asks about the SPECIFIC thing he mentioned instead of moving on, and is explicitly forbidden from answering something personal with a generic 'what about you'." },
    { value: "max" as const, label: "🔍 Max", title: "Pulls on everything he says and keeps going a layer deeper rather than accepting the first short answer. Intense: can read as an interview." },
  ],
  playfulness: [
    { value: "off" as const, label: "😐 Off", title: "Sincere and straightforward. Does not tease, joke around or be sarcastic." },
    { value: "low" as const, label: "🙂 Low", title: "Light sense of humour but mostly sincere. Does not tease." },
    { value: "medium" as const, label: "😄 Med", title: "How she behaves today. Playful, teases a little when the moment suits it. Adds nothing to her prompt." },
    { value: "high" as const, label: "😏 High", title: "Properly playful, teases and winds him up, a bit of a brat, always obviously affectionate so it reads as flirting rather than a dig." },
    { value: "max" as const, label: "😈 Max", title: "Relentlessly mischievous, escalates banter, never gives the flat answer when a cheeky one exists. Still drops it instantly if he is actually upset." },
  ],
  attentiveness: [
    { value: "off" as const, label: "🚫 Off", title: "Responds to his current message only. Never brings up things he told her earlier." },
    { value: "low" as const, label: "🍃 Low", title: "Occasionally refers back to something he told her, but does not go looking for it." },
    { value: "medium" as const, label: "🧠 Med", title: "How she behaves today. Remembers what he told her and refers back naturally. Adds nothing to her prompt." },
    { value: "high" as const, label: "📌 High", title: "Actively uses his details by name, follows up on how things went, and never re-asks something he already answered. Told explicitly never to invent a detail she does not have." },
    { value: "max" as const, label: "🎯 Max", title: "References his specifics constantly and unprompted, checks back on things he said were coming up. Depends on her dossier, which does not fill until he has sent about 3 messages." },
  ],
  // Same five steps as `push`, plus the inherit option. "" is the UI spelling of
  // NULL, and NULL means inherit push_level, NOT "none". Keep the empty value
  // first so the default reads as the neutral choice.
  tipPush: [
    { value: "" as const, label: "= Push", title: "Inherit whatever Content pushing is set to. This is the default and it adds nothing at all to her prompt." },
    { value: "none" as const, label: "🚫 None", title: "NEVER asks to be tipped or spoiled and never hints at it. If HE offers a tip, she accepts warmly." },
    { value: "low" as const, label: "🍃 Low", title: "Rarely asks, only when he has clearly just made her happy, and keeps it easy to ignore." },
    { value: "medium" as const, label: "💵 Med", title: "Asks him to tip or spoil her at good moments, without being pushy." },
    { value: "high" as const, label: "🤑 High", title: "Actively invites tips and spoiling, nudging him toward it often, while staying warm." },
    { value: "relentless" as const, label: "📣 Max", title: "Looks for a way to get tipped in almost every exchange and keeps circling back to being spoiled." },
  ],
  emoji: [
    { value: "low" as const, label: "A little", title: "Most messages have none" },
    { value: "medium" as const, label: "Some", title: "About every other message" },
    { value: "high" as const, label: "A lot", title: "Most messages have one or two" },
  ],
  // Migration 090 (clones.price_guard_mode). Keep Block first: it is the
  // default, and Off is the legacy behaviour that let the bug happen.
  priceGuard: [
    { value: "block" as const, label: "🛑 Block", title: "If she types a Star price that is not one of yours, that message never reaches him. She sends a short neutral line instead and the attempt is recorded in Logs. This is the default. It cannot affect a real price: every amount on a Pay button is computed in code and never routes through this check." },
    { value: "log" as const, label: "👀 Watch only", title: "The message goes out exactly as written, but every invented price is recorded in Logs. Use this for a day if you want to see how often it actually happens on this clone before you let it start blocking anything." },
    { value: "off" as const, label: "🚫 Off", title: "No checking at all. This is how the bot behaved before the guard existed, and it is what allowed her to quote 1000 stars for a 40 star photo. Only pick this if the guard is misfiring on a real message." },
  ],
  // Migration 084 (clones.fan_time_mode). Keep never_assume first: it is the
  // default and the fix, and assume_same is the legacy behaviour.
  fanTime: [
    { value: "never_assume" as const, label: "🚫 Never assume", title: "She never says or implies what time of day it is for HIM. No \"how's your night going\", no \"morning!\", no \"you're up late\", not even sideways. She can still talk about her own clock (\"it's so late here\"), because that part is true." },
    { value: "may_ask" as const, label: "💬 May ask", title: "Everything Never assume does, plus she may naturally ask what time it is where he is. Once he tells her, she uses his real clock from then on." },
    { value: "assume_same" as const, label: "🌍 Same as hers", title: "Legacy. She talks as though he is in roughly the same part of the day she is. Only pick this if every fan really is in her timezone. This is the behaviour that produced the live incident." },
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
  photos = [],
  videos = [],
  bundles = [],
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
  // Only used by the Money tab's "promised image" picker (post-lock resume,
  // migration 069). Create mode has no saved media yet, so it's fine to omit
  // these there - the picker just shows "no photos uploaded yet".
  photos?: MediaRow[];
  videos?: MediaRow[];
  bundles?: BundleRow[];
}) {
  const [tabState, setTabState] = useState<Tab>("identity");
  const tab = tabProp ?? tabState;
  const setTab = onTabChange ?? setTabState;
  // The per-category auto-block toggles that used to live here are gone
  // (2026-07-27, operator decision). The AI never blocks a fan, it only ever
  // flags. Blocking stays a purely manual operator action. The safety guard in
  // bot/src/safety.ts still runs on every message and still logs every breach,
  // so nothing is unmonitored, there is just no longer a setting that turns a
  // flag into an automatic block. The auto_block_* columns are left in the DB
  // unread rather than dropped, matching the additive-only migration rule.
  const visibleTabs = [
    ...leadingTabs,
    ...TABS.filter((t) => showMoney || t.key !== "money"),
    ...extraTabs,
  ];
  // Identity and Config contain wide segmented controls and multi-field rows.
  // They stay single-column so no control is compressed or overlaps a neighbour.
  // Advanced uses two columns because its cards are intentionally self-contained.
  const show = (t: Tab) =>
    tab !== t
      ? "hidden"
      : t === "money"
        ? "grid min-w-0 grid-cols-1 items-start gap-3 xl:grid-cols-3"
        : t === "identity" || t === "config"
          ? "clone-editor-single grid min-w-0 grid-cols-1 items-start gap-4"
          : "grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2";

  return (
    <div className="grid min-w-0 gap-4">
      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="clone-editor-tabs sticky top-0 z-30 flex gap-1 overflow-x-auto rounded-2xl border border-white/55 bg-white/80 p-1.5 shadow-[0_10px_30px_rgb(16_24_40/0.08)] backdrop-blur-xl">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hint}
            onClick={() => setTab(t.key)}
            className={
              "min-w-[8rem] flex-none whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition sm:min-w-0 sm:flex-1 " +
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
            <FieldLabel label="Status" hint="Paused means the bot ignores every incoming message for this clone. Nothing is deleted, she just stops replying until you set her active again." />
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
        {/* fan_time_mode (migration 084), read at bot/src/flows/human.ts:255 by
            fanTimeMode() and used in nowNudge. Sits with Timezone because it is
            the other half of the same question: that clock is hers, this is
            what she may say about his. */}
        <Segmented
          label="His time of day"
          name="fan_time_mode"
          value={cfg.fanTimeMode}
          onChange={(v) => set("fanTimeMode", v)}
          options={SEG.fanTime}
          accent="accent"
          hint="The Timezone above is HERS, and it is the only clock she has. Leave this on Never assume, the default and the fix: a real fan was once greeted with 'how's your night going' when it was the middle of his afternoon. If he has actually told her his timezone she uses his real clock instead and this setting is skipped entirely. Hover a step to see exactly what she is told."
        />

        {/* AI mode - used to be its own card, but it's one control; it belongs
            with the rest of "what this clone fundamentally is". */}
        <div className="grid gap-1.5 border-t border-line pt-2 sm:col-span-2">
          {/* The Smart-mode pointer to the Advanced tab used to be a grey
              paragraph under the pills. It's part of the same explanation, so
              it belongs in this one ⓘ hover instead. */}
          <FieldLabel
            label="🧠 AI mode"
            hint={
              "How she decides what to do with each message. Classic follows fixed rules; Smart lets one AI figure it out. Money rules stay the same either way." +
              (cfg.aiMode === "smart"
                ? " The model split (one model vs. writer + decider) lives under the 🛠 Advanced tab."
                : "")
            }
          />
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
            regardless of which tab is open. The pointer to Advanced that used
            to sit here as a grey paragraph is now part of the ⓘ hint on the
            "AI mode" label above, shown only when Smart is selected. */}
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
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <ToggleCard emoji="📷" label="Photos" name="photos_enabled" checked={cfg.photosEnabled} onChange={(v) => set("photosEnabled", v)} />
          <ToggleCard emoji="🎥" label="Videos" name="videos_enabled" checked={cfg.videosEnabled} onChange={(v) => set("videosEnabled", v)} />
          <ToggleCard emoji="🎁" label="Photo bundles" title="Fans can request them" name="bundles_enabled" checked={cfg.bundlesEnabled} onChange={(v) => set("bundlesEnabled", v)} />
          <ToggleCard emoji="🎙" label="Voice messages" name="voice_enabled" checked={cfg.voice} onChange={(v) => set("voice", v)} />
        </div>
        {/* Never-resend rule (clones.media_allow_resend). Default off = current
            behaviour, an item a fan already received never repeats. On = she may
            resend it. Separate row so it reads as a rule about repeats, not a
            fifth "what she can send" media type. */}
        <div className="border-t border-line pt-2">
          <ToggleCard
            emoji="🔁"
            label={cfg.mediaAllowResend ? "Resends allowed" : "Never resend"}
            title="Off (default): once a fan has received a photo/video, it's removed from her pool forever, she'll never send that exact item again. On: she may resend items he's already seen."
            name="media_allow_resend"
            checked={cfg.mediaAllowResend}
            onChange={(v) => set("mediaAllowResend", v)}
          />
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
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <ToggleCard emoji="📸" label="Sees fan photos" title="She looks at photos fans send her" name="photo_vision_enabled" checked={cfg.photoVision} onChange={(v) => set("photoVision", v)} />
            <ToggleCard emoji="🎬" label="Sees fan videos" title="She can see videos fans send her" name="video_vision_enabled" checked={cfg.videoVision} onChange={(v) => set("videoVision", v)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-2">
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

      {/* The Safety section was removed (2026-07-27). It only ever held the
          four auto-block toggles, and the AI no longer blocks anyone, so there
          was nothing left to configure. The guard in bot/src/safety.ts still
          runs on every message and still logs every breach (MINOR at error
          level) for operator review on /logs. What she will and will not do
          in character lives in the identity section's hard limits, which is a
          different thing entirely: that shapes HER replies, this watched what
          the FAN sends. */}

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Segmented
            label="Flirtiness"
            name="sexual_level"
            value={cfg.sexualLevel}
            onChange={(v) => set("sexualLevel", v)}
            options={SEG.sexual}
            accent="pink"
            hint="Does SHE start it: how boldly she flirts first. Off means she stays clean and redirects; Max means she leads the tension in almost every exchange. This is wording sent to the model, not a code lock, so treat the ends as strong steering rather than a guarantee. Hover a step to see exactly what she is told."
          />
          <Segmented
            label="NSFW"
            name="nsfw_level"
            value={cfg.nsfwLevel}
            onChange={(v) => set("nsfwLevel", v)}
            options={SEG.nsfw}
            accent="red"
            hint="How graphic once things heat up. Off deflects every explicit request; Max is fully filthy, blunt language, no fade to black. Wording sent to the model, not a code lock, so it steers her hard but cannot guarantee. The built-in hard limits still apply at every step."
          />
          <Segmented
            label="Content pushing"
            name="push_level"
            value={cfg.pushLevel}
            onChange={(v) => set("pushLevel", v)}
            options={SEG.push}
            accent="green"
            hint="How eagerly she upsells. None means she NEVER initiates a sell, not a hint or a tease, but she still sells fully and enthusiastically the moment HE asks, so it costs you nothing from fans who want to buy. Max hunts for an opening every exchange. None is an explicit prohibition rather than a vague steer, which a model follows far more reliably, but every step here is prompt wording, not a code lock. Prices never move."
          />
        </div>

        {/* The four warmth-side dials (migration 086, clones.warmth_level /
            curiosity_level / playfulness_level / attentiveness_level).

            WHY THEY EXIST: every dial in the row above is about SEX or
            SELLING. There was never a warmth dial and never a curiosity dial,
            so an operator who wanted a friendlier clone had only Flirtiness,
            NSFW and Content pushing to reach for, all of which move a
            different axis. That is the real reason "make her friendlier"
            never worked, not her writing, which the 2026-07-29 transcripts
            show is already warm.

            Each owns ONE behaviour the others never mention, because
            overlapping dials cancel out in a prompt (that is how vibe_preset
            became inert). Curiosity asks about what he has NOT said yet;
            Memory brings back what he HAS.

            Med on all four adds NOTHING to her prompt, so an untouched clone
            is byte-for-byte unchanged. Their own row, below the money/sex
            dials, because they answer a different question about her. */}
        <div className="grid gap-3 border-t border-line pt-2 sm:grid-cols-2 lg:grid-cols-4">
          <Segmented
            label="Curiosity"
            name="curiosity_level"
            value={cfg.curiosityLevel}
            onChange={(v) => set("curiosityLevel", v)}
            options={SEG.curiosity}
            accent="accent"
            hint="How much she asks about HIM. This is the dial behind 'she never asks about me'. At High she must follow up on the specific thing he mentioned and is explicitly forbidden from bouncing a personal topic back with 'what about you', which is the exact habit that reads as not listening. Start at High; Max is genuinely intense and can feel like an interview. Wording sent to the model, not a code lock."
          />
          <Segmented
            label="Warmth"
            name="warmth_level"
            value={cfg.warmthLevel}
            onChange={(v) => set("warmthLevel", v)}
            options={SEG.warmth}
            accent="purple"
            hint="How much affection and comfort she gives. Separate from flirtiness on purpose: this is care, not heat. High makes her acknowledge a hard thing before moving on and stops her going cold when he is negative or short with her. Read a transcript before raising this, her baseline warmth is already decent. Wording sent to the model, not a code lock."
          />
          <Segmented
            label="Playfulness"
            name="playfulness_level"
            value={cfg.playfulnessLevel}
            onChange={(v) => set("playfulnessLevel", v)}
            options={SEG.playfulness}
            accent="amber"
            hint="How much she teases and jokes. Owns humour only, never affection or curiosity, so it will not make her ask more questions. Every step above Off still requires her to drop the teasing instantly if he is genuinely upset. Wording sent to the model, not a code lock."
          />
          <Segmented
            label="Memory use"
            name="attentiveness_level"
            value={cfg.attentivenessLevel}
            onChange={(v) => set("attentivenessLevel", v)}
            options={SEG.attentiveness}
            accent="green"
            hint="How much she USES what he already told her: callbacks, continuity, not re-asking answered questions. Different from Curiosity, which asks about things he has not mentioned yet. This one depends on her fan dossier, which does not populate until he has sent about 3 messages, so High and Max both carry an explicit instruction never to invent a detail she does not actually have. Wording sent to the model, not a code lock."
          />
        </div>

        {/* Tips split out from the content dial (migration 080,
            clones.tip_push_level). push_level's prompt string says "your paid
            photos, videos and tips" in one breath, so a soft-sell-content but
            happily-spoiled clone was previously unexpressible. Default "" =
            NULL = inherit, which makes tipPushDirective() in
            bot/src/handler.ts:161 return "" and leaves the prompt byte-for-byte
            unchanged. Its own row: at six steps it does not fit the 3-up grid. */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-2 lg:grid-cols-2">
          <Segmented
            label="Tip pushing"
            name="tip_push_level"
            value={cfg.tipPushLevel}
            onChange={(v) => set("tipPushLevel", v)}
            options={SEG.tipPush}
            accent="amber"
            hint="How hard she asks to be TIPPED and spoiled, dialled separately from photos, videos and bundles. Leave on '= Push' and tips follow the Content pushing dial exactly, which adds nothing to her prompt. Move it and only tips change: a soft-sell clone that still loves being spoiled, or a heavy content seller who never begs for Stars. Amounts always come from the fixed spoil menu, she never names a number."
          />
          {/* greeting_ask_age (migration 080), read at
              bot/src/flows/human.ts:383 in newFanGreetingNudge. Off is the
              default and the recommendation, see the hint. */}
          <div className="block">
            <FieldLabel
              label="🎂 Ask his age in message one"
              hint="Leave this OFF, which is the default and the recommendation. When on, her very first message to a brand-new fan gently asks how old he is. That single question caused a live incident: a fan answered 19, that age was then re-injected into every later prompt forever, it kept brushing against the minors wording in her hard limits, and she went cold on him for the rest of the relationship. Off, she asks where he is from instead. It does not change any age or safety rule, only whether she opens by asking."
            />
            <Toggle
              label={cfg.greetingAskAge ? "Asks his age in her first message" : "Does not ask his age (recommended)"}
              name="greeting_ask_age"
              checked={cfg.greetingAskAge}
              onChange={(v) => set("greetingAskAge", v)}
              accent="soft"
            />
          </div>
        </div>

        {/* Emoji settings and realism toggles sit side by side - stacked, they
            pushed this card well past a screen on their own. */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-2 lg:grid-cols-2">
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
          <div className="border-b border-line pb-3">
            <Slider
              label="Message-catch wait"
              name="message_catch_wait_seconds"
              value={cfg.catchWaitSeconds}
              onChange={(v) => set("catchWaitSeconds", v)}
              min={0}
              max={14}
              step={1}
              format={(v) => `${v}s`}
              hint={
                "How long she holds a double or triple text (rapid back-to-back messages) before replying to all of them as one turn, instead of replying to the first one alone. " +
                "Fires BEFORE the reply wait below: this one is \"does she notice you sent 3 texts\", the wait below is \"how long she takes to reply once she has\". 0s reacts to every message instantly."
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Slider label="Min wait" name="response_wait_min" value={cfg.waitMin} onChange={(v) => set("waitMin", v)} min={0} max={60} step={1} format={(v) => `${v}s`} />
            <Slider label="Max wait" name="response_wait_max" value={cfg.waitMax} onChange={(v) => set("waitMax", v)} min={0} max={120} step={1} format={(v) => `${v}s`} />
          </div>
          <div className="mt-1 grid grid-cols-1 gap-2 border-t border-line pt-3 sm:grid-cols-2">
            <Field
              label="Max reply length"
              name="max_response_words"
              type="number"
              defaultValue={clone?.max_response_words ?? undefined}
              placeholder="0 = unlimited"
              hint="Hard ceiling on how many words she can send in one reply. Blank or 0 = unlimited. Applies to text, voice and photo replies."
            />
            {/* Migration 091. Sits between the ceiling and the Match toggle
                because that is the order they apply in: aim for this, scale it
                by his message, then never exceed the cap. */}
            <Field
              label="Ideal reply length"
              name="target_response_words"
              type="number"
              defaultValue={clone?.target_response_words ?? undefined}
              placeholder="blank = no target"
              hint="The average length you WANT her replies to be, in words. Unlike the max above this is a target, not a cap, so some replies land shorter and some longer. Leave blank and her length comes from her persona. If Match length is also on, this is the middle she scales around."
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
            <div className="block">
              <FieldLabel label="Time gaps" />
              <Toggle
                label={cfg.gapAwarenessEnabled ? "Reacts to time gaps" : "Ignores time gaps"}
                name="gap_awareness_enabled"
                checked={cfg.gapAwarenessEnabled}
                onChange={(v) => set("gapAwarenessEnabled", v)}
                accent="soft"
                hint="When on, if he goes quiet for a while then messages again she reacts to the gap naturally (like a 'hey stranger') instead of carrying on mid-conversation as if no time passed. Kicks in after about 6 hours of silence."
              />
            </div>
          </div>
        </Collapse>

        {/* Response pacing was removed on 2026-07-27 by operator decision.
            The runtime is back to the pre-migration-041 behaviour: instant
            read receipt, flat response wait, continuous typing indicator and a
            fixed 3s batching window. The read_delay_*, typing_stutter_*,
            pacing_* and batch_wait_* columns remain in the DB, unread. */}


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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            {/* What each state of the split actually does was a grey paragraph
                under the toggle. It explains the toggle, so it is now the
                toggle's own ⓘ hover and still swaps with the state. */}
            <Toggle
              label="Two-model split (writer + decider)"
              name="_smart_split_toggle"
              checked={cfg.smartSplit}
              onChange={(v) => set("smartSplit", v)}
              accent="soft"
              hint={
                cfg.smartSplit
                  ? "On: your Text model writes her replies, your Routing model fires photo/voice/tip actions (it must support tool-calling). Set both under AI Models in Config."
                  : "Off: one model (your Text model) both writes her replies and fires actions in a single call. Cheaper, but it must support tool-calling."
              }
            />
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Slider label="Stability" name="voice_stability" value={cfg.stability} onChange={(v) => set("stability", v)} />
            <Slider label="Similarity" name="voice_similarity" value={cfg.similarity} onChange={(v) => set("similarity", v)} />
            <Slider label="Style" name="voice_style" value={cfg.style} onChange={(v) => set("style", v)} />
            <Slider label="Speed" name="voice_speed" value={cfg.speed} onChange={(v) => set("speed", v)} min={0.5} max={1.2} />
          </div>
          <input type="hidden" name="voice_speaker_boost" value={String(cfg.speakerBoost)} />
          <Toggle label="Speaker boost" name="_sb_toggle" checked={cfg.speakerBoost} onChange={(v) => set("speakerBoost", v)} accent="soft" />

          <div className="border-t border-line pt-2">
            <Toggle
              label={cfg.randomVoiceEnabled ? "Randomized voice replies" : "No randomized voice"}
              name="random_voice_enabled"
              checked={cfg.randomVoiceEnabled}
              onChange={(v) => set("randomVoiceEnabled", v)}
              accent="soft"
              hint="Randomly send a normal chat reply as a voice note instead of text, so she feels less scripted. Only applies to plain replies (never media or tips), and only when voice is on."
            />
            {/* Always-submit the value so toggling the slider off never drops it. */}
            <input type="hidden" name="random_voice_chance" value={String(cfg.randomVoiceChance)} />
            {cfg.randomVoiceEnabled && (
              <div className="mt-1.5">
                <Slider label="Voice chance" name="_random_voice_chance_ui" value={cfg.randomVoiceChance} onChange={(v) => set("randomVoiceChance", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
              </div>
            )}
          </div>
        </Collapse>

        <Collapse
          emoji="🧠"
          label="Memory"
          accent="cyan"
          hint="How many past messages she recalls each reply. Higher costs more tokens per reply."
        >
          <Slider label="Memory window" name="memory_window" value={cfg.memoryWindow} onChange={(v) => set("memoryWindow", v)} min={1} max={100} step={1} format={(v) => `${v} msgs`} />
          <div className="mt-2 border-t border-line pt-2">
            <MultiSelect
              label="Detail collection priority"
              name="onboarding_collect_fields"
              options={COLLECT_FIELD_OPTIONS.map((o) => o.value)}
              initial={cfg.onboardingCollect}
              hint="Details she prioritizes capturing into his profile dossier whenever he reveals them (name, age, job, ...). Doesn't change what she says, only what her fan-profile memory pays extra attention to. Blank = no priority list."
              cols={3}
            />
          </div>
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
          hint="She picks when and how hard, % capped here. She only decides WHEN and how hard (light/medium/max); the price is always computed in code. 0 = never discount that type. Caps already default to 15/20/25/10, so the switch that actually gates this is Discounts enabled above, which is off by default. She can ONLY reach for a discount at all once one of the two eligibility gates below is met: a locked offer sitting unpaid past the pending window, OR a quiet gap since his last message. A fan chatting enthusiastically never qualifies until one of those trips."
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
          <div className="mt-1 border-t border-line pt-2">
            <FieldLabel
              label="Eligibility gates"
              hint="EITHER gate makes her eligible to offer a discount, not both. Pending window: how long a locked, unpaid offer must sit before she may sweeten it. Slowdown gap: how long he must go quiet before she may proactively offer one. Minimum 1 minute on both, and the pending window is deliberately not zeroable, see its own hint."
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Slider
                label="Pending offer window"
                name="offer_pending_minutes"
                value={cfg.offerPendingMinutes}
                onChange={(v) => set("offerPendingMinutes", v)}
                min={1}
                max={60}
                step={1}
                format={(v) => `${v} min`}
                hint="This does far more than discounts. For this many minutes after a locked offer goes out unpaid, she also stops handing out free media instead of the thing he has not paid for (the revenue-leak guard), stops claiming he already has it, and corrects him if he says he already paid. It also parks the tip/spoil ask so she is not selling two things at once. A 0 here used to switch ALL of that off silently, which is why the minimum is now 1."
              />
              <Slider
                label="Chat slowdown gap"
                name="discount_slowdown_minutes"
                value={cfg.discountSlowdownMinutes}
                onChange={(v) => set("discountSlowdownMinutes", v)}
                min={1}
                max={60}
                step={1}
                format={(v) => `${v} min`}
                hint="Minutes of silence since his last message before she is allowed to reach for a discount on her own. Discounts-only, unlike the pending window beside it. A 0 here meant she was always eligible, so a fan chatting happily could still be offered money off. Minimum 1."
              />
            </div>
          </div>
        </Collapse>

        {/* ── Open-offer redirects (restored 2026-07-29, D6) ──────────── */}
        <Collapse
          emoji="🎯"
          label="Offer follow-up"
          accent="amber"
          hint="How many times she'll gently redirect a fan back to a locked, unpaid offer before she backs off and stops mentioning it. Bot-enforced (clones.offer_redirect_cap)."
        >
          <Slider
            label="Redirect cap"
            name="offer_redirect_cap"
            value={cfg.offerRedirectCap}
            onChange={(v) => set("offerRedirectCap", v)}
            min={1}
            max={10}
            step={1}
            format={(v) => `${v}×`}
          />
        </Collapse>

        {/* ── Decline brake (D7, migration 085) ───────────────────────── */}
        <Collapse
          emoji="🧊"
          label="Decline brake"
          accent="amber"
          hint="How many times a fan has to plainly refuse to pay (e.g. 'i'm not paying', 'too expensive', 'send it free') before she stops INITIATING a new paid photo/video/bundle/tip/VIP pitch at him. She keeps chatting warmly either way, and if he himself asks to buy after this trips, she still delivers. A real purchase always resets his count back to 0. Bot-enforced (clones.offer_decline_cap)."
        >
          <Slider
            label="Decline cap"
            name="offer_decline_cap"
            value={cfg.offerDeclineCap}
            onChange={(v) => set("offerDeclineCap", v)}
            min={1}
            max={10}
            step={1}
            format={(v) => `${v}×`}
          />
        </Collapse>
      </div>

      {/* ── MONETIZATION - sections live in MonetizationSections (end of
          file) so edit mode can host them under the page-level Monetization
          tab instead, inside the same <form>. Create mode keeps them here. */}
      {showMoney && (
        <div className={show("money")}>
          <MonetizationSections cfg={cfg} set={set} clone={clone} photos={photos} videos={videos} bundles={bundles} />
          {/* The monetization-sequence cards (tease/locked bundle & re-warm,
              proactive PPV, discount trigger gating, paywall warmup & unlock
              bonus, pre-lock tease, post-lock re-engagement) were removed on
              2026-07-27 by operator decision, along with their file. */}
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
  photos = [],
  videos = [],
  bundles = [],
}: {
  cfg: CloneConfigState;
  set: SetConfig;
  clone?: Partial<Clone>;
  // Only used by the "promised image" picker (post-lock resume, migration
  // 069). Create mode has no saved media yet, so it's fine to omit these
  // there - the picker just shows "no photos uploaded yet".
  photos?: MediaRow[];
  videos?: MediaRow[];
  bundles?: BundleRow[];
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Toggle label={cfg.charge ? "Charge for messages" : "Messages are free"} name="charge_messages" checked={cfg.charge} onChange={(v) => set("charge", v)} accent="soft" />
          {cfg.charge && (
            <>
              <Field label="Starting credits" name="starting_credits" type="number" defaultValue={clone?.starting_credits ?? 50} />
              <Field label="Pack size" name="credit_pack_size" type="number" defaultValue={clone?.credit_pack_size ?? 50} />
              <Field label="Pack price" name="credit_pack_price_stars" type="number" defaultValue={clone?.credit_pack_price_stars ?? 199} />
            </>
          )}
        </div>
        {/* Migration 090. Rendered UNCONDITIONALLY, deliberately not behind
            cfg.charge: this guards every price she can type, including tips and
            VIP, which a clone sells whether or not it charges for messages. A
            control hidden behind a toggle also posts nothing, and oneOf(...)
            would then rewrite the mode on every save made with charging off. */}
        <div className="border-t border-line pt-2">
          <Segmented
            label="If she invents a price"
            name="price_guard_mode"
            value={cfg.priceGuardMode}
            onChange={(v) => set("priceGuardMode", v)}
            options={SEG.priceGuard}
            accent="accent"
            hint="Every price on a Pay button is computed in code and is always correct. This is about the prices she TYPES in chat. On 2026-07-31 she was measured telling a fan photos 'start at 1000 stars' when they are 40 to 90, and quoting a video price on a clone with no videos. Telling her not to, in her prompt, did not work. This is the code check that does. Leave it on Block. Hover a step to see exactly what each one does."
          />
        </div>
        <div className="border-t border-line pt-2">
          <SubHead
            emoji="🚧"
            label="Out of messages"
            tip="What a fan sees when he runs out of message credits. The buy-more button is attached automatically. By design, only his FIRST hit of an episode gets the Smart personal line below; his 2nd hit gets this static Default message; every hit after that is silently ignored (deleted, no reply) until he tops up. Resets on any top-up."
          />
        </div>
        {/* Plain 2-col split, not two nested sub-cards - the card border around
            each one added a third layer of chrome for no grouping benefit. */}
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">Default</p>
            <div className="grid gap-2">
              {/* Message + button side by side rather than stacked. */}
              <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel label="Message text" />
                  <textarea name="paywall_default_message" rows={2} value={cfg.paywallDefault} onChange={(e) => set("paywallDefault", e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <FieldLabel label="Button text" />
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
            <Toggle label="Smart first message" hint="Only the very first hit of an out-of-credits episode gets this personal line. His 2nd hit gets the static Default message instead, and every hit after that is silently ignored entirely (this is by design, not a bug). Off = the static Default message is used every time, from the first hit." name="smart_paywall_enabled" checked={cfg.smartPaywall} onChange={(v) => set("smartPaywall", v)} accent="soft" />
            {/* Real submitted field is this unconditional hidden input, same pattern
                as smart_split / voice_speaker_boost.
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

        {/* ── Warmup before the wall (pre-lock prime, migration 069) ──────── */}
        <div className="border-t border-line pt-2">
          <SubHead
            emoji="🔥"
            label="Warmup before the wall"
            tip="A gentle heads-up she works in a few messages BEFORE he runs out, so the paywall never lands cold."
          />
          <Toggle
            label={cfg.paywallPrimeEnabled ? "Warm him up before he runs out" : "No pre-lock warmup"}
            name="paywall_prime_enabled"
            checked={cfg.paywallPrimeEnabled}
            onChange={(v) => set("paywallPrimeEnabled", v)}
            accent="soft"
          />
          {/* Unconditional hidden input carries the real voice-note value, same
              pattern as paywall_as_voice above, so hiding the visible toggle when
              warmup is off never drops the stored value on Save. */}
          <input type="hidden" name="paywall_prime_as_voice" value={String(cfg.paywallPrimeVoice)} />
          {cfg.paywallPrimeEnabled && (
            <div className="mt-2 grid grid-cols-1 items-start gap-2 xl:grid-cols-2">
              <Field
                label="Messages before running out"
                name="paywall_prime_before"
                type="number"
                min={1}
                defaultValue={cfg.paywallPrimeBefore}
                hint="How many messages before his credits run out she starts the warmup."
              />
              <Toggle
                label="As voice note"
                hint="Sends the warmup line as a voice note instead of text."
                name="_paywall_prime_as_voice_toggle"
                checked={cfg.paywallPrimeVoice}
                onChange={(v) => set("paywallPrimeVoice", v)}
                accent="soft"
              />
              <div className="xl:col-span-2">
                <Area
                  label="Warmup steer"
                  name="paywall_prime_instruction"
                  rows={2}
                  placeholder="e.g. hint she's got more coming, build the anticipation"
                  defaultValue={clone?.paywall_prime_instruction}
                  hint="Steers the warmup line. Blank = default."
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Pick up after they pay (post-lock resume, migration 069) ────── */}
        <div className="border-t border-line pt-2">
          <SubHead
            emoji="💝"
            label="Pick up after they pay"
            tip="The line (and optional promised image) she sends right after he buys more messages, so paying feels rewarded."
          />
          <Toggle
            label={cfg.paywallResumeEnabled ? "Pick up warmly after he pays" : "No post-pay pickup"}
            name="paywall_resume_enabled"
            checked={cfg.paywallResumeEnabled}
            onChange={(v) => set("paywallResumeEnabled", v)}
            accent="soft"
          />
          {/* Unconditional hidden input for the free/paid choice, same pattern as
              the prime voice toggle above. */}
          <input type="hidden" name="paywall_resume_free" value={String(cfg.paywallResumeFree)} />
          {cfg.paywallResumeEnabled && (
            <div className="mt-2 grid grid-cols-1 items-start gap-2 xl:grid-cols-2">
              <div className="xl:col-span-2">
                <Area
                  label="Pickup steer"
                  name="paywall_resume_instruction"
                  rows={2}
                  placeholder="e.g. thank him, pick the mood back up right where it left off"
                  defaultValue={clone?.paywall_resume_instruction}
                  hint="Steers the pickup line. Blank = she decides freely."
                />
              </div>
              <div className="xl:col-span-2">
                <FieldLabel
                  label="Promised image"
                  hint="The exact photo to send after he pays. Leave on AI picks and she chooses a fresh unseen one."
                />
                {/* Real submitted field - MediaPicker is buttons, not a native
                    input, same pattern as the hidden inputs above. */}
                <input type="hidden" name="paywall_resume_media_id" value={cfg.paywallResumeMediaId ?? ""} />
                <MediaPicker
                  type="photo"
                  photos={photos}
                  videos={videos}
                  bundles={bundles}
                  photosEnabled={cfg.photosEnabled}
                  videosEnabled={cfg.videosEnabled}
                  bundlesEnabled={cfg.bundlesEnabled}
                  value={cfg.paywallResumeMediaId}
                  onPick={(id) => set("paywallResumeMediaId", id)}
                />
              </div>
              <Toggle
                label={cfg.paywallResumeFree ? "Send it free" : "Send it paid"}
                hint="Free = the pickup image is unlocked with no charge. Paid = it follows its normal price."
                name="_paywall_resume_free_toggle"
                checked={cfg.paywallResumeFree}
                onChange={(v) => set("paywallResumeFree", v)}
                accent="soft"
              />
            </div>
          )}
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
        hint="She can ask to be spoiled with Stars. Always recorded as tip revenue. It can also give him message credits back, at the rate you set below, which is off until you set it. The spoil menu is what he sees when he wants to tip but names no amount."
      >
        <Toggle
          label={cfg.tips ? "She can ask for tips" : "No tips"}
          name="tips_enabled"
          checked={cfg.tips}
          onChange={(v) => set("tips", v)}
          accent="soft"
        />
        {/* Migration 088. Rendered unconditionally for the SAME reason as the
            re-ask brakes below, and it matters more here because this one is
            money: a Field hidden behind cfg.tips posts nothing, and
            num(fd, ..., 0) would then silently reset a configured rate to 0 on
            every save made with tips switched off. */}
        <Field
          label="Credits per 100 stars tipped"
          name="tip_credits_per_100_stars"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.tip_credits_per_100_stars ?? 0}
          hint="What a tip gives him back in message credits. 0 means a tip gives no credits, which is the default and what every clone did before this field existed. At 5, a 1000 star tip gives him 50 messages. The amount is always computed from this number, never decided by the AI, and it is rounded DOWN so a tip too small to earn a credit earns none. This is deliberately NOT tied to your pack price: it is a separate rate you control."
        />
        {/* Migration 084, the two tip re-ask brakes. Rendered unconditionally,
            NOT behind cfg.tips like the spoil menu below: a hidden Toggle posts
            nothing, and `=== "true"` would then quietly write false on every
            save made with tips off. */}
        <Field
          label="Tip re-ask cooldown (seconds)"
          name="tip_reask_cooldown_seconds"
          type="number"
          min={1}
          step={1}
          placeholder="180"
          defaultValue={clone?.tip_reask_cooldown_seconds ?? undefined}
          hint="After she has shown him a tip button or the spoil menu, how long she stays off the subject before she is allowed to show one again. Leave blank for the default of 180 seconds, which is what every clone ran on before this field existed. Lower means she circles back to being tipped sooner. A fresh, explicit offer from him always goes through immediately, whatever this says."
        />
        <div className="block">
          <FieldLabel
            label="🎁 May ask again right after a tip"
            hint="Leave this OFF, which is the default and the recommendation. Off, her thank-you after a tip is warm and grateful and stops there. On, that same message may add that she would love another one, seconds after he has just paid you. Tips only, it never touches her reaction to credits, media or subscriptions. Prices and amounts are unaffected either way."
          />
          <Toggle
            label={cfg.tipReaskAfterPaid ? "Can ask for another tip right after one" : "Never asks again right after a tip (recommended)"}
            name="tip_reask_after_paid"
            checked={cfg.tipReaskAfterPaid}
            onChange={(v) => set("tipReaskAfterPaid", v)}
            accent="soft"
          />
        </div>
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

    </>
  );
}

