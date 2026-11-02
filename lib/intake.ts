// The clone onboarding questionnaire — PROSE ONLY since the 2026-07-17 persona
// audit. Hard facts (DOB/age, gender, height, cities, job, socials, nicknames,
// vibe preset, turn-ons/offs, hard limits) moved to typed clone COLUMNS edited
// by the structured widgets (components/clone/PersonaFactsFields.tsx) and are
// injected into her prompts deterministically in code — never through the AI
// compiler. What remains here is the writing only an operator can do.
//
// Retired keys (no longer asked; values merged into the new boxes on next edit):
//   age, location, occupation, look*, daily_routine, hobbies, likes, dislikes,
//   living_situation, faves, goals, socials, socials_behavior, texting_style,
//   nicknames, vibe, reactions, humor, turn_ons, turn_offs, hard_limits,
//   content_types, named_sets (the last two are DELETED outright — the compiler
//   always discarded them; "what she sells" is now derived from the live media
//   library, see src/services/content-menu.ts).
//   *look folds into life_tastes via the legacy merge below.
//
// IDENTITY CANON audit (migration 039) retires two more prose keys the same
// way, superseded by typed columns/selects in PersonaFactsFields.tsx:
//   relationship_status → relationship_canon/meeting_policy/love_policy selects
//                         (Relationship stance card, renamed from "Behaviour
//                         policy" in the 2026-07-27 clarity pass). Old value
//                         merges into notes.
//   voice_sound         → mostly superseded by the voice_accent/pace/texture
//                         selects (Physical canon card); replaced here by
//                         `voice_notes`, a small free-text remainder for
//                         nuance the selects can't capture. Old value merges
//                         forward via proseValue (see LEGACY_MERGE below).
//
//   lazy_texts          → briefly split out as its own box the same night as
//                         this retirement, then reversed: real example texts
//                         SHOULD include her lazy/casual ones, splitting them
//                         into a second artificial box was the wrong call. Any
//                         value already saved under lazy_texts folds back into
//                         example_texts via the legacy merge below.
//
// LIFE CANON addendum (migration 060, 2026-07-27): hobbies, pets and living
// situation are now typed fields on the Life & pets card (they were
// previously only answerable, if at all, inside the life_tastes prose blob
// below). NOT retired the way the keys above were: `hobbies` and
// `living_situation` still fold into life_tastes via LEGACY_MERGE (they
// always did, since the 07-17 audit), and life_tastes keeps holding the
// narrative version too. Reason: unlike a clean select-vs-select swap, there
// is no reliable way to auto-parse "lives alone with her cat Mango" prose
// into a living_situation enum or a pet_details chip, so nothing here was
// safe to retire outright. hobbies gets a best-effort chip prefill from its
// old legacy key when the typed field is empty (see PersonaFactsFields.tsx);
// pets and living situation just start blank for the operator to fill once.
//
// FAVORITES CANON addendum (migration 063, 2026-07-27): a second pass over the
// remaining life_tastes/quirks scope, judged fact-by-fact per the identity
// data principle. Promoted to typed columns (Vibe card / Life & pets card):
//   catchphrases    - slang/catchphrases only she uses (was inside `quirks`)
//   favorite_things - specific named shows/music/food she loves (was inside
//                     `life_tastes`); the OLD retired `likes` key still folds
//                     forward as a best-effort chip prefill, same pattern as
//                     hobbies above
//   dislikes        - specific things she hates, not chat behaviour (turn_offs
//                     already covers that); the OLD retired `dislikes` key
//                     folds forward the same way
//   saving_goal     - a single concrete fact ("what are you saving for"), same
//                     free-text-but-deterministic shape as cover_story/known_for
//                     on the Creator identity card, not a fixed-vocabulary field
// life_tastes and quirks are NOT retired, only narrowed: "her look" and "real
// schedule" were removed from the life_tastes prompt entirely rather than
// promoted, since they're already fully covered by existing typed columns
// (Physical canon; Daily rhythm's wake_time/sleep_time/daily_blocks) and
// leaving them as an open prose question risked prose contradicting a typed
// fact, the same bug class fixed for tattoos/piercings in the identity canon
// audit. Named friends, specific running jokes/stories and "what makes her
// laugh" stay prose in life_tastes/quirks: genuinely narrative, not a single
// enumerable fact.

export type IntakeField = {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  // When set, the field renders as a dropdown instead of free text.
  options?: { value: string; label: string }[];
};

