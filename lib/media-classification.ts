import { MEDIA_TAGS } from "./pricing";
import type { Caption } from "./caption";

export const VISUAL_EVIDENCE_KEYS = [
  "nipples_visible", "genitals_visible", "anus_visible", "bare_buttocks_visible",
  "sexual_activity_visible", "full_nudity_visible", "swimwear_visible",
  "lingerie_visible", "mirror_reflection_visible", "suggestive_pose_or_clothing",
] as const;

export const MEDIA_CLASSIFICATION_PROMPT = `Describe only what is visibly present in this image for an internal media catalogue. Do not guess hidden clothing, anatomy, intent, or actions outside the frame.
Return JSON with caption (see SEND CAPTION below), auto_desc (2-5 factual words), teaser_caption (a brief non-explicit first-person line for legacy callers), visual_description (see VISUAL DESCRIPTION below), tags, and visual_evidence.
tags must be a subset of: ${MEDIA_TAGS.join(", ")}.
visual_evidence must contain ALL these keys with JSON boolean values: ${VISUAL_EVIDENCE_KEYS.join(", ")}.

SEND CAPTION (the "caption" field):
- Written as the woman pictured, texting a fan while she sends him this photo or video. She talks TO him, in first person, present tense, about what she's doing and feeling. She never narrates or describes the picture like an observer.
- Super descriptive: include 2 to 3 sexy details that are clearly visible (what she's wearing, which body parts are out, her pose, what her hands or a toy are doing), said the way a horny girl texts: tits, ass, pussy, bent over, spread, soaking.
- Never use narrator words: visible, fully, exposed, on display, from this angle, angle, view, reflection, captures, sheen, midriff, front and center, can you see, can you spot. Never mention the room, sink, camera, lighting or jewellery unless it's sexy.
- Only what visual_evidence supports. Never invent an act (a finger in her ass, being wet, a toy) that is not shown.
- End with a tease, a dare or a question to him, and vary it. 1 or 2 emojis. Under 40 words. Casual, lowercase is fine, "u" and "baby" are fine.
- Example: "lying here naked with one leg up, tits out and my hand sliding down right above my pussy 😈 it's already throbbing thinking about u, want me to keep going?" Never copy the example.
- Never mention OnlyFans, prices, Stars, tipping, tapping, unlocking or paying. Never use em dashes or en dashes.

VISUAL DESCRIPTION:
- 3 to 6 factual sentences describing everything clearly visible. No flirting, no guessing, no invented detail.
- State the nudity level plainly.
- State explicitly whether the pussy/vagina, the anus and the nipples are each visible or not visible. Do not skip any of the three.
- Describe the pose, the clothing and accessories (including their colours), and any toys or objects and what is happening with them.
- Describe the camera angle, the facial expression, and the setting.
- Every claim in visual_description must agree with visual_evidence: only say a body part is visible when the matching evidence key is true.

VISUAL RULES:
- A value is true only when the feature is clearly visible. Covered, cropped, obscured or uncertain features are false. Describe visible clothing instead of guessing what is underneath.
- Cleavage, side cleavage, underboob, a low neckline, an open shirt, swimwear or lingerie do NOT by themselves prove nudity. nipples_visible requires a visibly uncovered nipple or areola, not a covered outline. A nipple hidden behind a shirt or bikini is not visible.
- An open white shirt with cleavage but covered nipples is described as "open white shirt". Never label that "topless", "nude", or "exposed breasts". Do not assume it is a bikini unless a bikini is actually visible.
- bare_buttocks_visible means clearly uncovered buttocks, not a swimsuit edge, a clothed shape or a small strip of skin. genitals_visible and anus_visible require the actual uncovered anatomy, not its covered outline.
- full_nudity_visible requires a clearly unclothed body, not a cropped neckline or one uncovered part. sexual_activity_visible requires a visible sexual act, not a facial expression or pose.
- Swimwear and lingerie are different garments. Do not label a bikini as lingerie. Use both only if two separate, clearly identifiable garments are visible.
- mirror_reflection_visible requires an actual visible mirror/reflection. A handheld selfie in a car is not a mirror selfie.
- Use topless/tits only for visibly uncovered nipples; pussy/anal only for clearly visible corresponding anatomy; full_nude only for visible full nudity. Never infer those tags from cleavage or the shape of clothed anatomy.
- For this catalogue, swimwear, lingerie, an open shirt showing cleavage or a suggestive pose can be suggestive without being nude or sexually explicit. Do not invent an age rating.
- caption, auto_desc and tags must agree with visual_evidence: the caption may only name a body part, act or garment that visual_evidence marks visible. Keep auto_desc and visual_description factual; do not add lists of absent anatomy or nudity disclaimers. Classification flags are derived by code, not by how much cleavage is visible.`;

const TAG_SET = new Set<string>(MEDIA_TAGS);

