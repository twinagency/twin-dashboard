import { cleanSendCaption, descriptionProblems, type VisualFacts } from "./media-classification";

// The legacy first-person SEND caption (V1 sends it on timed, campaign and catalogue sends). It is written TEXT-ONLY from the
// already-validated observations, never from the image, so it cannot see more than the facts allow, and it is checked against
// those same facts. Keeping it out of the vision call is what keeps that call purely factual.
export const SEND_CAPTION_MODEL = "deepseek/deepseek-v4-flash";

export const SEND_CAPTION_SYSTEM = `You write one caption for a photo or video that a woman is sending to a fan.
Write in first person as her. It is standalone, not a reply to anyone.
Use 1 to 2 GRAPHIC, specific details taken ONLY from the facts given: what she is wearing, which body parts are showing, what her hands or a toy are doing, the angle. Raunchy and explicit.
You may end with a teasing question about a visible detail. Use 1 to 3 fitting emojis. 2 to 3 short sentences, at most 45 words.
Style reference: "mmm right now i'm lying here in my new lingerie set, i may or may not have a finger up my ass 😈 can you see my pussy lips from this angle?"
Never claim anything the facts do not state. If the facts say a body part is not visible or unclear, do not describe it as visible, and do not say what she is or is not wearing beyond the facts.
Never mention OnlyFans, prices, Stars, tipping, tapping, unlocking or paying. Never use em dashes or en dashes.
Reply with ONLY the caption text.`;

const SALES = /\b(only ?fans|onlyfans|stars?|price|pay|paid|tip|unlock\w*)\b/i;

/** Guard a model output: returns a clean caption or null (null = use the fallback / keep the old caption). */
export function acceptCaption(raw: string, facts?: VisualFacts): string | null {
  const text = cleanSendCaption(raw.replace(/^["'\s]+|["'\s]+$/g, ""));
  if (!text || text.length < 12 || SALES.test(text)) return null;
  if (/visual_description|as an ai|i can't|i cannot/i.test(text)) return null;
  // A caption may only claim what the observations confirm (negated clauses are not claims).
  if (facts && descriptionProblems(text, facts.features, facts.scope).some((p) => !/motion or intent/.test(p))) return null;
  return text;
}

/** Truthful, never promotional: used only when the caption step is unavailable or its output fails the guard. */
export function fallbackCaption(facts: VisualFacts): string {
  const s = facts.summary.replace(/^In the sampled frames:\s*/i, "").replace(/[.!?]+$/, "").trim();
  return cleanSendCaption(s.charAt(0).toLowerCase() + s.slice(1)).slice(0, 140);
}