export type IntakeSection = {
  title: string;
  hint?: string;
  fields: IntakeField[];
};

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    title: "How she talks",
    hint: "The single biggest thing for sounding like her.",
    fields: [
      {
        key: "example_texts",
        label: "★ Real example texts from her (paste 10-20)",
        placeholder: "one per line: her actual messages, best ones AND her lazy/throwaway ones (hey babe / lol / u up), not just her most polished lines",
        hint: "This matters most for sounding like her. Include the low-effort one-liners too, not only her best messages, or the clone reads as too polished.",
        multiline: true,
      },
      {
        key: "voice_notes",
        label: "Anything about how she sounds or types that the dropdowns above miss",
        placeholder: "slight lisp on S's, gets huskier when tired, laughs mid-sentence, says \"like\" a lot",
        hint: "Accent/pace/texture are typed selects on the Physical canon card. This is only the leftover nuance: verbal tics, a laugh, filler words.",
      },
    ],
  },
  {
    title: "Her life & tastes",
    hint: "Specific, real details, not categories. This is what separates a clone that feels like an actual person from one that reads generic. Hard facts (age, cities, job, socials) are the typed fields above, not here. Hobbies, pets, living situation, favorite things, dislikes and her saving goal are now typed too, on the Life & pets card.",
    fields: [
      {
        key: "life_tastes",
        label: "A normal day beyond her set schedule, named friends, and any other color that doesn't fit a chip: what she's currently into, current life context",
        placeholder: "her friend Jess keeps dragging her to spin class, been on a real pasta kick lately, low-key stressed about an upcoming trip",
        hint: "Named friends, current context, anything that doesn't reduce to a single fact. Schedule, look, favorite/hated things and her saving goal all moved to typed fields (Physical canon, Daily rhythm, Life & pets), this is for everything genuinely narrative left over.",
        multiline: true,
      },
    ],
  },
  {
    // ── THE SEX-PERSONALITY BOX (2026-09-20) ──────────────────────────────────
    // Until now the ONLY thing that could fill the prompt's "FLIRTING & SEXUAL
    // CONTENT" section was the vibe_preset dropdown. Measured on the live
    // fleet: vibe_preset is null on 15 of 18 clones, so that section is EMPTY
    // on 16 of them, and not one of the 6 presets is explicit -- every one
    // describes restraint ("withholding", "makes him work for it", "hints and
    // almosts", "promises nothing", "teases denial", "a little shy at first").
    //
    // Worse, on the clones that carry hard limits the bot appends that list of
    // NOs into the SAME slot, so their entire sexual section was prohibitions
    // and nothing else.
    //
    // PROVEN ON REAL TRAFFIC, 2026-09-20: the same explicit fan message sent to
    // 8 clones. Every clone whose sexual section was only NOs refused and told
    // him off; the two whose section was clean matched him. Same model on both
    // sides, so this was never the model -- it was an empty box.
    title: "How she is when it gets sexual",
    hint: "This is the one thing the vibe preset cannot say for her. The preset gives a baseline archetype; this is her own words about what she is actually like when a conversation turns sexual, and it goes straight into the prompt section that governs it. Leave it blank and that section falls back to the preset alone.",
    fields: [
      {
        key: "flirt_nsfw",
        label: "In her words: how explicit does she get, what does she love talking about, how does she escalate, what is she like when she wants him",
        placeholder: "gets filthy once she trusts him and doesn't hold back, loves being told exactly what he'd do to her, talks through it in detail, gets more demanding the closer he gets",
        hint: "Written as description of her, the same as the other boxes. Her hard NOs stay on the boundaries field; this is the opposite, what she IS up for. Appended after the vibe preset, so both apply.",
        multiline: true,
      },
    ],
  },
  {
    title: "Personality quirks",
    hint: "Her vibe preset (typed field above) covers the baseline archetype. Her reactions to rudeness/compliments, message-burst style and catchphrases are typed on the Vibe card, this is just the humor that makes her HER, not generic \"bubbly\" or \"sassy\".",
    fields: [
      {
        key: "quirks",
        label: "What makes her texting voice recognizably hers: specific jokes she repeats, what makes her laugh, running bits",
        placeholder: "has a running joke about her ex's dog, cackles at bad puns, always turns things into an inside joke",
        hint: "Catchphrases and slang moved to a typed chip list on the Vibe card, this is for the stories and running jokes behind them, which can't be reduced to a single phrase.",
        multiline: true,
      },
    ],
  },
  {
    title: "Anything else",
    hint: "The kind of detail a long-time fan or friend would know that a stranger reading her bio wouldn't. Even one good story here goes a long way.",
    fields: [
      {
        key: "notes",
        label: "Backstory, inside jokes, running bits, stories she can drop naturally into chat",
        placeholder: "grew up on a farm and still gets teased about it, always brings up her disastrous first tattoo, has a bit about never learning to parallel park",
        multiline: true,
      },
    ],
  },
];

export const INTAKE_FIELD_KEYS: string[] = INTAKE_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

