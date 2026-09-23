import { MEDIA_TAGS } from "./pricing";
import type { Caption } from "./caption";

export const VISUAL_EVIDENCE_KEYS = [
  "nipples_visible", "genitals_visible", "anus_visible", "bare_buttocks_visible",
  "sexual_activity_visible", "full_nudity_visible", "swimwear_visible",
  "lingerie_visible", "mirror_reflection_visible", "suggestive_pose_or_clothing",
] as const;

export const MEDIA_CLASSIFICATION_PROMPT = `Describe only what is visibly present in this image for an internal media catalogue. Do not guess hidden clothing, anatomy, intent, or actions outside the frame.
Return JSON with caption (factual, max 24 words), auto_desc (2-5 factual words), teaser_caption (a brief non-explicit first-person line for legacy callers), tags, and visual_evidence.
tags must be a subset of: ${MEDIA_TAGS.join(", ")}.
visual_evidence must contain ALL these keys with JSON boolean values: ${VISUAL_EVIDENCE_KEYS.join(", ")}.

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
- caption, auto_desc and tags must agree with visual_evidence. Keep descriptions positive and factual; do not add lists of absent anatomy or nudity disclaimers. Classification flags are derived by code, not by how much cleavage is visible.`;

const TAG_SET = new Set<string>(MEDIA_TAGS);

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
  return {
    caption: j.caption.trim(),
    auto_desc: j.auto_desc.trim(),
    teaser_caption: typeof j.teaser_caption === "string" ? j.teaser_caption : "",
    is_nude: nude,
    nsfw: explicit,
    explicitness: explicit ? "explicit" : suggestive ? "suggestive" : "none",
    tags,
  };
}
