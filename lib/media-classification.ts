import { MEDIA_TAGS } from "./pricing";
import type { Caption } from "./caption";

export const VISUAL_EVIDENCE_KEYS = [
  "nipples_visible", "genitals_visible", "anus_visible", "bare_buttocks_visible",
  "sexual_activity_visible", "full_nudity_visible", "swimwear_visible",
  "lingerie_visible", "mirror_reflection_visible", "suggestive_pose_or_clothing",
] as const;

export const MEDIA_CLASSIFICATION_PROMPT = `You are captioning a photo for an internal adult-content catalogue. Do two things: classify what is visibly present, then write the caption the person in the photo would post to a fan.

Return JSON with these fields:
- description: factual, max 24 words, only what is visibly present. Do not guess hidden clothing, anatomy, intent, or actions outside the frame.
- auto_desc: 2-5 factual words summarising the photo.
- caption: the creator's own caption for this exact photo. See CAPTION VOICE below.
- uncertainty: one short phrase naming anything unclear a human reviewer should double check (blurry, ambiguous framing, hard to tell an item apart, etc.), or "" if nothing is uncertain.
- tags: a subset of: ${MEDIA_TAGS.join(", ")}.
- visual_evidence: ALL of these keys with JSON boolean values: ${VISUAL_EVIDENCE_KEYS.join(", ")}.

VISUAL RULES (govern description, auto_desc, tags AND caption alike — every claim in every field must be visibly true in THIS photo):
- A value is true only when the feature is clearly visible. Covered, cropped, obscured or uncertain features are false. Describe visible clothing instead of guessing what is underneath.
- Cleavage, side cleavage, underboob, a low neckline, an open shirt, swimwear or lingerie do NOT by themselves prove nudity. nipples_visible requires a visibly uncovered nipple or areola, not a covered outline. A nipple hidden behind a shirt or bikini is not visible.
- An open white shirt with cleavage but covered nipples is described as "open white shirt". Never label that "topless", "nude", or "exposed breasts". Do not assume it is a bikini unless a bikini is actually visible.
- bare_buttocks_visible means clearly uncovered buttocks, not a swimsuit edge, a clothed shape or a small strip of skin. genitals_visible and anus_visible require the actual uncovered anatomy, not its covered outline.
- full_nudity_visible requires a clearly unclothed body, not a cropped neckline or one uncovered part. sexual_activity_visible requires a visible sexual act, not a facial expression or pose.
- Swimwear and lingerie are different garments. Do not label a bikini as lingerie. Use both only if two separate, clearly identifiable garments are visible.
- mirror_reflection_visible requires an actual visible mirror/reflection. A handheld selfie in a car is not a mirror selfie.
- Use topless/tits only for visibly uncovered nipples; pussy/anal only for clearly visible corresponding anatomy; full_nude only for visible full nudity. Never infer those tags from cleavage or the shape of clothed anatomy.
- For this catalogue, swimwear, lingerie, an open shirt showing cleavage or a suggestive pose can be suggestive without being nude or sexually explicit. Do not invent an age rating.
- description, auto_desc, tags and caption must all agree with visual_evidence. Keep the factual fields positive; do not add lists of absent anatomy or nudity disclaimers. Classification flags are derived by code, not by how much cleavage is visible.

CAPTION VOICE:
- First person, as if the person in the photo is describing it to a fan right now. Flirty and raunchy: highly NSFW and sexually explicit, specific to this exact photo. Never a generic or reusable line.
- One or two sentences. Keep the wording and sentence structure consistent from photo to photo (same kind of voice every time, not a different gimmick each caption).
- The physical details must match the photo: pose, body, clothing (or lack of it), toys, setting all come from "description" and "visual_evidence". Do not invent a location or an object that contradicts what's in the photo.
- Within that, the caption can go beyond the still frame: action, movement, sound (moaning) and a short build-up are allowed, in the same explicit style as the second reference example below, even where the frame itself only shows a moment of it.
- If a physical detail is genuinely unclear, leave it out of the caption rather than guessing, and name it in "uncertainty" instead.
- Never use an em dash (—) or an en dash (–) anywhere in the caption. Use a comma or a full stop instead.
- Style references, both examples are full style references for tone, vocabulary AND how far the action can go:
  "Looking right back at you lying on my stomach, with my hand grabbing around my ass, spreading it nice and wide for you. Does my pussy look good in this shot, Daddy?"
  "😈 Hey Babe I'm on my knees naked with my legs spread wide showing off my tits and trimmed pussy just for you, shoving this big dildo deep inside and riding it so hard from the front while moaning loud as fuck until I cum hard and pull it out dripping wet 💦💦"
  Match this level of explicitness and this kind of action/build-up, always anchored to the pose, body, clothing, toys and setting actually visible in THIS photo.`;

