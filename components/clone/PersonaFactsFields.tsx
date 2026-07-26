"use client";

import { useState } from "react";
import type { Clone, SocialRow } from "@/lib/types";
import { Area, Collapse, Field, FieldLabel, Segmented, SubHead, TagInput, Toggle, MultiSelect, inputCls, selectCls } from "./fields";
import { VIBE_PRESETS } from "@/lib/vibes";
import type { CloneConfigState, SetConfig } from "./useCloneConfig";

// Imperfection-profile dial options (migration 042) — same pattern as the SEG
// constant in ConfigSections.tsx: short on-pill labels, the fuller
// explanation moved into each option's hover title.
const IMPERFECTION_SEG = {
  lowercase: [
    { value: "never" as const, label: "Never", title: "Capitalizes normally, no lowercase quirk" },
    { value: "sometimes" as const, label: "Sometimes", title: "Occasionally drops into all-lowercase, usually still capitalizes" },
    { value: "often" as const, label: "Often", title: "Mostly lowercase, capitals are rare" },
    { value: "always" as const, label: "Always", title: "Always full lowercase, never capitalizes anything" },
  ],
  punctuation: [
    { value: "never" as const, label: "Never", title: "Always ends texts with normal punctuation" },
    { value: "sometimes" as const, label: "Sometimes", title: "Occasionally leaves off the end period" },
    { value: "often" as const, label: "Often", title: "Usually skips end punctuation" },
    { value: "always" as const, label: "Always", title: "Never uses end punctuation, ever" },
  ],
  typo: [
    { value: "never" as const, label: "Never", title: "No typos" },
    { value: "sometimes" as const, label: "Sometimes", title: "Very occasional small typo, uncorrected" },
    { value: "often" as const, label: "Often", title: "Fairly frequent small typos, rarely corrected" },
    { value: "always" as const, label: "Always", title: "Typos in almost every message, almost never corrected" },
  ],
  doubleText: [
    { value: "never" as const, label: "Never", title: "Always one longer message" },
    { value: "sometimes" as const, label: "Sometimes", title: "Occasionally sends a quick second message right after" },
    { value: "often" as const, label: "Often", title: "Regularly splits thoughts into two or three quick messages" },
    { value: "always" as const, label: "Always", title: "Almost always fires off a burst of short messages back to back" },
  ],
};

// ── Structured persona facts (migrations 033 + 039) ───────────────────────────
// The typed widgets that replaced the retired free-text intake questions. Every
// value here is injected into her prompt DETERMINISTICALLY in code (never via
// the AI compiler), so facts can't drift, get dropped, or go stale.
// Submits into the same clone form: plain inputs by column name + hidden JSON
// inputs for the list fields, gated by the `persona_facts` marker (actions.ts).
//
// Presentation: every card is a Collapse (condensed 2026-07-26 pass) so the tab
// scans as a short list of headers instead of a wall of fields. The 3 sections
// an operator touches on every clone (Who she is, Physical canon, Vibe &
// nicknames) default open; the rest default closed with a filled/empty dot and
// a one-line summary so you can tell what's set without opening it.

const GENDER_OPTIONS = ["female", "male", "trans woman", "non-binary"];
const SEXUALITY_OPTIONS = ["straight", "bisexual", "bicurious", "lesbian", "pansexual"];

export const HARD_LIMIT_OPTIONS: string[] = [
  "anal",
  "feet",
  "degrading him",
  "being degraded",
  "dom/sub play",
  "roleplay scenarios",
  "rough / choking talk",
  "group / threesome talk",
  "watersports",
  "cheating / cuckold talk",
];

const SOCIAL_PLATFORMS = ["instagram", "tiktok", "x/twitter", "onlyfans", "snapchat", "youtube", "other"];

// ── Identity canon (migration 039) option lists ───────────────────────────────
const NAME_SHARED_OPTIONS = [
  { value: "stage", label: "Stage name only" },
  { value: "real", label: "Real name only" },
  { value: "both", label: "Both" },
];

