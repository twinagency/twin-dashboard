// ── Deterministic persona assembly (replaces the AI compiler) ────────────────
// Every persona slot the bot reads is now built in code from the operator's
// own words plus typed columns. No model call, so nothing is silently reworded,
// dropped or invented on the way to her prompt. This is the same contract the
// typed facts already had (see ../bot/src/prompt.ts personaFactsBlock): what an
// operator sets is exactly what she gets.
//
// The 2026-07-17 persona audit moved every HARD fact out of prose and into typed
// columns because the compiler mangled them. This finishes that job for the soft
// fields it left behind (backstory, quirks, example texts, life colour).
//
// Storage is unchanged: intake.fields still holds one string per key. A field is
// read as a LIST, one entry per line, which is what the inline list editors in
// components/IntakeFields.tsx write. Prose written before this change still works
// as-is: it simply reads as one entry per existing line.

import { vibePresetFor } from "./vibes";

export const PERSONA_SLOTS = [
  "NAME",
  "PERSONA",
  "VOICE_TRAITS",
  "NICKNAMES",
  "FLIRT_NSFW",
  "RELATIONSHIP",
  "KNOWLEDGE_BASE",
] as const;

export type Persona = Record<(typeof PERSONA_SLOTS)[number], string>;

/** Split one stored field into its list entries. Blank-safe. */
export function listEntries(value: string | null | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((s) => s.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/** Join list entries back into the stored single-string shape. */
export function joinEntries(entries: string[]): string {
  return entries.map((s) => s.trim()).filter(Boolean).join("\n");
}

function block(heading: string, entries: string[]): string {
  if (!entries.length) return "";
  return `${heading}\n${entries.map((e) => `- ${e}`).join("\n")}`;
}

type Fields = Record<string, string> | null | undefined;

/**
 * Build every persona slot from the operator's entries + the vibe preset.
 *
 * NICKNAMES and RELATIONSHIP are deliberately left empty: the bot fills both
 * from typed columns in effectivePersona(), and anything set here would just be
 * appended after them. KNOWLEDGE_BASE likewise gets the typed facts block
 * prepended bot-side, so this only supplies the operator-written colour.
 */
export function buildPersona(fields: Fields, cloneName: string, vibePreset: string | null): Persona {
  const f = fields ?? {};
  const vibe = vibePresetFor(vibePreset);

  const examples = listEntries(f.example_texts);
  const voiceNotes = listEntries(f.voice_notes);
  const quirks = listEntries(f.quirks);
  const life = listEntries(f.life_tastes);
  const notes = listEntries(f.notes);

  // Her example texts belong in PERSONA, NOT VOICE_TRAITS. {{VOICE_TRAITS}} is
  // referenced by the VOICE template only (see prompt_templates / bot's
  // prompt-templates.ts) - the text template has no such slot - so while the
  // examples lived there they reached her spoken voice notes and NOTHING else.
  // Every text reply, the flow that carries essentially all her traffic, was
  // written without them, and on a voice-off clone they reached nothing at all.
  // That is this project's "configured but inert" defect landing on the single
  // highest-value intake field (intake.ts stars it: "This matters most for
  // sounding like her"). Both templates render {{PERSONA}}, so moving the block
  // here is strictly additive: voice keeps the examples and text gains them.
  // Asserted by bot/src/dev/check-example-texts-reach-text.ts.
  const persona = [
    vibe?.persona?.trim() ?? "",
    block("Things that make her texting voice hers:", quirks),
    block("Real examples of how she texts, match this voice:", examples),
  ]
    .filter(Boolean)
    .join("\n\n");

  const voiceTraits = block("How she sounds and types:", voiceNotes);

  const knowledge = [
    block("Her life and tastes:", life),
    block("Backstory and stories she can bring up:", notes),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    NAME: cloneName,
    PERSONA: persona,
    VOICE_TRAITS: voiceTraits,
    NICKNAMES: "",
    FLIRT_NSFW: vibe?.flirt?.trim() ?? "",
    RELATIONSHIP: "",
    KNOWLEDGE_BASE: knowledge,
  };
}