const TAG_SET = new Set<string>(MEDIA_TAGS);

// Owner rule: no em dash (—) or en dash (–) in a caption, ever. The prompt
// asks the model not to use one, but this is the backstop — never rely on
// the model alone for a hard style rule. Swaps each dash for a full stop when
// it sits between two clause-like chunks (capital letter follows), otherwise
// a comma, then collapses any doubled spaces / stray punctuation that leaves.
export function stripBannedDashes(text: string): string {
  const replaced = text.replace(/\s*[—–]\s*/g, (match, offset: number, str: string) => {
    const before = str.slice(0, offset).trimEnd();
    const after = str.slice(offset + match.length).trimStart();
    const newSentence = before.length > 0 && /^[A-Z]/.test(after) && !/[,;:]$/.test(before);
    return newSentence ? ". " : ", ";
  });
  return replaced
    .replace(/ {2,}/g, " ")
    .replace(/,\s*([.,!?])/g, "$1")
    .trim();
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
  // `description` is the new factual field written alongside the flirty
  // `caption`. Older callers/tests that only ever supplied `caption` still
  // work: it doubles as the factual text when `description` is absent.
  const factualDescription = typeof j.description === "string" && j.description.trim()
    ? j.description.trim()
    : j.caption.trim();
  const uncertainty = typeof j.uncertainty === "string" ? j.uncertainty.trim() : "";
  const nude = evidence.nipples_visible === true || evidence.genitals_visible === true ||
    evidence.anus_visible === true || evidence.bare_buttocks_visible === true;
  const explicit = nude || evidence.sexual_activity_visible === true;
  if (evidence.full_nudity_visible && !nude) throw new Error("Full nudity requires visible uncovered anatomy");
  // Validate BOTH the factual description and the flirty caption against the
  // evidence: the caption must not invent a feature the photo doesn't show either.
  const combinedText = `${factualDescription} ${j.caption} ${j.auto_desc}`;
  const unsupported: [boolean, RegExp][] = [
    [!evidence.nipples_visible, /\b(topless|tits|exposed breasts?|bare breasts?|uncovered breasts?|nipples?|areolas?)\b/i],
    [!evidence.genitals_visible, /\b(genitals?|vulva|vagina|pussy|penis)\b/i],
    [!evidence.anus_visible, /\b(anus|anal)\b/i],
    [!nude, /\b(nude|naked|nudity)\b/i],
    [!evidence.mirror_reflection_visible, /\bmirror\b/i],
    [!evidence.swimwear_visible, /\b(bikini|swimsuit|swimwear)\b/i],
    [!evidence.lingerie_visible, /\blingerie\b/i],
  ];
  if (unsupported.some(([absent, pattern]) => absent && pattern.test(combinedText))) {
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
    caption: stripBannedDashes(j.caption.trim()),
    auto_desc: j.auto_desc.trim(),
    teaser_caption: typeof j.teaser_caption === "string" ? j.teaser_caption : "",
    description: factualDescription,
    uncertainty,
    is_nude: nude,
    nsfw: explicit,
    explicitness: explicit ? "explicit" : suggestive ? "suggestive" : "none",
    tags,
  };
}