export const CREATOR_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "of_creator", label: "OnlyFans creator" },
  { value: "influencer", label: "Influencer" },
  { value: "adult_performer", label: "Adult performer" },
  { value: "model", label: "Model" },
  { value: "cam_girl", label: "Cam girl" },
  { value: "fitness_model", label: "Fitness model" },
];

export const PLATFORM_OPTIONS: string[] = ["OnlyFans", "Fansly", "Instagram", "TikTok", "X", "Reddit"];

// Common heritage tags, chips + a free "other" box below (mixed heritage is
// the norm in this vertical, a single text box forced a bad answer).
export const ETHNICITY_TAG_OPTIONS: string[] = [
  "White / Caucasian",
  "Black / African",
  "Latina / Hispanic",
  "East Asian",
  "South Asian",
  "Middle Eastern",
  "Native American",
  "Pacific Islander",
];

// ft/in + cm together so an operator never has to convert by hand.
export const HEIGHT_OPTIONS: string[] = [
  "4'10 (147cm)", "4'11 (150cm)", "5'0 (152cm)", "5'1 (155cm)", "5'2 (157cm)",
  "5'3 (160cm)", "5'4 (163cm)", "5'5 (165cm)", "5'6 (168cm)", "5'7 (170cm)",
  "5'8 (173cm)", "5'9 (175cm)", "5'10 (178cm)", "5'11 (180cm)", "6'0 (183cm)",
  "6'1 (185cm)", "6'2 (188cm)",
];

const HAIR_COLOR_OPTIONS = ["blonde", "brunette", "black", "red", "auburn", "dyed / colorful", "grey / silver"];
const HAIR_LENGTH_OPTIONS = ["short", "shoulder-length", "long", "very long"];
const EYE_COLOR_OPTIONS = ["brown", "blue", "green", "hazel", "grey"];
export const BODY_TYPE_OPTIONS = ["petite", "slim", "athletic", "curvy", "thick", "bbw"];
const CUP_SIZE_OPTIONS = ["A", "B", "C", "D", "DD/E", "F+"];
const ENHANCEMENTS_OPTIONS = [
  { value: "natural", label: "Natural" },
  { value: "augmented", label: "Augmented" },
  { value: "prefers_not_to_say", label: "Prefers not to say" },
];
const VOICE_ACCENT_OPTIONS = [
  "American", "British", "Australian", "Irish", "Canadian", "Eastern European", "Latin American", "Asian", "French", "neutral / no strong accent",
];
const VOICE_PACE_OPTIONS = ["slow", "moderate", "fast", "varies"];
const VOICE_TEXTURE_OPTIONS = ["soft", "raspy", "breathy", "husky", "bright", "deep"];

const MEETING_POLICY_OPTIONS = [
  { value: "hard_no", label: "Hard no" },
  { value: "soft_deflect", label: "Soft deflect" },
  { value: "playful_maybe", label: "Playful maybe" },
];
const LOVE_POLICY_OPTIONS = [
  { value: "says_it_back", label: "Says it back" },
  { value: "deflects_warmly", label: "Deflects warmly" },
  { value: "playful_dodge", label: "Playful dodge" },
];
const RELATIONSHIP_CANON_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "taken", label: "Taken" },
  { value: "complicated", label: "Complicated" },
  { value: "wont_say", label: "Won't say" },
];
const REACTION_RUDE_OPTIONS = [
  { value: "goes_quiet", label: "Goes quiet" },
  { value: "claps_back", label: "Claps back" },
  { value: "playful_scold", label: "Playful scold" },
];
const REACTION_COMPLIMENT_OPTIONS = [
  { value: "deflects", label: "Deflects" },
  { value: "teases", label: "Teases" },
  { value: "accepts_warmly", label: "Accepts warmly" },
];
const BURST_STYLE_OPTIONS = [
  { value: "one_long", label: "One longer message" },
  { value: "short_bursts", label: "A few short bursts" },
];

