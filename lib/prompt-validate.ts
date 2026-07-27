// ── Pre-save validation for prompt_templates.template bodies ─────────────────
// This is the real protection on the single most dangerous surface in the
// product (see ../../bot/docs/HANDOVER.md "Prompt templates are the
// highest-risk surface"): a save reaches every clone in the fleet within
// TEMPLATE_TTL_MS (60s), with no file backing and no prior editor. Every
// issue this finds is treated as a hard block on save, not a suggestion.
//
// KEEP IN SYNC:
// - SLOT_KEYS mirrors ../../bot/src/prompt.ts SLOT_KEYS (also duplicated as
//   the un-exported SLOT_KEYS in ./compiler.ts, same established pattern
//   this repo already uses for the persona-facts mirror).
// - DERIVED_SLOT_KEYS mirrors the keys derivedSlots() in bot/src/prompt.ts
//   fills in code (SPOIL_MENU, SUB_TIERS) — valid to reference in a
//   template, but never persona content an operator/compiler fills in.
// - REAL_FLAGS mirrors flagsForClone() in bot/src/prompt.ts. A {{#IF_X}} for
//   an X not in this list is an ORPHAN CONDITIONAL: applyConditionals() at
//   runtime only strips flags it's told about, so an orphaned block renders
//   UNCONDITIONALLY, silently, on every clone. warnOrphanConditionals() in
//   bot/src/prompt.ts only logs this, it never throws — this validator is
//   what actually stops it from shipping.

export const SLOT_KEYS = [
  "NAME",
  "PERSONA",
  "VOICE_TRAITS",
  "NICKNAMES",
  "FLIRT_NSFW",
  "RELATIONSHIP",
  "KNOWLEDGE_BASE",
] as const;

export const DERIVED_SLOT_KEYS = ["SPOIL_MENU", "SUB_TIERS"] as const;

const KNOWN_SLOTS = new Set<string>([...SLOT_KEYS, ...DERIVED_SLOT_KEYS]);

export const REAL_FLAGS = ["CHARGE", "PHOTOS", "VIDEOS", "VOICE", "MEDIA", "TIPS", "SUBS"] as const;
const KNOWN_FLAGS = new Set<string>(REAL_FLAGS);

export type ValidationIssue = {
  code:
    | "unknown_slot"
    | "malformed_marker"
    | "unbalanced_conditional"
    | "orphan_conditional"
    | "em_dash";
  message: string;
  line: number; // 1-based
};

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// Every {{...}} span in the template, content captured verbatim (whitespace
// included) so a typo like "{{ SLOT }}" is caught rather than silently
// tolerated — the runtime's fillSlots()/applyConditionals() do an EXACT
// string match ("{{SLOT}}", no internal whitespace), so anything not
// matching that exactly will render literally to the fan instead of being
// filled or stripped.
function markerSpans(template: string): { full: string; content: string; index: number }[] {
  const re = /\{\{([^{}]*)\}\}/g;
  const out: { full: string; content: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) out.push({ full: m[0], content: m[1], index: m.index });
  return out;
}

export function validateTemplate(template: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stack: { name: string; index: number }[] = [];

  for (const { full, content, index } of markerSpans(template)) {
    const line = lineOf(template, index);

    if (content.startsWith("#")) {
      const flagMatch = /^#IF_([A-Z0-9_]+)$/.exec(content);
      if (!flagMatch) {
        issues.push({ code: "malformed_marker", message: `Malformed conditional opener "${full}", expected exactly {{#IF_X}}, no extra spaces or lowercase.`, line });
        continue;
      }
      const flag = flagMatch[1];
      stack.push({ name: flag, index });
      if (!KNOWN_FLAGS.has(flag)) {
        issues.push({
          code: "orphan_conditional",
          message: `{{#IF_${flag}}} has no matching flag in flagsForClone(). Real flags are ${REAL_FLAGS.join(", ")}. This block will render UNCONDITIONALLY for every clone, silently. Known live footgun, do not ship.`,
          line,
        });
      }
    } else if (content.startsWith("/")) {
      const flagMatch = /^\/IF_([A-Z0-9_]+)$/.exec(content);
      if (!flagMatch) {
        issues.push({ code: "malformed_marker", message: `Malformed conditional closer "${full}", expected exactly {{/IF_X}}, no extra spaces or lowercase.`, line });
        continue;
      }
      const flag = flagMatch[1];
      const top = stack[stack.length - 1];
      if (!top) {
        issues.push({ code: "unbalanced_conditional", message: `{{/IF_${flag}}} closes a block that was never opened.`, line });
      } else if (top.name !== flag) {
        issues.push({
          code: "unbalanced_conditional",
          message: `{{/IF_${flag}}} does not match the currently open {{#IF_${top.name}}}. Conditional blocks must close in the order they opened.`,
          line,
        });
        stack.pop();
      } else {
        stack.pop();
      }
    } else {
      if (!/^[A-Z][A-Z0-9_]*$/.test(content)) {
        issues.push({ code: "malformed_marker", message: `Malformed marker "${full}", slot names are UPPER_SNAKE_CASE with no extra spaces (e.g. {{PERSONA}}).`, line });
        continue;
      }
      if (!KNOWN_SLOTS.has(content)) {
        issues.push({
          code: "unknown_slot",
          message: `{{${content}}} is not a known slot. Valid slots: ${SLOT_KEYS.join(", ")} (plus derived: ${DERIVED_SLOT_KEYS.join(", ")}). It will render literally to the fan instead of being filled.`,
          line,
        });
      }
    }
  }

  for (const unclosed of stack) {
    issues.push({
      code: "unbalanced_conditional",
      message: `{{#IF_${unclosed.name}}} is never closed with a matching {{/IF_${unclosed.name}}}.`,
      line: lineOf(template, unclosed.index),
    });
  }

  // Em dashes: swept from every live template already — the owner's rule is
  // no em dashes anywhere in bot output, ever. U+2014 (em dash) and U+2015
  // (horizontal bar, visually near-identical) both blocked.
  const dashRe = /[—―]/g;
  let dm: RegExpExecArray | null;
  while ((dm = dashRe.exec(template))) {
    issues.push({ code: "em_dash", message: `Em dash character found. The owner's rule is no em dashes anywhere in bot output, ever, use a comma or period instead.`, line: lineOf(template, dm.index) });
  }

  return issues;
}

// Slot keys actually referenced in the template (plain {{SLOT}} markers
// only, not conditionals), first-seen order, deduped — used to populate
// prompt_templates.slots on save, the same shape the existing rows use.
export function detectedSlots(template: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { content } of markerSpans(template)) {
    if (content.startsWith("#") || content.startsWith("/")) continue;
    if (KNOWN_SLOTS.has(content) && !seen.has(content)) {
      seen.add(content);
      out.push(content);
    }
  }
  return out;
}
