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
        label: "★ Real example texts from her (paste 5-10)",
        placeholder: "one per line, her actual messages. This matters most.",
        multiline: true,
      },
      {
        key: "voice_sound",
        label: "How she sounds out loud (for voice notes)",
        placeholder: "soft Aussie lilt, slightly raspy, slow and teasing",
        hint: "Word choice only. Must match the ElevenLabs voice you picked in Config.",
      },
    ],
  },
  {
    title: "Her life & tastes",
    hint: "The color that makes chat feel like a real person. Hard facts (age, cities, job, socials) are the typed fields above, not here.",
    fields: [
      {
        key: "life_tastes",
        label: "Her life: a normal day, her look, hobbies, pets, likes and dislikes, music / food / shows, what she's saving for",
        placeholder: "gym mornings, beach, late-night chats; tan, fit, long dark hair; surfing + true-crime podcasts; lives alone with her cat Mango; saving for a beach house",
        multiline: true,
      },
    ],
  },
  {
    title: "Personality quirks",
    hint: "Her vibe preset (typed field above) covers the baseline archetype. This is only the stuff that makes her HER.",
    fields: [
      {
        key: "quirks",
        label: "Quirks: her humor, texting habits, how she reacts to compliments / rude guys / being ignored",
        placeholder: "sarcastic, teases back on compliments, goes quiet on rude guys, types in little bursts",
        multiline: true,
      },
    ],
  },
  {
    title: "Relationship feel",
    fields: [
      {
        key: "relationship_status",
        label: "Single? How she answers 'are you single / do you love me / can we meet?'",
        placeholder: "single and into you; deflects meeting softly",
        multiline: true,
      },
    ],
  },
  {
    title: "Anything else",
    fields: [
      {
        key: "notes",
        label: "Anything else about her: backstory, inside jokes, stories she can drop naturally",
        multiline: true,
      },
    ],
  },
];

export const INTAKE_FIELD_KEYS: string[] = INTAKE_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

// ── Legacy prose migration ─────────────────────────────────────────────────────
// Old clones stored ~25 keys; the new boxes prefill by merging the old values so
// nothing is lost — the operator sees it on the form and it round-trips on Save.
const LEGACY_MERGE: Record<string, { label: string; keys: string[] }[]> = {
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
  notes: [
    { label: "", keys: ["notes"] },
    { label: "Age (move to the typed field above)", keys: ["age"] },
    { label: "Where from / lives (move to the typed fields above)", keys: ["location"] },
    { label: "Job (move to the typed field above)", keys: ["occupation"] },
    { label: "Handles (move to the Socials editor above)", keys: ["socials"] },
    { label: "How she answers 'what's your insta'", keys: ["socials_behavior"] },
  ],
};

// The value a new prose box should show for a clone saved under the OLD keys:
// its own value if present, else the labelled merge of the legacy values.
export function proseValue(key: string, fields: Record<string, string> | null | undefined): string {
  const own = fields?.[key];
  if (own != null && own.trim() !== "") return own;
  const merge = LEGACY_MERGE[key];
  if (!merge || !fields) return "";
  const parts: string[] = [];
  for (const m of merge) {
    for (const k of m.keys) {
      const v = fields[k]?.trim();
      if (v) parts.push(m.label ? `${m.label}: ${v}` : v);
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
