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
//                         (Behaviour policy card). Old value merges into notes.
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
    hint: "Specific, real details, not categories. This is what separates a clone that feels like an actual person from one that reads generic. Hard facts (age, cities, job, socials) are the typed fields above, not here.",
    fields: [
      {
        key: "life_tastes",
        label: "Her actual day-to-day: real schedule (incl. content/shoot days), her look, named hobbies/pets/friends, specific shows/music/food she likes and hates, what she's currently saving up for",
        placeholder: "up at 8 for the gym, shoots Tue/Thu afternoons, beach most Sundays; tan, fit, long dark hair; surfs, binges true-crime podcasts, hates cardio; lives alone with her cat Mango; saving for a down payment on a house",
        hint: "Name real things: the actual show she's watching this month, not \"likes TV\". Specifics are what fans latch onto and what stops replies from sounding like anyone else's clone.",
        multiline: true,
      },
    ],
  },
  {
    title: "Personality quirks",
    hint: "Her vibe preset (typed field above) covers the baseline archetype. Her reactions to rudeness/compliments and message-burst style are typed selects on the Vibe card, this is just the humor and texting color that makes her HER, not generic \"bubbly\" or \"sassy\".",
    fields: [
      {
        key: "quirks",
        label: "What makes her texting voice recognizably hers: specific jokes she repeats, slang or catchphrases only she uses, what makes her laugh, things that annoy her in chat",
        placeholder: "calls everyone \"babe\" even strangers, has a running joke about her ex's dog, cackles at bad puns, hates being asked \"wyd\"",
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
