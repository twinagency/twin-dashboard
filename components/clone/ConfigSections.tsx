"use client";

import { useState } from "react";
import { useDashboardAccess } from "../DashboardAccessProvider";
import { isMoxy } from "@/lib/agency-brand";
import type { Clone } from "@/lib/types";
import type { OrModel } from "@/app/api/models/route";
import ModelSelect from "../ModelSelect";
import {
  Area,
  COLLECT_FIELD_OPTIONS,
  Collapse,
  DEFAULT_PAYWALL_BUTTON,
  DEFAULT_PAYWALL_MESSAGE,
  DEFAULT_PAYWALL_PRIME_STEER,
  DEFAULT_PAYWALL_RESUME_STEER,
  DEFAULT_PAYWALL_STEER,
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
  Warning,
  useDialConflict,
  inputCls,
  selectCls,
} from "./fields";
import type { CloneConfigState, SetConfig } from "./useCloneConfig";
import { DIAL_CONFLICT_RULES } from "@/lib/dial-conflicts";
import { SpoilMenuEditor } from "./editors";
import { V2_TIP_CREDITS_HINT_PREFIX, V2_TIP_CREDITS_LABEL, V2_TIPS_SECTION_HINT } from "@/lib/v2-tips";
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
    { value: "log" as const, label: "👀 Watch only", title: "The message goes out exactly as written, but every invented price is recorded in Logs. Use this for a day if you want to see how often it actually happens for this creator before you let it start blocking anything." },
    { value: "off" as const, label: "🚫 Off", title: "No checking at all. This is how the bot behaved before the guard existed, and it is what allowed her to quote 1000 stars for a 40 star photo. Only pick this if the guard is misfiring on a real message." },
  ],
  // Migration 093 (clones.silence_fallback_mode). Keep On first: it is the
  // default and the safe state. Off is an opt-in to silence, not a tidier
  // setting, so its label says what actually happens to the fan.
  silenceFallback: [
    { value: "on" as const, label: "💬 Send a recovery line", title: "Default. If the model fails or refuses three times in a row, she sends one short line (\"ugh my brain just went completely blank there babe\") so he is not left on read. The wording is the same for every creator and is not editable here." },
    { value: "off" as const, label: "🔇 Say nothing", title: "She sends NOTHING when the model gives up, so he is simply left on read. That is the exact ghosting the recovery line was written to prevent, which is why On is the default. Pick this only if you would rather she said nothing at all than said something that does not fit her. Worth knowing: this does not only fire during an outage, a refusal from the model counts as a failed try too, so it can fire on a message that was merely too explicit." },
  ],
  // Migration 105 (clones.variety_guard). Keep Normal first: it is the default
  // and the fix, and Off is the legacy behaviour that produced the tic.
  varietyGuard: [
    { value: "normal" as const, label: "🔁 Normal", title: "Default. She is stopped from opening or signing off with the same phrase over and over to the same fan, from using his name every single turn, and from resending a line he has already had. A phrase gets caught once it shows up three times across her recent messages to him." },
    { value: "strict" as const, label: "🔒 Strict", title: "The same checks, tighter. A repeated phrase is caught on the second use rather than the third, she looks back over more of her recent messages, and a line only has to be roughly similar to count as a repeat. Use this on a creator that still tics on Normal." },
    { value: "off" as const, label: "🚫 Off", title: "No checking at all. This is how the bot behaved before the guard existed, and it is what let one creator open 14 replies in a row with 'mmm ...' and another close nearly every message the same way. Only pick this if the guard is chopping lines it should be leaving alone." },
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
                    ? "border-accent-2/55 bg-accent-2/16 text-accent-2"
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

// ── Edit-mode configuration workspace ────────────────────────────────────────
// Create keeps the compact setup form below. Existing creators get a denser,
// text-first presentation; all form fields and submit semantics remain shared.

function plainControlLabel(label: string) {
  return label.replace(/^[^A-Za-z0-9=]+/, "");
}

function controlOptions<T extends string>(
  options: { value: T; label: string; title?: string }[],
  editMode: boolean,
) {
  return editMode ? options.map((option) => ({ ...option, label: plainControlLabel(option.label) })) : options;
}

function ConfigModule({
  editMode,
  id,
  title,
  children,
}: {
  editMode: boolean;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  if (!editMode) return <>{children}</>;

  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-[4px] border border-line bg-panel">
      <header className="border-b border-line px-4 py-3 sm:px-5">
        <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      </header>
      <div className="grid gap-3 p-4 sm:p-5 [&_button]:rounded-[3px] [&_input]:rounded-[3px] [&_select]:rounded-[3px] [&_textarea]:rounded-[3px] [&_.clone-segmented]:rounded-[3px] [&_.clone-segmented>button]:rounded-[2px]">
        {children}
      </div>
    </section>
  );
}

function RuntimeDatum({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 bg-panel px-4 py-3">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold text-ink" title={value}>{value}</dd>
    </div>
  );
}

function ConfigRuntimeOverview({
  cfg,
  clone,
  isAgency,
  readOnly,
}: {
  cfg: CloneConfigState;
  clone?: Partial<Clone>;
  isAgency: boolean;
  readOnly: boolean;
}) {
  const outputNames = [
    "Text",
    cfg.photosEnabled ? "Photos" : null,
    cfg.videosEnabled ? "Video" : null,
    cfg.bundlesEnabled ? "Bundles" : null,
    cfg.voice ? "Voice" : null,
  ].filter(Boolean).join(" · ");
  const orchestration = cfg.aiMode === "classic" ? "Classic orchestration" : "Smart orchestration";
  const modelPath = cfg.aiMode === "smart"
    ? (cfg.smartSplit ? "Writer + routing model" : "Single-model execution")
    : "Task-specific model roles";

  return (
    <section aria-labelledby="runtime-summary-title" className="overflow-hidden rounded-[4px] border border-line bg-panel">
      <header className="border-b border-line px-4 py-3 sm:px-5">
        <h2 id="runtime-summary-title" className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Runtime summary</h2>
      </header>
      <dl className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-6">
        <RuntimeDatum label="Account" value={clone?.business_username ? `@${clone.business_username}` : "Not connected"} />
        <RuntimeDatum label="Status" value={cfg.active ? "Active" : "Paused"} />
        <RuntimeDatum label="Engine" value={orchestration} />
        <RuntimeDatum label="Execution" value={modelPath} />
        <RuntimeDatum label="Outputs" value={outputNames} />
        <RuntimeDatum label="Access" value={`${readOnly ? "Read only" : "Editable"} · ${isAgency ? "Agency" : cfg.timezone}`} />
      </dl>
    </section>
  );
}

function CapabilityState({
  label,
  state,
  detail,
}: {
  label: string;
  state: string;
  detail: string;
}) {
  return (
    <div className="bg-panel px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 text-xs font-semibold text-ink">{state}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted">{detail}</p>
    </div>
  );
}

function CapabilityMatrix({ cfg, clone }: { cfg: CloneConfigState; clone?: Partial<Clone> }) {
  const hasVoiceId = Boolean(clone?.voice_id?.trim());
  return (
    <div aria-label="Capability dependencies" className="grid gap-px overflow-hidden rounded-[3px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      <CapabilityState
        label="Photos"
        state={cfg.photosEnabled ? "Delivery enabled" : "Delivery disabled"}
        detail={cfg.photoVision ? "Fan-photo understanding enabled" : "Incoming photos use caption only"}
      />
      <CapabilityState
        label="Video"
        state={cfg.videosEnabled ? "Delivery enabled" : "Delivery disabled"}
        detail={cfg.videoVision ? "Fan-video understanding enabled" : "Incoming videos use caption only"}
      />
      <CapabilityState
        label="Voice"
        state={!cfg.voice ? "Delivery disabled" : hasVoiceId ? "Voice ID present" : "Voice ID required"}
        detail={!cfg.voice ? "Voice stays outside the delivery path" : hasVoiceId ? "Voice delivery has its required identifier" : "Add the identifier in this module"}
      />
      <CapabilityState
        label="Sequences"
        state={cfg.videoSequencesEnabled ? "Creator permission enabled" : "Creator permission disabled"}
        detail={cfg.videoSequencesEnabled ? "Also requires the fleet flag and a published sequence" : "Sequence offers stay outside the runtime"}
      />
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
  const {readOnly, isAgency, agencyName} = useDashboardAccess();
  const privateSettings = readOnly && isMoxy(agencyName);
  const tab = tabProp ?? tabState;
  const setTab = onTabChange ?? setTabState;
  // AI Models start blurred even once the card is open: the model names and
  // their per-1M prices are the shoulder-surf sensitive part of this page, same
  // reasoning as Field's `secret` prop. The pickers stay mounted, selected and
  // fully clickable the whole time, and the hidden inputs still submit their
  // real values, so this is a visual mask only, not access control.
  const [modelsVisible, setModelsVisible] = useState(false);
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

  // ── Dial-conflict warnings (2026-07-31) ──────────────────────────────────
  // Rules themselves now live in lib/dial-conflicts.ts (shared with Twin's
  // checkDialConflicts tool, see app/api/ai-assistant/tools.ts), looked up by
  // id here so the UI and the assistant can never drift out of sync. Both
  // check LIVE cfg values, unlike the two static Warning banners already in
  // this file (Advanced tab header, Discounts card) which render
  // unconditionally.
  const byId = (id: string) => DIAL_CONFLICT_RULES.find((r) => r.id === id)!;
  const silenceGhostConflict = useDialConflict(cfg, [byId("silence-nsfw-max")]);
  const discountCapsAllZeroConflict = useDialConflict(cfg, [byId("discount-caps-zero")]);
  // Migration 097 conflict warnings. Same live-cfg pattern as the two above,
  // not static banners.
  const bubbleDelayConflict = useDialConflict(cfg, [byId("bubble-delay-range")]);
  const silenceFallbackCooldownConflict = useDialConflict(cfg, [byId("silence-fallback-cooldown-inert")]);
  const discountAbsoluteMaxConflict = useDialConflict(cfg, [byId("discount-absolute-max-below-cap")]);
  // Migration 099. The three spend-tier thresholds must stay strictly
  // descending (whale > high > mid) or a fan can land in more than one tier
  // (or none) at the same spend level, silently breaking the tiering.
  const spendTierConflict = useDialConflict(cfg, [byId("spend-tier-order")]);

  return (
    <div className="grid min-w-0 gap-4">
      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div
        data-readonly-navigation
        className={
          mode === "edit"
            ? "clone-editor-tabs sticky top-0 z-30 grid grid-cols-2 overflow-hidden rounded-[4px] border border-line bg-panel/95 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]"
            : "clone-editor-tabs sticky top-0 z-30 flex gap-1 overflow-x-auto rounded-2xl border border-white/55 bg-white/80 p-1.5 shadow-[0_10px_30px_rgb(16_24_40/0.08)] backdrop-blur-xl"
        }
      >
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hint}
            onClick={() => setTab(t.key)}
            className={
              (mode === "edit"
                ? "min-w-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-center text-xs font-semibold transition "
                : "min-w-[8rem] flex-none whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition sm:min-w-0 sm:flex-1 ") +
              (tab === t.key
                ? (mode === "edit" ? "border-accent-2 bg-accent-2/[0.04] text-ink" : "bg-panel text-ink shadow-sm")
                : (mode === "edit" ? "border-transparent text-muted hover:border-line hover:text-ink" : "text-muted hover:bg-muted/10 hover:text-ink"))
            }
          >
            {mode === "edit" ? plainControlLabel(t.label) : t.label}
          </button>
        ))}
      </div>

      {/* ── IDENTITY - facts a fan could ask about her ─────────────
          Personality & style (flirt/nsfw/push dials, emoji, realism, language)
          moved OUT to Config 2026-07-26: those are operator dials for HOW she
          behaves, not facts about her, so they don't belong in this tab. */}
      <div className={`${show("identity")} identity-tab-scope`}>
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
      {mode === "edit" && <ConfigRuntimeOverview cfg={cfg} clone={clone} isAgency={isAgency} readOnly={readOnly} />}
      <div className={mode === "edit" ? "grid min-w-0 gap-4" : "contents"}>
      <ConfigModule
        editMode={mode === "edit"}
        id="config-runtime"
        title="Runtime & connection"
      >
      <Section
        icon={mode === "edit" ? undefined : "🔌"}
        accent="blue"
        title={mode === "edit" ? undefined : "Connection & mode"}
        cols={2}
        hint="Bot token from @BotFather."
        className={mode === "edit" ? "!h-auto !rounded-none !border-0 !bg-transparent !p-0 !shadow-none" : ""}
      >
        {isAgency ? <div>
          <FieldLabel label="Bot token" hint="Only the dashboard administrator can access this credential." />
          <div aria-label="Bot token concealed" className="flex min-h-10 items-center gap-3 rounded-lg border border-line bg-elev px-3">
            <span aria-hidden="true" className="select-none blur-[3px]">••••••••••••••••••••</span>
            <span className="ml-auto text-xs text-muted">Locked</span>
          </div>
        </div> : <Field
          label="Bot token"
          name="bot_token"
          defaultValue={clone && clone.bot_token !== "PLACEHOLDER" ? clone.bot_token : ""}
          required
          placeholder="1234:ABC..."
          secret
        />}
        {/* Migration 092 as CORRECTED by 094. This is the connected BUSINESS
            ACCOUNT's handle - the identity a fan actually messages - not the
            bot's own API handle. 092 originally captured the latter from
            onStart and it was the wrong identity; do not "restore" that.
            READ-ONLY and deliberately NOT a Field: it has no `name`, so it
            posts nothing on save and is absent from rowFromForm. An editable
            copy could overwrite what Telegram reported, which is the drift
            this column exists to remove. NULL until a business connection has
            been observed, so create mode never shows it. */}
        {mode === "edit" && (
          <div className="block">
            <FieldLabel
              label="Business account"
              hint="The @handle fans actually message, read from the Telegram business connection itself. This is not the bot's own @username and it is not typed here, so it cannot drift from the real one. Blank means no business connection has been seen yet; it fills in on the next inbound fan message."
            />
            <div className="flex min-h-9 items-center text-sm">
              {clone?.business_username ? (
                <span className="truncate font-mono text-ink">@{clone.business_username}</span>
              ) : (
                <span className="text-muted">Not connected yet</span>
              )}
            </div>
          </div>
        )}
        <Field
          label="Account phone number"
          name="account_phone"
          type="tel"
          defaultValue={clone?.account_phone ?? ""}
          placeholder="+61 400 000 000"
          hint="The phone number of the Telegram account this creator runs on. Just a note for your records, nothing uses it."
        />
        {mode === "edit" ? (
          <div className="block">
            <FieldLabel label="Status" hint="Paused means the bot ignores every incoming message for this creator. Nothing is deleted, she just stops replying until you set her active again." />
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
            options={controlOptions(SEG.fanTime, mode === "edit")}
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
            label={mode === "edit" ? "Decision engine" : "🧠 AI mode"}
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
                (cfg.aiMode === m ? "bg-accent/12 text-accent" : "text-muted hover:text-ink")
              }
            >
              {mode === "edit" ? (m === "classic" ? "Classic / rule-directed" : "Smart / AI-directed") : (m === "classic" ? "🧭 classic" : "🧠 smart")}
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
      </ConfigModule>

      {/* Media types, the voice ID and the AI-disclosure toggle used to be a
          whole separate tab holding three thin cards. It's one card. */}
      <ConfigModule
        editMode={mode === "edit"}
        id="config-capabilities"
        title="Media & delivery capabilities"
      >
      {mode === "edit" && <CapabilityMatrix cfg={cfg} clone={clone} />}
      <Section
        icon={mode === "edit" ? undefined : "🖼"}
        accent="blue"
        title={mode === "edit" ? undefined : "What she can send"}
        hint="What she sends, what she sees, and the bot-question policy."
        className={mode === "edit" ? "!h-auto !rounded-none !border-0 !bg-transparent !p-0 !shadow-none" : ""}
      >
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <ToggleCard emoji={mode === "edit" ? "" : "📷"} label="Photos" name="photos_enabled" checked={cfg.photosEnabled} onChange={(v) => set("photosEnabled", v)} />
          <ToggleCard emoji={mode === "edit" ? "" : "🎥"} label="Videos" name="videos_enabled" checked={cfg.videosEnabled} onChange={(v) => set("videosEnabled", v)} />
          <ToggleCard emoji={mode === "edit" ? "" : "🎁"} label="Photo bundles" title="Fans can request them" name="bundles_enabled" checked={cfg.bundlesEnabled} onChange={(v) => set("bundlesEnabled", v)} />
          <ToggleCard emoji={mode === "edit" ? "" : "🎙"} label="Voice messages" name="voice_enabled" checked={cfg.voice} onChange={(v) => set("voice", v)} />
        </div>
        {/* Never-resend rule (clones.media_allow_resend). Default off = current
            behaviour, an item a fan already received never repeats. On = she may
            resend it. Separate row so it reads as a rule about repeats, not a
            fifth "what she can send" media type. */}
        <div className="border-t border-line pt-2">
          <ToggleCard
            emoji={mode === "edit" ? "" : "🔁"}
            label={cfg.mediaAllowResend ? "Resends allowed" : "Never resend"}
            title="Off (default): once a fan has received a photo/video, it's removed from her pool forever, she'll never send that exact item again. On: she may resend items he's already seen."
            name="media_allow_resend"
            checked={cfg.mediaAllowResend}
            onChange={(v) => set("mediaAllowResend", v)}
          />
        </div>
        {/* Per-creator video sequences (clones.video_sequences_enabled,
            migration 147). Its own row because it is not a media type she can
            send, it is permission to sell one long recording as a free preview
            plus paid parts. Read by videoSequencesEnabled() in
            bot/src/intent/sequence.ts, which AND-s it with the global
            VIDEO_SEQUENCES_ENABLED env flag, so this switch alone cannot turn
            the feature on. */}
        <div className="border-t border-line pt-2">
          <ToggleCard
            emoji={mode === "edit" ? "" : "🎬"}
            label={cfg.videoSequencesEnabled ? "Sells video sequences" : "No video sequences"}
            title="Off (default): she never offers a sequence. On: a published sequence for this creator can be introduced with its free preview and its paid parts sold one at a time, in order. Needs a published sequence on the Sequences page, and the feature also has to be switched on for the whole fleet in the bot's environment."
            name="video_sequences_enabled"
            checked={cfg.videoSequencesEnabled}
            onChange={(v) => set("videoSequencesEnabled", v)}
          />
        </div>
        {/* Sell-via-Mini-App switch (clones.sell_via_mini_app, migration
            20260928140000). Default off, on purpose left off for every clone
            already running until deploys are unblocked. Off: paid photos,
            videos and bundles go out as the Stars-locked original in chat,
            today's behaviour. On: they go out as a blurred preview with an
            "Unlock now" button that opens the item in the catalogue Mini App. */}
        <div className="border-t border-line pt-2">
          <ToggleCard
            emoji={mode === "edit" ? "" : "🛍"}
            label="Redirect chat purchases to Mini App"
            title="When on, chat purchases use a preview and an Unlock now button in the Mini App. Leave off to keep native Telegram chat checkout. The pinned Mini App catalogue stays available either way."
            name="sell_via_mini_app"
            checked={cfg.sellViaMiniApp}
            onChange={(v) => set("sellViaMiniApp", v)}
          />
        </div>
        {/* Strict media-match dial (clones.media_match_strict, migration 104).
            When the AI can't confidently read what item to send (its answer
            comes back unparseable), the code has always had to pick something
            or decline. Off (default) picks the first available item anyway,
            which is how a fan asking for e.g. a family photo she doesn't have
            got sent an unrelated item described as if it were the real thing.
            On makes her say she doesn't have it instead of guessing. */}
        <div className="border-t border-line pt-2">
          <ToggleCard
            emoji={mode === "edit" ? "" : "🎯"}
            label={cfg.mediaMatchStrict ? "Only send an exact match" : "May guess if unsure"}
            title="Off (default): if she can't tell what to send, she picks something from her catalogue anyway rather than send nothing. On: if she's not sure it's a real match, she tells him honestly she doesn't have it instead of sending and describing the wrong item."
            name="media_match_strict"
            checked={cfg.mediaMatchStrict}
            onChange={(v) => set("mediaMatchStrict", v)}
          />
        </div>
        {/* Vision lives in its own row: every toggle above controls what she SENDS,
            these control what she RECEIVES, and grouping them together read as
            send toggles. Both default on. Turning either off means she ignores
            that media type entirely, so she will reply to the caption only. */}
        <div className="border-t border-line pt-2">
          <SubHead
            emoji={mode === "edit" ? "" : "👁"}
            label="What she can see"
            tip="Off means she ignores that media entirely and replies to the caption only. Video costs more than photos, the bot downloads the file and grabs a single frame."
          />
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <ToggleCard emoji={mode === "edit" ? "" : "📸"} label="Sees fan photos" title="She looks at photos fans send her" name="photo_vision_enabled" checked={cfg.photoVision} onChange={(v) => set("photoVision", v)} />
            <ToggleCard emoji={mode === "edit" ? "" : "🎬"} label="Sees fan videos" title="She can see videos fans send her" name="video_vision_enabled" checked={cfg.videoVision} onChange={(v) => set("videoVision", v)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-2">
          <ToggleCard
            emoji={mode === "edit" ? "" : "✍️"}
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
          <Field
            label="ElevenLabs API key"
            name="elevenlabs_api_key"
            defaultValue={clone?.elevenlabs_api_key}
            placeholder="Leave blank to use the shared key"
            secret
          />
          <div
            className="block"
            title={`What she does when a fan asks if she's an AI. Default: she stays fully in character as a real woman and deflects. On: she admits she's an AI companion.`}
          >
            <FieldLabel label={mode === "edit" ? "AI disclosure response" : "🛡 Bot question"} hint={`What she does when a fan asks if she's an AI. Default: she stays fully in character as a real woman and deflects. On: she admits she's an AI companion.`} />
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
      </ConfigModule>

      {/* The Safety section was removed (2026-07-27). It only ever held the
          four auto-block toggles, and the AI no longer blocks anyone, so there
          was nothing left to configure. The guard in bot/src/safety.ts still
          runs on every message and still logs every breach (MINOR at error
          level) for operator review on /logs. What she will and will not do
          in character lives in the identity section's hard limits, which is a
          different thing entirely: that shapes HER replies, this watched what
          the FAN sends. */}

      {/* Personality, emoji style and realism touches used to be crammed into
          one "Personality & style" card (sexual/nsfw/push/warmth/curiosity/
          playfulness/attentiveness dials, PLUS emoji, read receipts and
          language lock — seven-plus unrelated dial families under one
          header). Split 2026-07-31 to match the one-card-per-topic
          convention the rest of this file follows (see "Connection & mode",
          "What she can send", "Category pricing"): the five-step Segmented
          dials are all one topic (tone), the rest is a second topic
          (behavior/style toggles). Moved here from Identity 2026-07-26: this
          is an operator dial for HOW she behaves, not a fact a fan could ask
          about, so it's Config. */}
      <ConfigModule
        editMode={mode === "edit"}
        id="config-calibration"
        title="Response calibration"
      >
      <Section
        icon={mode === "edit" ? undefined : "🎚"}
        accent="pink"
        title={mode === "edit" ? undefined : "Tone dials"}
        hint="Five-step sliders that steer her voice: sex, selling, warmth. Hard limits and prices stay locked in code."
        tip="These never override the built-in hard limits, and money stays locked in code (push only changes how eager she is, never prices). All are prompt wording sent to the model, not a code lock."
        className={mode === "edit" ? "!h-auto !rounded-none !border-0 !bg-transparent !p-0 !shadow-none" : ""}
      >
        <div className={mode === "edit" ? "grid grid-cols-1 gap-3 xl:grid-cols-2" : "grid grid-cols-1 gap-3 sm:grid-cols-3"}>
          <Segmented
            label="Flirtiness"
            name="sexual_level"
            value={cfg.sexualLevel}
            onChange={(v) => set("sexualLevel", v)}
            options={controlOptions(SEG.sexual, mode === "edit")}
            accent={mode === "edit" ? "accent" : "pink"}
            hint="Does SHE start it: how boldly she flirts first. Off means she stays clean and redirects; Max means she leads the tension in almost every exchange. This is wording sent to the model, not a code lock, so treat the ends as strong steering rather than a guarantee. Hover a step to see exactly what she is told."
          />
          <Segmented
            label="NSFW"
            name="nsfw_level"
            value={cfg.nsfwLevel}
            onChange={(v) => set("nsfwLevel", v)}
            options={controlOptions(SEG.nsfw, mode === "edit")}
            accent={mode === "edit" ? "accent" : "red"}
            hint="How graphic once things heat up. Off deflects every explicit request; Max is fully filthy, blunt language, no fade to black. Wording sent to the model, not a code lock, so it steers her hard but cannot guarantee. The built-in hard limits still apply at every step."
          />
          <Segmented
            label="Content pushing"
            name="push_level"
            value={cfg.pushLevel}
            onChange={(v) => set("pushLevel", v)}
            options={controlOptions(SEG.push, mode === "edit")}
            accent={mode === "edit" ? "accent" : "green"}
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
        <div className={mode === "edit" ? "grid gap-3 border-t border-line pt-2 xl:grid-cols-2" : "grid gap-3 border-t border-line pt-2 sm:grid-cols-2 lg:grid-cols-4"}>
          <Segmented
            label="Curiosity"
            name="curiosity_level"
            value={cfg.curiosityLevel}
            onChange={(v) => set("curiosityLevel", v)}
            options={controlOptions(SEG.curiosity, mode === "edit")}
            accent="accent"
            hint="How much she asks about HIM. This is the dial behind 'she never asks about me'. At High she must follow up on the specific thing he mentioned and is explicitly forbidden from bouncing a personal topic back with 'what about you', which is the exact habit that reads as not listening. Start at High; Max is genuinely intense and can feel like an interview. Wording sent to the model, not a code lock."
          />
          <Segmented
            label="Warmth"
            name="warmth_level"
            value={cfg.warmthLevel}
            onChange={(v) => set("warmthLevel", v)}
            options={controlOptions(SEG.warmth, mode === "edit")}
            accent={mode === "edit" ? "accent" : "purple"}
            hint="How much affection and comfort she gives. Separate from flirtiness on purpose: this is care, not heat. High makes her acknowledge a hard thing before moving on and stops her going cold when he is negative or short with her. Read a transcript before raising this, her baseline warmth is already decent. Wording sent to the model, not a code lock."
          />
          <Segmented
            label="Playfulness"
            name="playfulness_level"
            value={cfg.playfulnessLevel}
            onChange={(v) => set("playfulnessLevel", v)}
            options={controlOptions(SEG.playfulness, mode === "edit")}
            accent={mode === "edit" ? "accent" : "amber"}
            hint="How much she teases and jokes. Owns humour only, never affection or curiosity, so it will not make her ask more questions. Every step above Off still requires her to drop the teasing instantly if he is genuinely upset. Wording sent to the model, not a code lock."
          />
          <Segmented
            label="Memory use"
            name="attentiveness_level"
            value={cfg.attentivenessLevel}
            onChange={(v) => set("attentivenessLevel", v)}
            options={controlOptions(SEG.attentiveness, mode === "edit")}
            accent={mode === "edit" ? "accent" : "green"}
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
            options={controlOptions(SEG.tipPush, mode === "edit")}
            accent={mode === "edit" ? "accent" : "amber"}
            hint="How hard she asks to be TIPPED and spoiled, dialled separately from photos, videos and bundles. Leave on '= Push' and tips follow the Content pushing dial exactly, which adds nothing to her prompt. Move it and only tips change: a soft-sell creator that still loves being spoiled, or a heavy content seller who never begs for Stars. Amounts always come from the fixed spoil menu, she never names a number."
          />
        </div>
      </Section>
      </ConfigModule>

      {/* Second half of the old "Personality & style" card: everything that
          isn't a tone dial — a one-off greeting behavior, emoji use, realism
          touches and the language lock. These don't share an axis with each
          other either, but each is a single toggle/select rather than a
          five-step dial, so grouping them as "behavior toggles" (as opposed
          to "tone dials" above) matches this file's one-card-per-topic
          convention without inventing a taxonomy per field. */}
      <ConfigModule
        editMode={mode === "edit"}
        id="config-policy"
        title="Interaction policy"
      >
      <Section
        icon={mode === "edit" ? undefined : "🎛"}
        accent="purple"
        title={mode === "edit" ? undefined : "Behavior toggles"}
        hint="One-off behavior switches: greeting, emoji use, realism touches, language lock."
        className={mode === "edit" ? "!h-auto !rounded-none !border-0 !bg-transparent !p-0 !shadow-none" : ""}
      >
        {/* greeting_ask_age (migration 080), read at
            bot/src/flows/human.ts:383 in newFanGreetingNudge. Off is the
            default and the recommendation, see the hint. */}
        <div className="block">
          <FieldLabel
            label={mode === "edit" ? "First-message age question" : "🎂 Ask his age in message one"}
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

        {/* Emoji settings and realism toggles sit side by side - stacked, they
            pushed this card well past a screen on their own. */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-2 lg:grid-cols-2">
        <div className="grid content-start gap-1.5">
        <SubHead emoji={mode === "edit" ? "" : "😊"} label="Emojis" tip="Applies to text and photo replies, never voice notes." />
        <Toggle label={cfg.emojis ? "Uses emojis" : "No emojis at all"} name="emojis_enabled" checked={cfg.emojis} onChange={(v) => set("emojis", v)} accent="soft" />
        {cfg.emojis && (
          <Segmented label="Amount" name="emoji_amount" value={cfg.emojiAmount} onChange={(v) => set("emojiAmount", v)} options={controlOptions(SEG.emoji, mode === "edit")} accent="amber" />
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
        {/* emoji_allowlist above is deliberately cleared when emojis are off.
            emoji_amount is NOT - it had the same drop-on-save defect and would
            silently revert to "medium", so the operator's chosen amount is
            preserved and simply unused while emojis are off. */}
        {!cfg.emojis && <input type="hidden" name="emoji_amount" value={cfg.emojiAmount} />}
        </div>

        <div className="grid content-start gap-1.5">
        <SubHead
          emoji={mode === "edit" ? "" : "✨"}
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
          <ToggleCard emoji={mode === "edit" ? "" : "👀"} label="Read receipts" title="Marks his message read" name="read_receipts_enabled" checked={cfg.readReceipts} onChange={(v) => set("readReceipts", v)} />
        </div>
        </div>
        </div>

        {/* Language lock - off = she mirrors whatever the fan writes. On = she
            only ever writes in the picked languages, and the runtime retries a
            reply that drifts into a foreign script (a model randomly emitting
            Chinese, etc.). Pick none = English is assumed. Collapsed multi-select
            (not the old always-open 22-chip grid) since this is usually one value. */}
        <div className="grid content-start gap-1.5 border-t border-line pt-2">
          <SubHead emoji={mode === "edit" ? "" : "🌐"} label="Language" tip="Force her replies into set languages instead of mirroring the fan. Catches a model randomly switching to Chinese/another script and retries it." />
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
      </ConfigModule>

        {/* Timing (memory window moved to Advanced — not something touched
            setting up a fresh clone). */}
        <ConfigModule
          editMode={mode === "edit"}
          id="config-delivery"
          title="Delivery mechanics"
        >
        <Collapse
          emoji={mode === "edit" ? "" : "⏱"}
          label={mode === "edit" ? "Timing controls" : "Timing & length"}
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
        </ConfigModule>

        <ConfigModule
          editMode={mode === "edit"}
          id="config-models"
          title="Model routing"
        >
        {!privateSettings && <Collapse
          emoji={mode === "edit" ? "" : "⚙️"}
          label={mode === "edit" ? "Model assignments" : "AI Models"}
          accent="blue"
          className="xl:col-span-2"
          hint="Names and prices are blurred until you hit View. Search by name. Price per 1M tokens (in / out). ⭐ Best, 💰 Value, 🪙 Cheapest pinned on top."
        >
          {/* type="button": this sits inside the one big clone <form>, so a
              bare <button> would default to submit and save on every reveal. */}
          <button
            type="button"
            onClick={() => setModelsVisible((v) => !v)}
            aria-pressed={modelsVisible}
            className="mb-2 rounded-md border border-line px-2 py-1 text-xs text-muted transition hover:text-ink"
          >
            {modelsVisible ? "Hide" : "View"}
          </button>
          <div
            className={
              "grid grid-cols-1 gap-2 transition-[filter] duration-150 sm:grid-cols-2" +
              // pointer-events-none while masked so nobody reassigns a model
              // they cannot read. It does not unmount or disable anything, so
              // every hidden input still submits its real value.
              (modelsVisible ? "" : " pointer-events-none select-none blur-[3px]")
            }
          >
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
        </Collapse>}
        {privateSettings && mode === "edit" && (
          <div className="rounded-lg border border-line bg-elev/45 px-3 py-3 text-xs text-muted">
            Model assignments are restricted for this operator account.
          </div>
        )}
        </ConfigModule>
      </div>
      </div>

      {/* ── ADVANCED - power-user settings, nobody touches these configuring
          a fresh clone. Everything here used to live in Config or Monetization;
          moved out 2026-07-26 so those tabs aren't padded with dials an
          operator only needs once they already know exactly what they're
          doing. All controlled state (cfg.smartSplit, cfg.stability, ...) is
          shared across tabs regardless of which one is visible, so nothing
          here needs its own hidden-input duplication. */}
      <div className={`${show("advanced")} ${mode === "edit" ? "[&>section]:rounded-[4px] [&>section]:border-l [&>section]:shadow-none [&>div]:rounded-[4px] [&>div]:border-l [&_button]:rounded-[3px] [&_input]:rounded-[3px] [&_select]:rounded-[3px] [&_textarea]:rounded-[3px] [&_.clone-segmented]:rounded-[3px] [&_.clone-segmented>button]:rounded-[2px]" : ""}`}>
        {/* One caution for the whole tab, not one per card. Everything below
            either changes what a fan is charged (category pricing, the four
            discount caps) or relaxes a limit that exists to slow her down (the
            decline brake, the redirect cap, the eligibility gates, the chat
            slowdown gap). Raising a cap here makes her pushier, which is the
            failure mode that has actually bitten this project before. Spans
            both columns: this grid is xl:grid-cols-2. */}
        <Warning
          className="xl:col-span-2"
          text="Power settings. Several of these are brakes, and raising one makes her push harder for money."
          detail="Category pricing and the discount caps change what fans are actually charged. The decline brake, the redirect cap, the eligibility gates and the chat slowdown gap are limits that stop her re-offering too soon, so raising them makes her pushier. Change one thing at a time and watch the effect before changing another."
        />
        {/* Migration 093. Rendered UNCONDITIONALLY and NOT inside the
            smart-mode card below, which is behind cfg.aiMode === "smart": a
            control that is not rendered posts nothing, and oneOf(...) in
            actions.ts would then rewrite the mode to 'on' on every save made
            from a classic-mode clone. Same trap the price guard documents.
            It sits directly under the warning because "off" means she ghosts
            the fan, which is the most consequential switch on this tab. */}
        <Section
          icon={mode === "edit" ? undefined : "🔇"}
          accent={mode === "edit" ? "neutral" : "amber"}
          title="When the model gives up"
          hint="After three failed tries she either sends one short recovery line or says nothing at all."
          tip="This fires when the model fails OR refuses three times in a row, not only during an API outage. To see which is happening for this creator, open Logs and filter OpenRouter for 'all 3 tries failed'."
          className="xl:col-span-2"
        >
          <Segmented
            label="If she cannot generate a reply"
            name="silence_fallback_mode"
            value={cfg.silenceFallbackMode}
            onChange={(v) => set("silenceFallbackMode", v)}
            options={controlOptions(SEG.silenceFallback, mode === "edit")}
            accent={mode === "edit" ? "accent" : "amber"}
            warning={
              silenceGhostConflict && (
                <Warning text={silenceGhostConflict.text} detail={silenceGhostConflict.detail} />
              )
            }
          />
        </Section>

        {/* Migration 105 (clones.variety_guard), read at
            bot/src/services/variety.ts by normalizeVarietyGuard() to pick the
            tuning thresholds used on the reply path (flows/text.ts) and on every
            composed proactive send (persona-message.ts). Rendered
            UNCONDITIONALLY and outside the smart-mode card for the same reason
            the two dials above it are: a control that is not rendered posts
            nothing, and oneOf(...) in actions.ts would then rewrite the level on
            every save made from a tab that did not draw it. Note the default is
            NOT "today's unchanged behaviour" here, "off" is: the guard shipped
            armed on every clone because the pre-105 behaviour was the bug. */}
        <Section
          icon={mode === "edit" ? undefined : "🔁"}
          accent={mode === "edit" ? "neutral" : "purple"}
          title="Repeating herself"
          hint="How hard she is stopped from reusing the same openers, sign-offs and lines with the same fan."
          tip="This is enforced in code on the way out, not by a prompt rule. The tics it exists to catch were invented by the model out of its own previous replies, so asking her nicely in the prompt does not reach them."
          className="xl:col-span-2"
        >
          <Segmented
            label="Variety guard"
            name="variety_guard"
            value={cfg.varietyGuard}
            onChange={(v) => set("varietyGuard", v)}
            options={controlOptions(SEG.varietyGuard, mode === "edit")}
            accent={mode === "edit" ? "accent" : "purple"}
            hint="Leave this on Normal, the default and the fix. It watches her recent messages to each fan and blocks the same opening phrase, the same sign-off, his name every single turn, a near-identical message resent to him, and a stock line going out to two different men close together. Strict catches a phrase on its second use instead of its third and looks back further. Off is the old behaviour that had one creator open 14 replies in a row with the same two words. Hover a step to see exactly what changes."
          />
        </Section>

        {/* Migration 097. Bubble delay, silence-recovery cooldown and the LLM
            retry count share one card because all three are "how the runtime
            paces itself before/around a reply", distinct from the money
            guardrails and the realism/router keywords below. Approved
            2026-07-31 off coord/ADVANCED-DIAL-CANDIDATES.txt (all 8 items). */}
        <Section
          icon={mode === "edit" ? undefined : "⏳"}
          accent={mode === "edit" ? "neutral" : "cyan"}
          title="Pacing & retries"
          hint="Bubble-send timing, the silence-recovery cooldown, and how many tries the model gets before giving up."
          className="xl:col-span-2"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Slider
              label="Bubble delay, minimum"
              name="bubble_delay_min_ms"
              value={cfg.bubbleDelayMinMs}
              onChange={(v) => set("bubbleDelayMinMs", v)}
              min={0}
              max={5000}
              step={100}
              format={(v) => `${v}ms`}
              hint="How long before the first of several split 'typing' bubbles sends, when a reply arrives as more than one message. Was a fixed range; default 600ms."
            />
            <Slider
              label="Bubble delay, maximum"
              name="bubble_delay_max_ms"
              value={cfg.bubbleDelayMaxMs}
              onChange={(v) => set("bubbleDelayMaxMs", v)}
              min={0}
              max={5000}
              step={100}
              format={(v) => `${v}ms`}
              hint="The other end of the bubble-delay range above. Must stay at or above the minimum. Default 1400ms."
              warning={
                bubbleDelayConflict && (
                  <Warning text={bubbleDelayConflict.text} detail={bubbleDelayConflict.detail} />
                )
              }
            />
          </div>
          <div className="border-t border-line pt-2">
            <Field
              label="Silence-fallback recovery cooldown (seconds)"
              name="silence_fallback_cooldown_seconds"
              type="number"
              min={1}
              step={1}
              placeholder="300"
              defaultValue={clone?.silence_fallback_cooldown_seconds ?? undefined}
              hint="Minimum gap before the 'my brain went blank' recovery line can fire again for the same fan. Leave blank for the default of 300 seconds."
            />
            {silenceFallbackCooldownConflict && (
              <div className="mt-1.5">
                <Warning text={silenceFallbackCooldownConflict.text} detail={silenceFallbackCooldownConflict.detail} />
              </div>
            )}
          </div>
          <div className="border-t border-line pt-2">
            <Slider
              label="Model retry attempts before giving up"
              name="llm_max_tries"
              value={cfg.llmMaxTries}
              onChange={(v) => set("llmMaxTries", v)}
              min={1}
              max={5}
              step={1}
              format={(v) => `${v}×`}
              hint="How many tries (primary model, retry, fallback model) before she falls back to the silence-fallback path above. Was a fixed constant; default 3."
            />
          </div>
        </Section>

        {/* Two-model split: only relevant once AI mode (Config) is Smart. The
            ai_mode/smart_split hidden inputs in Config's Connection & mode
            card always submit the current value no matter which tab is open,
            so this card is just the visible control. */}
        {cfg.aiMode === "smart" && (
          <Section
            icon={mode === "edit" ? undefined : "🧠"}
            accent={mode === "edit" ? "neutral" : "purple"}
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
              hint="How many of her own most recent replies must NOT have been a voice note before Smart mode will pick voice again, unless he freshly and explicitly asks for another one, that always overrides this. Without a cooldown the decider can pattern-match its own recent voice sends and get stuck replying with only voice notes for several turns straight. 0 turns it off entirely for a creator that should send voice often."
            />
          </Section>
        )}

        <Collapse emoji={mode === "edit" ? "" : "🎛"} label="Voice tuning" accent={mode === "edit" ? "neutral" : "purple"} hint="ElevenLabs sound controls.">
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
          emoji={mode === "edit" ? "" : "🧠"}
          label="Memory"
          accent={mode === "edit" ? "neutral" : "cyan"}
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

        {/* Category pricing lives on the PPVs page now (2026-09-01) — it's
            edited alongside the media it prices, with a Reprice action that
            retroactively repriced existing items, which this tab's Save
            never did. See app/media/MediaManager.tsx. */}

        {/* Migration 097. Two hard money ceilings that sit above everything
            else on this tab: the absolute discount ceiling clamps EVERY
            discount regardless of the per-category caps or the Discounts
            card's own multipliers below, and the tip ceiling clamps a single
            tip invoice. Their own card because neither depends on the other,
            unlike the Discounts card's internal dials. Approved 2026-07-31 off
            coord/ADVANCED-DIAL-CANDIDATES.txt. */}
        <Section
          icon={mode === "edit" ? undefined : "🛡"}
          accent={mode === "edit" ? "neutral" : "red"}
          title="Money guardrails"
          hint="Hard ceilings that clamp what a fan can ever be charged, regardless of the dials elsewhere on this tab."
        >
          <Slider
            label="Absolute discount ceiling"
            name="discount_absolute_max_pct"
            value={cfg.discountAbsoluteMaxPct}
            onChange={(v) => set("discountAbsoluteMaxPct", v)}
            min={1}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            hint="Hard cap on ANY discount she offers, regardless of the per-category caps in the Discounts card below. Was a fixed 90% constant in code; this exposes it as a dial."
            warning={
              discountAbsoluteMaxConflict && (
                <Warning text={discountAbsoluteMaxConflict.text} detail={discountAbsoluteMaxConflict.detail} />
              )
            }
          />
          <Field
            label="Single-tip sanity ceiling (Stars)"
            name="tip_max_stars"
            type="number"
            min={1}
            step={1}
            defaultValue={clone?.tip_max_stars ?? 100000}
            hint="Max Stars a single tip invoice can ever be. Guards against an absurd or typo'd amount reaching a fan. Was a fixed 100000-star constant in code."
          />
        </Section>

        {/* ── Discounts (moved from Monetization) ───────────────────── */}
        <Collapse
          emoji={mode === "edit" ? "" : "💸"}
          label="Discounts"
          accent={mode === "edit" ? "neutral" : "green"}
          filled={cfg.discountsEnabled}
          hint="She picks when and how hard, % capped here. She only decides WHEN and how hard (light/medium/max); the price is always computed in code. 0 = never discount that type. Caps already default to 15/20/25/10, so the switch that actually gates this is Discounts enabled above, which is off by default. She can ONLY reach for a discount at all once one of the two eligibility gates below is met: a locked offer sitting unpaid past the pending window, OR a quiet gap since his last message. A fan chatting enthusiastically never qualifies until one of those trips."
        >
          <Toggle label={cfg.discountsEnabled ? "She can offer discounts" : "No discounts"} name="discounts_enabled" checked={cfg.discountsEnabled} onChange={(v) => set("discountsEnabled", v)} accent="soft" />
          {cfg.discountsEnabled ? (
            <div className="grid gap-2">
              <Slider label="Photos" name="discount_max_photo" value={cfg.discMaxPhoto} onChange={(v) => set("discMaxPhoto", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Videos" name="discount_max_video" value={cfg.discMaxVideo} onChange={(v) => set("discMaxVideo", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Bundles" name="discount_max_bundle" value={cfg.discMaxBundle} onChange={(v) => set("discMaxBundle", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              <Slider label="Message packs" name="discount_max_credits" value={cfg.discMaxCredits} onChange={(v) => set("discMaxCredits", v)} min={0} max={90} step={5} format={(v) => `${v}%`} />
              {discountCapsAllZeroConflict && (
                <Warning text={discountCapsAllZeroConflict.text} detail={discountCapsAllZeroConflict.detail} />
              )}

              {/* Migration 095. These two groups were hardcoded constants in
                  star-pricing.ts until today and are the "advanced discount
                  dials" from Ronan's dump. They are DEPENDENT on the four caps
                  above, which is why they sit inside this card rather than in
                  a card of their own: on their own they mean nothing. */}
              <Warning
                className="mt-1"
                text="The two groups below scale the caps above. They can only ever make a discount smaller, never bigger."
                detail="The sum the bot actually runs is: cap x level x spend tier. So a 20% photo cap, Medium strength (67%) and a mid-spend fan (75%) gives 20 x 0.67 x 0.75 = 10% off. A discount can never exceed the cap you set above, and code hard-caps every discount at 90% and never sells anything below 1 star, whatever you type here."
              />

              <SubHead
                emoji={mode === "edit" ? "" : "🎚"}
                label="How hard each level bites"
                tip="She only ever picks a LEVEL (light, medium or max), never a number. This is what each of those levels is worth, as a share of the cap above. Defaults 34 / 67 / 100 are exactly what every creator ran on before these became editable."
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Slider label="Light" name="discount_level_light_pct" value={cfg.discLevelLight} onChange={(v) => set("discLevelLight", v)} min={1} max={100} step={1} format={(v) => `${v}%`} />
                <Slider label="Medium" name="discount_level_medium_pct" value={cfg.discLevelMedium} onChange={(v) => set("discLevelMedium", v)} min={1} max={100} step={1} format={(v) => `${v}%`} />
                <Slider label="Max" name="discount_level_max_pct" value={cfg.discLevelMax} onChange={(v) => set("discLevelMax", v)} min={1} max={100} step={1} format={(v) => `${v}%`} />
              </div>

              <SubHead
                emoji={mode === "edit" ? "" : "🐋"}
                label="How much a fan reaches, by what he has spent"
                tip="The whale ladder. A fan who has spent more gets closer to the full cap; a brand-new fan gets a smaller slice of it. 0 means that tier never gets a discount at all. Defaults 50 / 60 / 75 / 90 / 100 match the old hardcoded ladder."
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                <Slider label="New" name="discount_tier_share_none_pct" value={cfg.discTierNone} onChange={(v) => set("discTierNone", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
                <Slider label="Low" name="discount_tier_share_low_pct" value={cfg.discTierLow} onChange={(v) => set("discTierLow", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
                <Slider label="Mid" name="discount_tier_share_mid_pct" value={cfg.discTierMid} onChange={(v) => set("discTierMid", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
                <Slider label="High" name="discount_tier_share_high_pct" value={cfg.discTierHigh} onChange={(v) => set("discTierHigh", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
                <Slider label="Whale" name="discount_tier_share_whale_pct" value={cfg.discTierWhale} onChange={(v) => set("discTierWhale", v)} min={0} max={100} step={5} format={(v) => `${v}%`} />
              </div>
            </div>
          ) : (
            /* Same defect as the credit fields above: with discounts off these
               four did not render, posted nothing, and rowFromForm's num(...,0)
               fallback zeroed all four caps on save. Discounts are OFF BY
               DEFAULT on a fresh clone, so this fired on the common path - and
               a zeroed cap means "never discount that type", so re-enabling
               discounts later looked like discounts were simply broken.
               Mirroring cfg (not `clone`) keeps any edit made before the toggle
               was switched off. */
            <>
              <input type="hidden" name="discount_max_photo" value={cfg.discMaxPhoto} />
              <input type="hidden" name="discount_max_video" value={cfg.discMaxVideo} />
              <input type="hidden" name="discount_max_bundle" value={cfg.discMaxBundle} />
              <input type="hidden" name="discount_max_credits" value={cfg.discMaxCredits} />
              {/* Migration 095's eight dials live in the branch above, so they
                  need the same mirrors or they would reproduce the bug fixed
                  in 65c287e - a save with discounts off would reset them to
                  34/67/100 and 50/60/75/90/100. */}
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
          emoji={mode === "edit" ? "" : "🎯"}
          label="Offer follow-up"
          accent={mode === "edit" ? "neutral" : "amber"}
          hint="How many times she'll gently redirect a fan back to a locked, unpaid offer before she backs off and stops mentioning it. Bot-enforced setting."
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

        {/* ── Stop pitching after refusals (D7, migration 085) ─────────── */}
        {/* Was labelled "Decline brake" / "Decline cap" until 2026-08-18. The
            column stays offer_decline_cap; only the words an operator reads
            changed, because nobody could tell what a "brake" did from the name. */}
        <Collapse
          emoji={mode === "edit" ? "" : "🧊"}
          label="Stop pitching after refusals"
          accent={mode === "edit" ? "neutral" : "amber"}
          hint="How many times a fan has to plainly refuse to pay (e.g. 'i'm not paying', 'too expensive', 'send it free') before she stops OFFERING him paid photos, videos, bundles, tips and VIP. She keeps chatting warmly either way, and if he asks to buy himself after this trips, she still delivers. Any real purchase resets his count to 0. Bot-enforced setting."
        >
          <Slider
            label="Refusals before she backs off"
            name="offer_decline_cap"
            value={cfg.offerDeclineCap}
            onChange={(v) => set("offerDeclineCap", v)}
            min={1}
            max={10}
            step={1}
            format={(v) => `${v}×`}
          />
        </Collapse>

        {/* Migration 116, operator rule 2026-08-13, REMOVED FROM THE UI
            2026-08-18 on the operator's instruction: "remove the underage
            safety toggle from the UI, it should always be on (keep hard
            limits)".

            The strict minor gate is no longer an operator choice. It used to
            render here as a Strict/Standard ToggleCard, where "Standard" meant
            a stated age under 18 only counted in a sexual or romantic context
            and the safety AI, not code, made the call. There is no legitimate
            reason to run a clone that way, so the choice is gone rather than
            merely defaulted.

            This hidden input is NOT the usual mirror-the-stored-value pattern
            used elsewhere in this file — it is a hard PIN to "true". A control
            that does not render posts nothing, and rowFromForm reads
            `fd.get("strict_minor_gate") === "true"`, so posting nothing would
            write FALSE and silently disarm the gate on the first save. Pinning
            the literal instead means every save from this form re-arms it.
            strict_minor_gate was also removed from CLONE_TOGGLE_FIELDS
            (app/clones/toggle-fields.ts) so neither setCloneToggle nor the /ai
            assistant can flip it off through the generic toggle path, exactly
            as subscriptions_enabled is fenced off there.

            The hard limits themselves are untouched: the block, the fixed
            reply, the permanent lockout and the Users-page flag all live in the
            bot and behave exactly as before. */}
        <input type="hidden" name="strict_minor_gate" value="true" />

        {/* Migration 097. The combined realism-effects switch plus the 3
            router keyword lists share a card because both are "how she reads
            and reacts mechanically", not money and not pacing. Approved
            2026-07-31 off coord/ADVANCED-DIAL-CANDIDATES.txt. */}
        <Section
          icon={mode === "edit" ? undefined : "🎭"}
          accent={mode === "edit" ? "neutral" : "purple"}
          title="Realism & routing"
          hint="Reactions/message effects on or off, and the keyword lists the router matches on for photo/voice/tease requests."
        >
          <ToggleCard
            emoji={mode === "edit" ? "" : "✨"}
            label={cfg.realismEffectsEnabled ? "Reactions & message effects on" : "Reactions & message effects off"}
            title="One switch for BOTH emoji reactions and Telegram message effects (fire/heart) together, not a per-emoji picker: Telegram only accepts a fixed set of reaction emoji, so this is deliberately a single on/off."
            name="realism_effects_enabled"
            checked={cfg.realismEffectsEnabled}
            onChange={(v) => set("realismEffectsEnabled", v)}
          />
          <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-3">
            <Field
              label="Photo/media request keywords"
              name="media_keywords"
              defaultValue={clone?.media_keywords ?? ""}
              placeholder="e.g. pic, photo, selfie"
              hint="Comma-separated. In addition to a fixed set of phrase patterns that aren't editable here, these are extra words the router matches to route a message to a photo/media reply."
            />
            <Field
              label="Voice message request keywords"
              name="voice_keywords"
              defaultValue={clone?.voice_keywords ?? ""}
              placeholder="e.g. voice note, hear you, say it"
              hint="Comma-separated. Same rule as the photo list: additive to a fixed, non-editable remainder."
            />
            <Field
              label="Tease/continuation keywords"
              name="tease_keywords"
              defaultValue={clone?.tease_keywords ?? ""}
              placeholder="e.g. more, keep going, continue"
              hint="Comma-separated. Same rule as the other two lists: additive to a fixed, non-editable remainder."
            />
          </div>
          {/* Migration 099. Frequency dials for the same two mechanics the
              master switch above turns on/off entirely: how OFTEN, not
              whether. */}
          <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-2">
            <Slider
              label="Ambient reaction chance"
              name="reaction_ambient_chance_pct"
              value={cfg.reactionAmbientChancePct}
              onChange={(v) => set("reactionAmbientChancePct", v)}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v}%`}
              hint="How often she drops a reaction emoji on an ordinary message, not just hot/flirty ones. Meaningless while reactions & message effects above is off. Default 10%."
            />
            <Slider
              label="Message-effect chance"
              name="message_effect_chance_pct"
              value={cfg.messageEffectChancePct}
              onChange={(v) => set("messageEffectChancePct", v)}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v}%`}
              hint="How often a hot/flirty line gets an animated Telegram message effect (fire/heart). Meaningless while reactions & message effects above is off. Default 25%."
            />
          </div>
        </Section>

        {/* Migration 099. Priority-fan reply speed, the gap-awareness fire
            threshold, the spend-tier thresholds that decide who counts as a
            whale, and the spoil-context lookback window all share one card:
            each is a threshold that gates some OTHER piece of behavior,
            distinct from the pacing/retry mechanics above and the money
            ceilings in Money guardrails. */}
        <Section
          icon={mode === "edit" ? undefined : "🎯"}
          accent={mode === "edit" ? "neutral" : "blue"}
          title="Timing & thresholds"
          hint="Priority-fan reply speed, the gap-awareness trigger, spend-tier cutoffs, and how far back the spoil-context window looks."
        >
          <Slider
            label="Priority VIP speed (% of normal wait)"
            name="priority_wait_factor_pct"
            value={cfg.priorityWaitFactorPct}
            onChange={(v) => set("priorityWaitFactorPct", v)}
            min={1}
            max={100}
            step={5}
            format={(v) => `${v}%`}
            hint="Priority/VIP fans wait this percentage of the normal reply delay before she replies. Lower means faster replies for them. Default 35%."
          />
          <div className="border-t border-line pt-2">
            <Field
              label="Gap-awareness threshold (hours)"
              name="gap_nudge_threshold_hours"
              type="number"
              min={1}
              step={1}
              defaultValue={clone?.gap_nudge_threshold_hours ?? 6}
              hint="How long since the fan's last message before the 'it's been a while' gap-awareness line is allowed to fire. Default 6 hours."
            />
          </div>
          <div className="border-t border-line pt-2">
            <FieldLabel
              label="Spend-tier thresholds (Stars)"
              hint="Total lifetime Stars spent that bump a fan up to the next spend tier, used for discount-tier and pacing decisions elsewhere. Must stay strictly descending: whale > high > mid. Defaults 1000 / 300 / 50."
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Slider
                label="Whale"
                name="spend_tier_whale_stars"
                value={cfg.spendTierWhaleStars}
                onChange={(v) => set("spendTierWhaleStars", v)}
                min={1}
                max={10000}
                step={10}
                format={(v) => `${v}⭐`}
              />
              <Slider
                label="High"
                name="spend_tier_high_stars"
                value={cfg.spendTierHighStars}
                onChange={(v) => set("spendTierHighStars", v)}
                min={1}
                max={10000}
                step={10}
                format={(v) => `${v}⭐`}
              />
              <Slider
                label="Mid"
                name="spend_tier_mid_stars"
                value={cfg.spendTierMidStars}
                onChange={(v) => set("spendTierMidStars", v)}
                min={1}
                max={10000}
                step={5}
                format={(v) => `${v}⭐`}
              />
            </div>
            {spendTierConflict && (
              <div className="mt-1.5">
                <Warning text={spendTierConflict.text} detail={spendTierConflict.detail} />
              </div>
            )}
            <div className="mt-1.5">
              <Warning
                text="This dial does not take effect yet. Every fan's actual spend tier is still computed by a fixed database rule (1000/300/50 Stars), which cannot read this creator's thresholds."
                detail="The spend tier is a Postgres GENERATED column, and a generated column can only reference other fields on the same row, never a related table. Moving these sliders saves cleanly and looks live, but has no effect until that column is converted to a regular column set by application code or a trigger. Known gap, tracked as follow-up work, not deployed."
              />
            </div>
          </div>
          <div className="border-t border-line pt-2">
            <Field
              label="Spoil-context lookback (messages)"
              name="spoil_context_lookback_messages"
              type="number"
              min={1}
              step={1}
              defaultValue={clone?.spoil_context_lookback_messages ?? 6}
              hint="How many recent messages the spoil-context window looks back over when deciding what she can reference. Default 6."
            />
          </div>
        </Section>

        {/* Migration 098 + 099. The strict-onboarding gate and the numeric
            onboarding tuning dials share a card: all four numbers only matter
            while the fan is still inside the onboarding step engine, same as
            the gate toggle above them. */}
        <Section
          icon={mode === "edit" ? undefined : "🎓"}
          accent={mode === "edit" ? "neutral" : "green"}
          title="Onboarding tuning"
          hint="How strictly she stays on-script during onboarding, and the message/attempt caps the step engine runs on."
        >
          {/* No dial-conflict warning here on purpose: the one genuinely
              surprising interaction (an early welcome_bundle_after /
              onboarding_voice_after expecting photos fast, while this gate
              blocks them until the step engine reaches a photo-appropriate
              step) depends on fields owned by the Campaigns page, not this
              tab's cfg state, so there is no live value here to check
              against. photos_enabled being off is harmless redundancy, not
              a surprise, so that case deliberately does not warn either. */}
          <ToggleCard
            emoji={mode === "edit" ? "" : "📜"}
            label={cfg.strictOnboardingSteps ? "Strict onboarding steps on" : "Strict onboarding steps off"}
            title="When on, blocks BOTH self-initiated and fan-requested photo/video/bundle/tip/vip actions while the fan's current onboarding step is a text/voice step, keeping her on-script until onboarding reaches a photo-appropriate step. Off (default) is today's unchanged behavior: a fan who asks for media himself always gets through."
            name="strict_onboarding_steps"
            checked={cfg.strictOnboardingSteps}
            onChange={(v) => set("strictOnboardingSteps", v)}
          />
          <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-3">
            <Field
              label="Onboarding message cap"
              name="onboarding_max_messages"
              type="number"
              min={1}
              step={1}
              defaultValue={clone?.onboarding_max_messages ?? 30}
              hint="Hard ceiling on onboarding messages before the free onboarding phase force-ends. Default 30."
            />
            <Field
              label="Step retry limit"
              name="onboarding_step_max_attempts"
              type="number"
              min={1}
              step={1}
              defaultValue={clone?.onboarding_step_max_attempts ?? 3}
              hint="How many times a single onboarding step may retry before the engine gives up on it and moves on. Default 3."
            />
            <Field
              label="Condition window (messages)"
              name="onboarding_condition_window_messages"
              type="number"
              min={1}
              step={1}
              defaultValue={clone?.onboarding_condition_window_messages ?? 10}
              hint="Message window an onboarding step's 'if' condition is evaluated against. Default 10."
            />
          </div>
          <div className="border-t border-line pt-2">
            <FieldLabel
              label="Fan-profile extraction cadence"
              hint="When the profile extractor first runs on a new fan, then how often after that. Defaults 3 / 10 messages."
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="First extraction at (messages)"
                name="profile_extract_first_at_messages"
                type="number"
                min={1}
                step={1}
                defaultValue={clone?.profile_extract_first_at_messages ?? 3}
              />
              <Field
                label="Then every N messages"
                name="profile_extract_every_n_messages"
                type="number"
                min={1}
                step={1}
                defaultValue={clone?.profile_extract_every_n_messages ?? 10}
              />
            </div>
          </div>
        </Section>
      </div>

      {/* ── MONETIZATION - sections live in MonetizationSections (end of
          file) so edit mode can host them under the page-level Monetization
          tab instead, inside the same <form>. Create mode keeps them here. */}
      {showMoney && (
        <div className={show("money")}>
          <MonetizationSections cfg={cfg} set={set} clone={clone} photos={photos} videos={videos} bundles={bundles} editMode={mode === "edit"} />
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
  editMode = false,
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
  editMode?: boolean;
}) {
  return (
    <div className={editMode ? "contents [&>section]:rounded-[4px] [&>section]:border-l [&>section]:shadow-none [&>div]:rounded-[4px] [&>div]:border-l [&_button]:rounded-[3px] [&_input]:rounded-[3px] [&_select]:rounded-[3px] [&_textarea]:rounded-[3px] [&_.clone-segmented]:rounded-[3px] [&_.clone-segmented>button]:rounded-[2px]" : "contents"}>
      {/* ── 💬 Credits & paywall ─────────────────────────────────── */}
      <Section
        icon={editMode ? undefined : "💬"}
        accent={editMode ? "neutral" : "green"}
        title="Credits & paywall"
        className="xl:col-span-3"
        hint="Telegram Stars. Credits = messages."
      >
        {/* Charge toggle and the three price fields on one row instead of four
            stacked rows. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Toggle label={cfg.charge ? "Charge for messages" : "Messages are free"} name="charge_messages" checked={cfg.charge} onChange={(v) => set("charge", v)} accent="soft" />
          {cfg.charge ? (
            <>
              <Field label="Starting credits" name="starting_credits" type="number" defaultValue={clone?.starting_credits ?? 50} />
              <Field label="Pack size" name="credit_pack_size" type="number" defaultValue={clone?.credit_pack_size ?? 50} />
              <Field label="Pack price" name="credit_pack_price_stars" type="number" defaultValue={clone?.credit_pack_price_stars ?? 199} />
            </>
          ) : (
            /* MONEY. These three used to simply not render with charging off,
               and a control that does not render POSTS NOTHING - so
               rowFromForm's num() fallbacks (50 / 50 / 199) were written to the
               row on every save made with charging off. cat-chase's pack really
               costs 1 star, so that was a silent 1 -> 199 repricing of a live
               clone, invisible in the UI because the field was hidden at the
               moment it was rewritten. Mirror the STORED values instead. Same
               fix as paywall_prime_as_voice and emoji_allowlist already use. */
            <>
              <input type="hidden" name="starting_credits" value={clone?.starting_credits ?? 50} />
              <input type="hidden" name="credit_pack_size" value={clone?.credit_pack_size ?? 50} />
              <input type="hidden" name="credit_pack_price_stars" value={clone?.credit_pack_price_stars ?? 199} />
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
            options={controlOptions(SEG.priceGuard, editMode)}
            accent="accent"
            hint="Every price on a Pay button is computed in code and is always correct. This is about the prices she TYPES in chat. On 2026-07-31 she was measured telling a fan photos 'start at 1000 stars' when they are 40 to 90, and quoting a video price for a creator with no videos. Telling her not to, in her prompt, did not work. This is the code check that does. Leave it on Block. Hover a step to see exactly what each one does."
          />
        </div>
        <div className="border-t border-line pt-2">
          <SubHead
            emoji={editMode ? "" : "🚧"}
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
              {/* Prefilled, not blank. Until 2026-08-18 this box rendered
                  EMPTY and its hint said blank meant "she decides freely" —
                  untrue. The bot silently fell back to
                  DEFAULT_PAYWALL_INSTRUCTION (bot/src/handler.ts), so the most
                  important line in the product was one an operator could not
                  read or change. */}
              <Area
                label="Paywall steer"
                name="paywall_instruction"
                rows={2}
                defaultValue={clone?.paywall_instruction ?? DEFAULT_PAYWALL_STEER}
                hint="Steers her first out-of-credits line — the one that decides whether he tops up. Edit it freely. Emptying it does NOT mean she improvises: the bot falls back to its own built-in steer."
              />
            </div>
          </div>
        </div>

        {/* ── Warmup before the wall (pre-lock prime, migration 069) ──────── */}
        <div className="border-t border-line pt-2">
          <SubHead
            emoji={editMode ? "" : "🔥"}
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
          {/* Same reason as paywall_prime_as_voice on the line above, which
              already had this fix: with the warmup off these two did not render
              and Save wrote num(...,3) and null over the stored values, quietly
              discarding an operator-written steer. */}
          {!cfg.paywallPrimeEnabled && (
            <>
              <input type="hidden" name="paywall_prime_before" value={cfg.paywallPrimeBefore} />
              <input type="hidden" name="paywall_prime_instruction" value={clone?.paywall_prime_instruction ?? ""} />
            </>
          )}
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
                  defaultValue={clone?.paywall_prime_instruction ?? DEFAULT_PAYWALL_PRIME_STEER}
                  hint="Steers the warmup line she works in before he runs out. Emptying it does NOT turn the steer off — the bot falls back to its own built-in one."
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Pick up after they pay (post-lock resume, migration 069) ────── */}
        <div className="border-t border-line pt-2">
          <SubHead
            emoji={editMode ? "" : "💝"}
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
          {/* Same fix again. Note paywall_resume_media_id ALREADY had a hidden
              input, but it lived INSIDE this conditional, so it was dropped
              along with everything else when the pickup was switched off. */}
          {!cfg.paywallResumeEnabled && (
            <>
              <input type="hidden" name="paywall_resume_instruction" value={clone?.paywall_resume_instruction ?? ""} />
              <input type="hidden" name="paywall_resume_media_id" value={cfg.paywallResumeMediaId ?? ""} />
            </>
          )}
          {cfg.paywallResumeEnabled && (
            <div className="mt-2 grid grid-cols-1 items-start gap-2 xl:grid-cols-2">
              <div className="xl:col-span-2">
                <Area
                  label="Pickup steer"
                  name="paywall_resume_instruction"
                  rows={2}
                  defaultValue={clone?.paywall_resume_instruction ?? DEFAULT_PAYWALL_RESUME_STEER}
                  hint="Steers the line she sends the moment he tops up. Emptying it does NOT mean she improvises — the bot falls back to its own built-in steer."
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
        emoji={editMode ? "" : "🎁"}
        label="Tips"
        accent={editMode ? "neutral" : "amber"}
        filled={cfg.tips}
        hint={cfg.engineV2 ? V2_TIPS_SECTION_HINT : "She can ask to be spoiled with Stars. Always recorded as tip revenue. It can also give him message credits back, at the rate you set below, which is off until you set it. The spoil menu is what he sees when he wants to tip but names no amount."}
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
          label={cfg.engineV2 ? V2_TIP_CREDITS_LABEL : "Credits per 100 stars tipped"}
          name="tip_credits_per_100_stars"
          type="number"
          min={0}
          step={1}
          defaultValue={clone?.tip_credits_per_100_stars ?? 0}
          hint={(cfg.engineV2 ? V2_TIP_CREDITS_HINT_PREFIX : "") + "What a tip gives him back in message credits. 0 means a tip gives no credits, which is the default and what every creator did before this field existed. At 5, a 1000 star tip gives him 50 messages. The amount is always computed from this number, never decided by the AI, and it is rounded DOWN so a tip too small to earn a credit earns none. This is deliberately NOT tied to your pack price: it is a separate rate you control."}
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
          hint="After she has shown him a tip button or the spoil menu, how long she stays off the subject before she is allowed to show one again. Leave blank for the default of 180 seconds, which is what every creator ran on before this field existed. Lower means she circles back to being tipped sooner. A fresh, explicit offer from him always goes through immediately, whatever this says."
        />
        <div className="block">
          <FieldLabel
            label={editMode ? "May ask again right after a tip" : "🎁 May ask again right after a tip"}
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
        emoji={editMode ? "" : "💌"}
        label="Extras"
        accent={editMode ? "neutral" : "cyan"}
        filled={cfg.thankYou}
        hint="Automatic follow-ups after money changes hands."
      >
        <ToggleCard
          emoji={editMode ? "" : "💌"}
          label="Auto thank-you"
          title="She sends a thank-you after any purchase or gift"
          name="thank_you_enabled"
          checked={cfg.thankYou}
          onChange={(v) => set("thankYou", v)}
        />
      </Collapse>

    </div>
  );
}