export const CONTENT_DONE_OPTIONS: string[] = [
  "solo",
  "toys",
  "boy/girl",
  "girl/girl",
  "anal",
  "squirting",
  "cosplay / roleplay",
  "feet content",
  "livestreams",
];
export const CONTENT_HARD_NO_OPTIONS: string[] = [
  "anal",
  "watersports",
  "feet content",
  "boy/girl (partner) scenes",
  "group / gangbang scenes",
  "fisting",
  "food play",
  "public / outdoor content",
];

function splitLegacyList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Controlled boolean toggle (Toggle needs local state to be uncontrolled-form-friendly) ──
function Bool({ name, label, initial, hint }: { name: string; label: string; initial: boolean; hint?: string }) {
  const [checked, setChecked] = useState(initial);
  return <Toggle label={label} name={name} checked={checked} onChange={setChecked} hint={hint} />;
}

// ── Daily-blocks editor (time + activity rows, hidden JSON) ───────────────────
function DailyBlocksEditor({ initial }: { initial: { time: string; activity: string }[] }) {
  const [rows, setRows] = useState<{ time: string; activity: string }[]>(initial);
  const set = (i: number, patch: Partial<{ time: string; activity: string }>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-2">
      <input
        type="hidden"
        name="daily_blocks"
        value={JSON.stringify(rows.filter((r) => r.activity.trim()))}
      />
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            value={r.time}
            onChange={(e) => set(i, { time: e.target.value })}
            className={inputCls + " max-w-28"}
          />
          <input
            value={r.activity}
            onChange={(e) => set(i, { activity: e.target.value })}
            placeholder="gym, content shoot, dinner..."
            className={inputCls}
          />
          <button
            type="button"
            aria-label="remove row"
            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
            className="shrink-0 text-muted transition hover:text-crit"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { time: "", activity: "" }])}
        className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
      >
        + Add block
      </button>
    </div>
  );
}

// ── Socials editor (platform + handle + followers rows, hidden JSON) ──────────
function SocialsEditor({ initial }: { initial: SocialRow[] }) {
  const [rows, setRows] = useState<SocialRow[]>(initial);
  const set = (i: number, patch: Partial<SocialRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-2">
      <input type="hidden" name="socials" value={JSON.stringify(rows.filter((r) => r.handle.trim()))} />
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={r.platform}
            onChange={(e) => set(i, { platform: e.target.value })}
            className={selectCls + " max-w-36"}
          >
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {!SOCIAL_PLATFORMS.includes(r.platform) && r.platform && <option value={r.platform}>{r.platform}</option>}
          </select>
          <input
            value={r.handle}
            onChange={(e) => set(i, { handle: e.target.value })}
            placeholder="@handle"
            className={inputCls}
          />
          <input
            value={r.followers ?? ""}
            onChange={(e) => set(i, { followers: e.target.value })}
            placeholder="followers (2M)"
            className={inputCls + " max-w-32"}
          />
          <button
            type="button"
            aria-label="remove row"
            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
            className="shrink-0 text-muted transition hover:text-crit"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { platform: "instagram", handle: "", followers: "" }])}
        className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
      >
        + Add social
      </button>
    </div>
  );
}

