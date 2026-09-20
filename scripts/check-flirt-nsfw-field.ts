// THE SEX-PERSONALITY BOX MUST REACH THE PROMPT. (2026-09-20)
//
// WHY THIS EXISTS: FLIRT_NSFW is the body of the prompt's
// "FLIRTING & SEXUAL CONTENT" heading, and until now the ONLY thing that could
// fill it was the vibe_preset dropdown. On the live fleet that meant:
//   * vibe_preset NULL on 15 of 18 clones -> FLIRT_NSFW empty on 16 of 18
//   * not one of the 6 presets is explicit; every one describes restraint
//     ("withholding", "makes him work for it", "hints and almosts",
//      "promises nothing", "teases denial", "a little shy at first")
//   * on clones carrying hard limits, the bot appends that list of NOs into
//     this SAME slot, so their entire sexual section was prohibitions
//
// PROVEN ON REAL TRAFFIC, 2026-09-20 08:44-09:11 UTC: the same explicit fan
// message was sent to 8 clones. Every clone whose sexual section was only NOs
// refused and told him off ("you're ridiculous", "I'm not just here for that
// kind of talk", "Whoa, slow down there"). The two whose section was clean
// matched him explicitly. Both sides ran DeepSeek, so this was never the model.
//
// This check pins the wiring end to end: the field exists in the questionnaire,
// the generic intake sweep will persist it, and buildPersona() puts it in the
// slot. "Configured but inert" is this project's dominant defect, so asserting
// the field renders is not enough -- the assertion that matters is the last one.
//
// Run: npx tsx scripts/check-flirt-nsfw-field.ts
import { INTAKE_SECTIONS, INTAKE_FIELD_KEYS } from "../lib/intake";
import { buildPersona } from "../lib/persona-build";

let fails = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "✅ PASS" : "❌ FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
  if (!cond) fails++;
}

console.log("▶️  flirt_nsfw field check\n");

// ── 1. the box exists in the questionnaire ─────────────────────────────────
const field = INTAKE_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === "flirt_nsfw");
check("the questionnaire has a flirt_nsfw box", field !== undefined);
check("it is multiline", field?.multiline === true);
check("it is swept into intake by the generic key list", INTAKE_FIELD_KEYS.includes("flirt_nsfw"));

// ── 2. it reaches the FLIRT_NSFW slot ──────────────────────────────────────
// This is the assertion that matters. A field that renders and saves but never
// reaches the prompt is exactly the failure this whole fix exists to correct.
const HER_WORDS = "gets filthy once she trusts him and doesnt hold back";

const noPreset = buildPersona({ flirt_nsfw: HER_WORDS }, "Autumn", null);
check("with NO vibe preset, her words fill the slot", noPreset.FLIRT_NSFW.includes(HER_WORDS), noPreset.FLIRT_NSFW);

// ── 3. the preset is not destroyed by it, and vice versa ───────────────────
const withPreset = buildPersona({ flirt_nsfw: HER_WORDS }, "Autumn", "bratty");
check("her words survive alongside a preset", withPreset.FLIRT_NSFW.includes(HER_WORDS));
check("the preset still applies too", withPreset.FLIRT_NSFW.toLowerCase().includes("teas"), withPreset.FLIRT_NSFW);

// ── 4. nothing changes for a clone that leaves it blank ────────────────────
// 16 of 18 clones are in this state today, so a regression here is fleet-wide.
const blank = buildPersona({}, "Autumn", "bratty");
const presetOnly = buildPersona({}, "Autumn", "bratty");
check("blank box = preset alone, unchanged", blank.FLIRT_NSFW === presetOnly.FLIRT_NSFW);
check("blank box and no preset = empty, as before", buildPersona({}, "Autumn", null).FLIRT_NSFW === "");
check("an empty string is treated as blank", buildPersona({ flirt_nsfw: "   " }, "Autumn", null).FLIRT_NSFW === "");

// ── 5. multi-line entries all survive ──────────────────────────────────────
const multi = buildPersona({ flirt_nsfw: "loves being told what hed do to her\ngets demanding when close" }, "A", null);
check("every line reaches the slot", multi.FLIRT_NSFW.includes("loves being told") && multi.FLIRT_NSFW.includes("gets demanding"), multi.FLIRT_NSFW);

// ── 6. the other slots are untouched ───────────────────────────────────────
const before = buildPersona({ quirks: "cackles at bad puns", life_tastes: "pasta kick" }, "A", null);
const after = buildPersona({ quirks: "cackles at bad puns", life_tastes: "pasta kick", flirt_nsfw: HER_WORDS }, "A", null);
check("PERSONA is unaffected", before.PERSONA === after.PERSONA);
check("KNOWLEDGE_BASE is unaffected", before.KNOWLEDGE_BASE === after.KNOWLEDGE_BASE);
check("VOICE_TRAITS is unaffected", before.VOICE_TRAITS === after.VOICE_TRAITS);

console.log(fails === 0 ? "\n✅ ALL PASS" : `\n❌ ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