// Owner rule: no em dash (—) or en dash (–) in visual_description, ever. The
// prompt asks the model not to use one, but this is the backstop — never
// rely on the model alone for a hard style rule.
export function stripBannedDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/ {2,}/g, " ")
    .replace(/,\s*([.,!?])/g, "$1")
    .trim();
}

// The stored caption rides on timed, campaign and catalogue sends, which can be
// free or locked, so it must never talk about paying. Sentences that do are
// dropped rather than failing the whole (best-effort) analysis.
const SALES_TALK = /\b(only ?fans|onlyfans|stars?|price|pay|paid|tip|tipping|unlock\w*|tap)\b/i;
export function cleanSendCaption(text: string): string {
  const dashless = stripBannedDashes(text.trim());
  const sentences = dashless.split(/(?<=[.!?]|\p{Extended_Pictographic})\s+/u).filter((part) => !SALES_TALK.test(part));
  return sentences.join(" ").trim() || dashless.replace(new RegExp(SALES_TALK.source, "gi"), "").replace(/ {2,}/g, " ").trim();
}

/** Derive flags from concrete observations so the model cannot independently
 * mark the same item nude, suggestive and non-NSFW. This validates model output;
 * it cannot guarantee that every visual observation is correct. */
export function normalizeMediaClassification(value: unknown): Caption {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid visual metadata");
  const j = value as Record<string, unknown>;
  const evidence = j.visual_evidence as Record<string, unknown> | undefined;
  if (!evidence || VISUAL_EVIDENCE_KEYS.some((key) => typeof evidence[key] !== "boolean")) {
    throw new Error("Visual metadata must include boolean evidence for every classification");
  }
  if (typeof j.caption !== "string" || !j.caption.trim() || typeof j.auto_desc !== "string" || !j.auto_desc.trim()) {
    throw new Error("Visual metadata needs factual descriptions");
  }
  const nude = evidence.nipples_visible === true || evidence.genitals_visible === true ||
    evidence.anus_visible === true || evidence.bare_buttocks_visible === true;
  const explicit = nude || evidence.sexual_activity_visible === true;
  if (evidence.full_nudity_visible && !nude) throw new Error("Full nudity requires visible uncovered anatomy");
  const description = `${j.caption} ${j.auto_desc}`;
  const unsupported: [boolean, RegExp][] = [
    [!evidence.nipples_visible, /\b(topless|tits|exposed breasts?|bare breasts?|uncovered breasts?|nipples?|areolas?)\b/i],
    [!evidence.genitals_visible, /\b(genitals?|vulva|vagina|pussy|penis)\b/i],
    [!evidence.anus_visible, /\b(anus|anal)\b/i],
    [!nude, /\b(nude|naked|nudity)\b/i],
    [!evidence.mirror_reflection_visible, /\bmirror\b/i],
    [!evidence.swimwear_visible, /\b(bikini|swimsuit|swimwear)\b/i],
    [!evidence.lingerie_visible, /\blingerie\b/i],
  ];
  if (unsupported.some(([absent, pattern]) => absent && pattern.test(description))) {
    throw new Error("Description claims a feature without visible evidence");
  }
  const requiredEvidence: Record<string, boolean> = {
    topless: evidence.nipples_visible === true,
    tits: evidence.nipples_visible === true,
    pussy: evidence.genitals_visible === true,
    anal: evidence.anus_visible === true,
    full_nude: evidence.full_nudity_visible === true && nude,
    bikini: evidence.swimwear_visible === true,
    lingerie: evidence.lingerie_visible === true,
    mirror_selfie: evidence.mirror_reflection_visible === true,
  };
  const tags = [...new Set((Array.isArray(j.tags) ? j.tags : []).filter(
    (tag): tag is string => typeof tag === "string" && TAG_SET.has(tag) && requiredEvidence[tag] !== false,
  ))];
  const suggestive = evidence.suggestive_pose_or_clothing || evidence.swimwear_visible || evidence.lingerie_visible;
  // visual_description deliberately states presence AND absence of nipples/
  // genitals/anus (per the prompt), so it is NOT run through the `unsupported`
  // claim check above: that check is caption/auto_desc-only and is blind to
  // negation, so "no nipples visible" would otherwise be flagged as an
  // invented claim. Dashes are stripped as a hard style rule (see
  // stripBannedDashes); a missing/blank value degrades to "" rather than
  // failing the whole upload, since analysis here is always best-effort.
  const visual_description = typeof j.visual_description === "string"
    ? stripBannedDashes(j.visual_description.trim())
    : "";
  return {
    caption: cleanSendCaption(j.caption),
    auto_desc: j.auto_desc.trim(),
    teaser_caption: typeof j.teaser_caption === "string" ? j.teaser_caption : "",
    visual_description,
    is_nude: nude,
    nsfw: explicit,
    explicitness: explicit ? "explicit" : suggestive ? "suggestive" : "none",
    tags,
  };
}