// ── Hard-limits checklist ──────────────────────────────────────────────────────
function HardLimits({ initial, extraInitial }: { initial: string[]; extraInitial: string }) {
  const [checked, setChecked] = useState<string[]>(initial);
  const toggle = (v: string) =>
    setChecked((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  // Legacy/free values that aren't in the fixed list still round-trip as chips.
  const custom = checked.filter((c) => !HARD_LIMIT_OPTIONS.includes(c));
  const summary =
    checked.length === 0 ? "none set" : checked.length <= 3 ? checked.join(", ") : `${checked.length} set`;

  return (
    <Collapse
      emoji="⛔"
      label="Hard limits"
      accent="red"
      summary={summary}
      filled={checked.length > 0}
      hint="Chat topics she'll never engage with. A deliberate, always-visible safety checklist, separate from Content canon (what she'll film) below."
    >
      <div className="grid gap-2">
        <input type="hidden" name="hard_limits" value={JSON.stringify(checked)} />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {HARD_LIMIT_OPTIONS.map((o) => {
            const on = checked.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(o)}
                className={
                  "rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition " +
                  (on ? "border-crit/50 bg-crit/10 text-crit" : "border-line bg-bg/40 text-muted hover:text-ink")
                }
              >
                {on ? "⛔ " : ""}
                {o}
              </button>
            );
          })}
        </div>
        {custom.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {custom.map((c) => (
              <span key={c} className="flex items-center gap-1 rounded-full bg-crit/10 px-2 py-0.5 text-xs text-crit">
                {c}
                <button type="button" onClick={() => toggle(c)} className="text-crit/70 hover:text-crit">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <Field
          label="Other limits"
          name="hard_limits_extra"
          defaultValue={extraInitial}
          placeholder="topics, words, or acts she will never do"
        />
      </div>
    </Collapse>
  );
}

// ── The whole facts panel ─────────────────────────────────────────────────────
export default function PersonaFactsFields({
  clone,
  legacyFields,
  part = "all",
  cfg,
  set,
}: {
  clone?: Partial<Clone> | null;
  legacyFields?: Record<string, string> | null;
  // Only the "imperfection" part reads these — the four level dials are
  // controlled state (same Level pattern as sexualLevel/nsfwLevel/etc in
  // Config) so the Segmented control here follows the exact pattern used
  // throughout ConfigSections.tsx. Every other part ignores them.
  cfg: CloneConfigState;
  set: SetConfig;
  // Split so the Identity tab can compose balanced columns by hand:
  //   "who"          = the Who-she-is fact grid
  //   "creator"      = Creator identity (migration 039)
  //   "physical"     = Physical + voice canon (migration 039)
  //   "socials"      = the Socials editor
  //   "vibe"         = Vibe & nicknames (+ reaction/texting-rhythm selects)
  //   "behaviour"    = Behaviour policy (migration 039)
  //   "rhythm"       = Daily rhythm (migration 039)
  //   "content"      = Content canon (migration 039)
  //   "imperfection" = Imperfection profile intensity dials (migrations 039 + 042)
  //   "limits"       = the hard-limits collapse
  part?:
    | "who"
    | "creator"
    | "physical"
    | "socials"
    | "vibe"
    | "behaviour"
    | "rhythm"
    | "content"
    | "imperfection"
    | "limits"
    | "all";
}) {
  const legacy = legacyFields ?? {};
  // Legacy intake values backfill the widgets when the columns are still empty,
  // so an old clone's facts migrate on its next Save.
  const vibeInitial =
    clone?.vibe_preset ?? (legacy.vibe === "your-own" ? "custom" : legacy.vibe) ?? "";
  const nicknamesInitial = clone?.fan_nicknames?.length ? clone.fan_nicknames : splitLegacyList(legacy.nicknames);
  const turnOnsInitial = clone?.turn_ons?.length ? clone.turn_ons : splitLegacyList(legacy.turn_ons);
  const turnOffsInitial = clone?.turn_offs?.length ? clone.turn_offs : splitLegacyList(legacy.turn_offs);
  const hardLimitsExtraInitial = clone?.hard_limits_extra ?? legacy.hard_limits ?? "";
  // occupation (migration 033) is retired: its old value carries forward once
  // into cover_story so nothing is lost, then the column is never written again.
  const coverStoryInitial = clone?.cover_story ?? clone?.occupation ?? legacy.occupation ?? "";
  // ethnicity (migration 033, single free-text) is retired the same way: its
  // value prefills ethnicity_other until the operator saves the new fields.
  const ethnicityOtherInitial = clone?.ethnicity_other ?? clone?.ethnicity ?? "";
  const ethnicityTagsInitial = clone?.ethnicity_tags?.length ? clone.ethnicity_tags : [];

  const showWho = part === "who" || part === "all";
  const showCreator = part === "creator" || part === "all";
  const showPhysical = part === "physical" || part === "all";
  const showSocials = part === "socials" || part === "all";
  const showVibe = part === "vibe" || part === "all";
  const showBehaviour = part === "behaviour" || part === "all";
  const showRhythm = part === "rhythm" || part === "all";
  const showContent = part === "content" || part === "all";
  const showImperfection = part === "imperfection" || part === "all";
  const showLimits = part === "limits" || part === "all";

  // Which cards have anything set — drives the collapsed-header filled dot.
  const whoFilled = Boolean(
    clone?.height || clone?.sexuality || clone?.hometown || clone?.current_city ||
    clone?.stage_name || clone?.real_name || ethnicityTagsInitial.length || ethnicityOtherInitial,
  );
  const creatorFilled = Boolean(
    clone?.creator_type || clone?.career_start_year || coverStoryInitial ||
    clone?.known_for || clone?.career_history || clone?.platforms?.length,
  );
  const physicalFilled = Boolean(
    clone?.hair_length || clone?.hair_color || clone?.eye_color || clone?.body_type ||
    clone?.cup_size || clone?.measurements || clone?.tattoos || clone?.piercings ||
    clone?.enhancements || clone?.voice_accent || clone?.voice_pace || clone?.voice_texture,
  );
  const socialsFilled = Boolean(clone?.socials?.length);
  const vibeFilled = Boolean(
    vibeInitial || nicknamesInitial.length || turnOnsInitial.length || turnOffsInitial.length ||
    clone?.reaction_to_rudeness || clone?.reaction_to_compliments || clone?.burst_style,
  );
  const behaviourFilled = Boolean(clone?.relationship_canon || clone?.meeting_policy || clone?.love_policy);
  const rhythmFilled = Boolean(clone?.wake_time || clone?.sleep_time || clone?.daily_blocks?.length);
  const contentFilled = Boolean(clone?.content_done?.length || clone?.content_hard_nos?.length);
  const imperfectionFilled =
    cfg.lowercaseLevel !== "never" ||
    cfg.punctuationDropLevel !== "never" ||
    cfg.typoLevel !== "never" ||
    cfg.doubleTextLevel !== "never";

  return (
    <>
      {/* Marker: tells the save action the typed widgets were on this form.
          Only the facts pass renders it, so it is never duplicated. */}
      {showWho && <input type="hidden" name="persona_facts" value="1" />}

      {showWho && (
      <Collapse
        emoji="🪪"
        label="Who she is"
        accent="cyan"
        defaultOpen
        filled={whoFilled}
        hint="Typed facts, injected into her prompt exactly as written (never through the AI), so they can't drift or go stale."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {/* Name lives here rather than in its own card - one input never
              justified a whole section at the top of the tab. */}
          <Field label="Name" name="name" required defaultValue={clone?.name ?? ""} placeholder="e.g. Sophie" />
          <Field
            label="Birthday"
            name="date_of_birth"
            type="date"
            defaultValue={clone?.date_of_birth ?? ""}
            hint="Her age is derived live, plus birthday awareness"
          />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Gender</span>
            <select name="gender" defaultValue={clone?.gender ?? "female"} className={selectCls}>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <FieldLabel label="Height" hint="ft/in shown with cm so nobody has to convert by hand" />
            <select name="height" defaultValue={clone?.height ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {HEIGHT_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Sexuality</span>
            <select name="sexuality" defaultValue={clone?.sexuality ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {SEXUALITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Field label="Hometown" name="hometown" defaultValue={clone?.hometown ?? ""} placeholder="Melbourne" />
          <Field
            label="Current city"
            name="current_city"
            defaultValue={clone?.current_city ?? ""}
            placeholder="Miami"
            hint="Cross-check her Timezone in Config matches this city, or she talks the wrong time of day"
          />
          <Field label="Stage name" name="stage_name" defaultValue={clone?.stage_name ?? ""} placeholder="e.g. Sophie Rae" />
          <Field
            label="Real name"
            name="real_name"
            defaultValue={clone?.real_name ?? ""}
            placeholder="only if fans ever hear it"
            hint="Only if fans ever hear it. Kept blurred here since it's sensitive."
            secret
          />
          <label className="block">
            <FieldLabel label="Name shared" hint="Controls whether her real name is ever allowed into a fan-facing prompt" />
            <select name="name_shared_with_fans" defaultValue={clone?.name_shared_with_fans ?? "stage"} className={selectCls}>
              {NAME_SHARED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <MultiSelect
            label="Heritage"
            name="ethnicity_tags"
            options={ETHNICITY_TAG_OPTIONS}
            initial={ethnicityTagsInitial}
            hint="Common tags. Mixed heritage is the norm here, add nuance in the box beside this."
            cols={2}
          />
          <Field
            label="Heritage (other)"
            name="ethnicity_other"
            defaultValue={ethnicityOtherInitial}
            placeholder="half Italian, mixed"
            hint="For anything the tags don't cover, e.g. half Italian, mixed"
          />
        </div>
      </Collapse>
      )}

      {showCreator && (
      <Collapse
        emoji="💼"
        label="Creator identity"
        accent="cyan"
        filled={creatorFilled}
        hint="Replaces the old free-text Job field. Cover story is what she volunteers first if she doesn't lead with the creator identity."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <FieldLabel label="Creator type" hint="What she actually is, injected as her fan-facing job unless a cover story is set" />
            <select name="creator_type" defaultValue={clone?.creator_type ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {CREATOR_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Career start"
            name="career_start_year"
            type="number"
            defaultValue={clone?.career_start_year ?? ""}
            placeholder="2021"
          />
        </div>
        <Field
          label="Cover story"
          name="cover_story"
          defaultValue={coverStoryInitial}
          placeholder="what she says if she doesn't lead with the creator identity"
          hint="What she says if she doesn't lead with the creator identity. Carried forward from the old Job field the first time you open this."
        />
        <Area
          label="Known for"
          name="known_for"
          defaultValue={clone?.known_for ?? ""}
          placeholder="what she's actually famous for"
          rows={2}
        />
        <Area
          label="Career history"
          name="career_history"
          defaultValue={clone?.career_history ?? ""}
          placeholder="how she got into it, milestones"
          rows={2}
        />
        <Bool
          name="admits_platforms"
          label="Admits her platforms"
          initial={clone?.admits_platforms ?? false}
          hint="Off means she deflects if asked which platforms she's on, instead of confirming any"
        />
        <TagInput
          label="Platforms"
          name="platforms"
          initial={clone?.platforms?.length ? clone.platforms : []}
          placeholder="OnlyFans (Enter to add)"
          suggestions={PLATFORM_OPTIONS}
        />
      </Collapse>
      )}

      {showPhysical && (
      <Collapse
        emoji="🧬"
        label="Physical canon"
        accent="cyan"
        defaultOpen
        filled={physicalFilled}
        hint="Highest-priority facts on the page. Without these she improvises and contradicts herself between sessions."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Hair length</span>
            <select name="hair_length" defaultValue={clone?.hair_length ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {HAIR_LENGTH_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Hair color</span>
            <select name="hair_color" defaultValue={clone?.hair_color ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {HAIR_COLOR_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Eye color</span>
            <select name="eye_color" defaultValue={clone?.eye_color ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {EYE_COLOR_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Body type</span>
            <select name="body_type" defaultValue={clone?.body_type ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {BODY_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Cup size</span>
            <select name="cup_size" defaultValue={clone?.cup_size ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {CUP_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <Field label="Measurements" name="measurements" defaultValue={clone?.measurements ?? ""} placeholder="34C-26-36" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Bool name="tattoos" label="Has tattoos" initial={clone?.tattoos ?? false} />
            <TagInput
              label="Tattoos"
              name="tattoo_details"
              initial={clone?.tattoo_details ?? []}
              placeholder="small rose, left ankle (Enter to add)"
              hint="Include location, e.g. small rose - left ankle"
            />
          </div>
          <div className="grid gap-1.5">
            <Bool name="piercings" label="Has piercings" initial={clone?.piercings ?? false} />
            <TagInput
              label="Piercings"
              name="piercing_details"
              initial={clone?.piercing_details ?? []}
              placeholder="belly button, nose (Enter to add)"
              hint="Include location"
            />
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Enhancements</span>
          <select name="enhancements" defaultValue={clone?.enhancements ?? ""} className={selectCls}>
            <option value="">(not set)</option>
            {ENHANCEMENTS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <SubHead emoji="🎙️" label="Voice" tip="Mostly supersedes the old free-text 'how she sounds' question. A small remainder for nuance still lives in the questionnaire." />
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Accent</span>
            <select name="voice_accent" defaultValue={clone?.voice_accent ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {VOICE_ACCENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Pace</span>
            <select name="voice_pace" defaultValue={clone?.voice_pace ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {VOICE_PACE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Texture</span>
            <select name="voice_texture" defaultValue={clone?.voice_texture ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {VOICE_TEXTURE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
      </Collapse>
      )}

      {showSocials && (
      <Collapse
        emoji="📱"
        label="Socials"
        accent="purple"
        filled={socialsFilled}
        hint="Injected word for word: platform, handle, follower count. She'll share these if asked but keeps him chatting here."
      >
        <SocialsEditor initial={clone?.socials?.length ? clone.socials : []} />
      </Collapse>
      )}

      {showVibe && (
      <Collapse
        emoji="✨"
        label="Vibe & nicknames"
        accent="pink"
        defaultOpen
        filled={vibeFilled}
        hint="The preset ships a ready-made personality baseline the AI builds on. Nicknames go straight into her prompt, no compile."
      >
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Vibe / archetype</span>
          <select name="vibe_preset" defaultValue={vibeInitial} className={selectCls}>
            <option value="">Pick one…</option>
            {VIBE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}: {p.blurb}
              </option>
            ))}
          </select>
        </label>
        <TagInput
          label="Pet names"
          name="fan_nicknames"
          initial={nicknamesInitial}
          placeholder="babe, baby (Enter to add)"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TagInput
            label="Turn-ons"
            name="turn_ons"
            initial={turnOnsInitial}
            placeholder="confidence, banter (Enter to add)"
          />
          <TagInput
            label="Turn-offs"
            name="turn_offs"
            initial={turnOffsInitial}
            placeholder="clinginess, bragging (Enter to add)"
          />
        </div>
        <SubHead emoji="🪞" label="Reactions & rhythm" tip="Pulled out of the free-text quirks question so they're deterministic, not LLM-interpreted." />
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">If he's rude</span>
            <select name="reaction_to_rudeness" defaultValue={clone?.reaction_to_rudeness ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {REACTION_RUDE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">If complimented</span>
            <select name="reaction_to_compliments" defaultValue={clone?.reaction_to_compliments ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {REACTION_COMPLIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Message bursts</span>
            <select name="burst_style" defaultValue={clone?.burst_style ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {BURST_STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </Collapse>
      )}

      {showBehaviour && (
      <Collapse
        emoji="🧭"
        label="Behaviour policy"
        accent="amber"
        filled={behaviourFilled}
        hint="Drives actual behaviour, so it's a select, not a prose paragraph the AI has to interpret."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Relationship</span>
            <select name="relationship_canon" defaultValue={clone?.relationship_canon ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {RELATIONSHIP_CANON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <FieldLabel label="If asked to meet" />
            <select name="meeting_policy" defaultValue={clone?.meeting_policy ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {MEETING_POLICY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <FieldLabel label="If he says 'love you'" />
            <select name="love_policy" defaultValue={clone?.love_policy ?? ""} className={selectCls}>
              <option value="">(not set)</option>
              {LOVE_POLICY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <Bool
          name="acknowledges_other_fans"
          label="Chats with other fans"
          initial={clone?.acknowledges_other_fans ?? false}
          hint="Off keeps the chat feeling exclusive to him; she never mentions other fans"
        />
      </Collapse>
      )}

      {showRhythm && (
      <Collapse
        emoji="🌗"
        label="Daily rhythm"
        accent="blue"
        filled={rhythmFilled}
        hint="Pairs with her Timezone in Config. Without this she says 'just woke up' at 11pm her own time."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Wake time" name="wake_time" type="time" defaultValue={clone?.wake_time ?? ""} />
          <Field label="Sleep time" name="sleep_time" type="time" defaultValue={clone?.sleep_time ?? ""} />
        </div>
        <FieldLabel label="Daily blocks" hint="Optional. A rough schedule she can reference naturally (gym, shoots, dinner)." />
        <DailyBlocksEditor initial={clone?.daily_blocks?.length ? clone.daily_blocks : []} />
      </Collapse>
      )}

      {showContent && (
      <Collapse
        emoji="🎬"
        label="Content canon"
        accent="red"
        filled={contentFilled}
        hint="Distinct from Hard limits, which governs chat topics only. This is what she's actually filmed, or will never film."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TagInput
            label="Publicly done"
            name="content_done"
            initial={clone?.content_done?.length ? clone.content_done : []}
            placeholder="solo, toys... (Enter to add)"
            hint="For truthful answers when a fan asks if she's done something"
            suggestions={CONTENT_DONE_OPTIONS}
          />
          <TagInput
            label="Never films / sells"
            name="content_hard_nos"
            initial={clone?.content_hard_nos?.length ? clone.content_hard_nos : []}
            placeholder="anal, fisting... (Enter to add)"
            hint="On-camera production limits, separate from the chat-topic hard limits"
            suggestions={CONTENT_HARD_NO_OPTIONS}
          />
        </div>
      </Collapse>
      )}

      {showImperfection && (
      <Collapse
        emoji="✒️"
        label="Imperfection profile"
        accent="neutral"
        filled={imperfectionFilled}
        hint="Real creators send 'hey babe', 'lol', 'u up'. This survives the AI compiler normalising her example texts into polish. Pick how OFTEN each shows up, not just on or off."
      >
        {/* Migration-039 booleans stay in place (never dropped), mirrored from
            the new level so a raw DB read of the old column still shows a
            sane on/off, but prompt.ts no longer reads it once a level is set. */}
        <input type="hidden" name="uses_lowercase" value={String(cfg.lowercaseLevel !== "never")} />
        <input type="hidden" name="drops_punctuation" value={String(cfg.punctuationDropLevel !== "never")} />
        <input type="hidden" name="makes_typos" value={String(cfg.typoLevel !== "never")} />
        <input type="hidden" name="double_texts" value={String(cfg.doubleTextLevel !== "never")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented
            label="Lowercase"
            name="lowercase_level"
            value={cfg.lowercaseLevel}
            onChange={(v) => set("lowercaseLevel", v)}
            options={IMPERFECTION_SEG.lowercase}
            hint="How much of her texting is in lowercase."
          />
          <Segmented
            label="Drops punctuation"
            name="punctuation_drop_level"
            value={cfg.punctuationDropLevel}
            onChange={(v) => set("punctuationDropLevel", v)}
            options={IMPERFECTION_SEG.punctuation}
            hint="How often she skips end punctuation (periods, question marks)."
          />
          <Segmented
            label="Typos"
            name="typo_level"
            value={cfg.typoLevel}
            onChange={(v) => set("typoLevel", v)}
            options={IMPERFECTION_SEG.typo}
            hint="How often she makes small typos."
          />
          <Segmented
            label="Double-texts"
            name="double_text_level"
            value={cfg.doubleTextLevel}
            onChange={(v) => set("doubleTextLevel", v)}
            options={IMPERFECTION_SEG.doubleText}
            hint="How often she splits a reply into a quick follow-up instead of one longer message."
          />
        </div>
      </Collapse>
      )}

      {showLimits && (
        <HardLimits initial={clone?.hard_limits ?? []} extraInitial={hardLimitsExtraInitial} />
      )}
    </>
  );
}