// ── Legacy prose migration ─────────────────────────────────────────────────────
// Old clones stored ~25 keys; the new boxes prefill by merging the old values so
// nothing is lost — the operator sees it on the form and it round-trips on Save.
const LEGACY_MERGE: Record<string, { label: string; keys: string[]; alwaysAppend?: boolean }[]> = {
  // example_texts already existed (it's not a brand-new consolidated box like
  // life_tastes/quirks/notes below), so it's very likely non-empty already for
  // any real clone. `alwaysAppend` keeps folding lazy_texts' value in on every
  // load (not just while example_texts is still empty), guarded by a substring
  // check in proseValue() so a value already folded in on a prior save is
  // never duplicated.
  example_texts: [
    { label: "", keys: ["lazy_texts"], alwaysAppend: true },
  ],
  life_tastes: [
    { label: "Her look", keys: ["look"] },
    { label: "A normal day", keys: ["daily_routine"] },
    { label: "Hobbies", keys: ["hobbies"] },
    { label: "Likes", keys: ["likes"] },
    { label: "Dislikes", keys: ["dislikes"] },
    { label: "Living situation / pets", keys: ["living_situation"] },
    { label: "Music / food / shows", keys: ["faves"] },
    { label: "Goals", keys: ["goals"] },
  ],
  quirks: [
    { label: "Texting style", keys: ["texting_style"] },
    { label: "Reactions", keys: ["reactions"] },
    { label: "Humor", keys: ["humor"] },
  ],
  voice_notes: [
    // voice_sound (migration 039 retirement) — mostly superseded by the
    // voice_accent/pace/texture selects; its old value carries forward as the
    // free-text remainder until the operator resaves.
    { label: "", keys: ["voice_sound"] },
  ],
  notes: [
    { label: "", keys: ["notes"] },
    { label: "Age (move to the typed field above)", keys: ["age"] },
    { label: "Where from / lives (move to the typed fields above)", keys: ["location"] },
    { label: "Job (move to the typed Creator identity card above)", keys: ["occupation"] },
    { label: "Handles (move to the Socials editor above)", keys: ["socials"] },
    { label: "How she answers 'what's your insta'", keys: ["socials_behavior"] },
    {
      label: "Relationship / meeting answers (move to the typed Behaviour policy selects above)",
      keys: ["relationship_status"],
    },
  ],
};

// The value a new prose box should show for a clone saved under the OLD keys:
// its own value (if present) plus any legacy value not yet folded into it.
// Fold-once fields (the default, e.g. life_tastes/quirks/notes): only pull the
// legacy value in while the new box is still empty — the first save bakes the
// merged text into `own` forever, so re-merging every load would duplicate it.
// alwaysAppend fields (example_texts <- lazy_texts): the new box already
// existed before the retirement and is rarely empty, so it keeps folding the
// legacy value in on every load, guarded by a substring check against `own` so
// a value already folded in on a prior save is never duplicated.
export function proseValue(key: string, fields: Record<string, string> | null | undefined): string {
  const own = fields?.[key]?.trim() ?? "";
  const merge = LEGACY_MERGE[key];
  if (!merge || !fields) return own;
  const parts: string[] = own ? [own] : [];
  for (const m of merge) {
    for (const k of m.keys) {
      const v = fields[k]?.trim();
      if (!v) continue;
      if (own && !m.alwaysAppend) continue;
      if (own && own.includes(v)) continue;
      parts.push(m.label ? `${m.label}: ${v}` : v);
    }
  }
  return parts.join("\n");
}

// Build the labelled text blob the AI compiler reads: the prose answers plus a
// STRUCTURED FACTS section from the typed columns (context for PERSONA/FLIRT
// prose — the compiler is told the system injects these facts itself and must
// not restate them in KNOWLEDGE_BASE). `name` is the clone's display name.
export function assembleAnswers(
  fields: Record<string, string>,
  name?: string,
  structured?: Record<string, string>,
): string {
  const lines: string[] = [];
  if (name) lines.push(`Name: ${name}`);

  const facts = Object.entries(structured ?? {}).filter(([, v]) => v.trim() !== "");
  if (facts.length) {
    lines.push(
      "",
      "## Structured facts (typed fields - the system injects these into her prompt automatically; use them as context, do NOT restate them)",
    );
    for (const [label, v] of facts) lines.push(`${label}: ${v.trim()}`);
  }

  for (const section of INTAKE_SECTIONS) {
    const present = section.fields.filter((f) => (fields[f.key] ?? "").trim());
    if (present.length === 0) continue;
    lines.push("", `## ${section.title}`);
    for (const f of present) lines.push(`${f.label.replace(/^★ /, "")}: ${fields[f.key].trim()}`);
  }
  return lines.join("\n").trim();
}
