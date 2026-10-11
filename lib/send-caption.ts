import { orChat } from "./openrouter";
import { withRetry } from "./retry";
import { cleanSendCaption, descriptionProblems } from "./media-classification";
import type { AnalysisFields } from "./media-analysis-contract";

// The legacy first-person SEND caption (V1 sends it on timed, campaign and catalogue sends). It is written TEXT-ONLY from the
// already-validated facts, never from the image and never inside the vision call, and it is checked against those same
// facts. It is never evidence for matching. On any failure the caption is null and V1 falls back to auto_desc.
export const SEND_CAPTION_MODEL = "deepseek/deepseek-v4-flash";

export const RECAPTION_SYSTEM = `You write one caption for a photo or video that a woman is sending to a fan.
Write in first person as her. It is standalone, not a reply to anyone.
Use 1 to 2 GRAPHIC, specific details taken ONLY from the facts given: what she is wearing, which body parts are showing, what her hands or a toy are doing, the angle. Raunchy and explicit.
You may end with a teasing question about a visible detail. Use 1 to 3 fitting emojis. 2 to 3 short sentences, at most 45 words.
Style reference: "mmm right now i'm lying here in my new lingerie set, i may or may not have a finger up my ass 😈 can you see my pussy lips from this angle?"
Never claim anything the facts do not state. If the facts say a body part is not visible, do not describe it as visible.
Do NOT add wetness, fluids, dampness, depth, penetration, fingers, clothing or objects that the facts do not name. Do not name a body part of yours unless the facts name it. If the facts describe a man, do not write as a woman and do not mention a woman's body parts.
Never mention OnlyFans, prices, Stars, tipping, tapping, unlocking or paying. Never use em dashes or en dashes.
Reply with ONLY the caption text.`;

const SALES = /\b(only ?fans|onlyfans|stars?|price|pay|paid|tip|unlock\w*)\b/i;

// Words a caption must not use unless the facts text itself uses them (the writer tends to invent these).
const INVENTED = /\b(wet(?:ness)?|damp|soaked|soaking|dripping|drenched|moist|juic(?:y|es)|fingers?|fingering|deep|deeper|inside|cum|cumming|creampie|spit|oil(?:ed|y)?|shirt|dress|skirt|jeans|hoodie|bra|panties|stockings|heels)\b/gi;
const FEMALE_BODY = /\bmy (?:pussy|tits|boobs|breasts|nipples|lips|clit|cleavage)\b/i;
const MALE_FACTS = /\b(?:man|men|male|guy|boy|penis|cock|dick)\b/i;
const FEMALE_FACTS = /\b(?:woman|women|female|girl|she|her|breasts?|nipples?|vulva|pussy|labia)\b/i;

/** Words in the caption that the facts text does not contain (stem-insensitive on the invented-word list). */
export function inventedWords(caption: string, factsText: string): string[] {
  const facts = factsText.toLowerCase();
  const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s|y)$/, "");
  return [...new Set((caption.match(INVENTED) ?? []).map((w) => w.toLowerCase()))].filter((w) => !facts.includes(stem(w)));
}

/** Guard a model output: returns a clean caption or null (null = skip the row, keep the old caption).
 * With `facts`, the caption may also only claim what the evidence marks "yes". */
export function acceptCaption(raw: string, facts?: Pick<AnalysisFields["visual_facts"], "evidence">, factsText?: string): string | null {
  const trimmed = raw.replace(/^["'\s]+|["'\s]+$/g, "");
  if (SALES.test(trimmed)) return null; // reject rather than strip: stripping leaves a mangled sentence
  const text = cleanSendCaption(trimmed);
  if (!text || text.length < 12 || SALES.test(text)) return null;
  if (/visual_description|as an ai|i can't|i cannot/i.test(text)) return null;
  if (facts && descriptionProblems(text, facts.evidence).some((p) => /^claims /.test(p))) return null;
  if (factsText !== undefined) {
    if (inventedWords(text, factsText).length) return null;
    const male = MALE_FACTS.test(factsText) && !FEMALE_FACTS.test(factsText);
    const m = text.match(FEMALE_BODY);
    if (m && (male || !factsText.toLowerCase().includes(m[0].slice(3).toLowerCase()))) return null;
  }
  return text;
}

/** Write the legacy send caption from analysed facts. Returns null on any failure (never throws, never invents). */
export async function generateSendCaption(
  fields: Pick<AnalysisFields, "visual_description" | "visual_facts">,
  kind: "photo" | "video",
  write: (user: string) => Promise<string> = (user) =>
    withRetry(() => orChat({ model: SEND_CAPTION_MODEL, system: RECAPTION_SYSTEM, user, temperature: 0.9 }), 2),
): Promise<string | null> {
  try {
    return acceptCaption(await write(`Facts about this ${kind}: ${fields.visual_description}`), fields.visual_facts, `${fields.visual_description} ${fields.visual_facts.visible.join(" ")}`);
  } catch {
    return null;
  }
}
