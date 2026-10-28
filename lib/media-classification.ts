import { MEDIA_TAGS } from "./pricing";
import type { Caption } from "./caption";

// ONE authoritative set of observations per image. Everything else the catalogue stores about a still
// (description, tags, nudity/explicitness flags) is DERIVED from it by code in normalizeMediaClassification,
// so the model can never produce a description, a tag list and a classification that disagree.
//
// Each feature is tri-state: "yes" (clearly visible), "no" (the area is in frame and the feature is plainly not there)
// or "unsure" (cropped, covered, obscured, too small, ambiguous). Only "yes" is ever treated as a fact about the item.

/** Processing version of this prompt + validator. Bump when either changes: the repair batch reprocesses lower versions. */
export const ANALYSIS_VERSION = 2;

export const VISUAL_EVIDENCE_KEYS = [
  "nipples_visible", "genitals_visible", "anus_visible", "bare_buttocks_visible",
  "sexual_activity_visible", "full_nudity_visible", "swimwear_visible",
  "lingerie_visible", "mirror_reflection_visible", "suggestive_pose_or_clothing",
] as const;
export type VisualFeature = (typeof VISUAL_EVIDENCE_KEYS)[number];
export type Presence = "yes" | "no" | "unsure";
export type VisualFeatures = Record<VisualFeature, Presence>;

/** The anatomy/nudity features whose absence of an answer must never read as "SFW". */
export const NUDITY_FEATURES: readonly VisualFeature[] = [
  "nipples_visible", "genitals_visible", "anus_visible", "bare_buttocks_visible",
];

export type VisualFacts = {
  features: VisualFeatures;
  summary: string;     // one sentence, identifies the item: subject, garment, pose (also the history label in V2)
  details: string;     // 1-4 further factual sentences
  clothing: string[];
  objects: string[];
  setting: string;
  scope: "still" | "sampled_frames"; // sampled_frames = a clip seen only through N frames: absence can never be established
  frames?: number;
};

export const MEDIA_CLASSIFICATION_PROMPT = `You are cataloguing an image for an internal media database. Report only what is visibly present. This is an observation task: do not write marketing copy, captions, flirting or opinions.
Return JSON with exactly these keys: features, summary, details, short_label, clothing, objects, setting, tags.

features: an object with ALL these keys, each "yes", "no" or "unsure": ${VISUAL_EVIDENCE_KEYS.join(", ")}.
- "yes": clearly visible, uncovered, unmistakable.
- "no": that part of the body or that garment would be in frame and is plainly not there or plainly covered.
- "unsure": cropped out, hidden, blurred, too small, ambiguous or only guessed. Never answer "no" for something you cannot actually see; never answer "yes" for something you infer.
- nipples_visible needs a visibly uncovered nipple or areola. Cleavage, underboob, a low neckline, an open shirt, a covered outline or a hand over the breasts is "no". genitals_visible and anus_visible need the actual uncovered anatomy, not its covered outline. bare_buttocks_visible needs clearly uncovered buttocks, not a swimsuit edge or clothed shape. Look carefully at every body part in frame before answering.
- full_nudity_visible needs a clearly unclothed body. sexual_activity_visible needs a visible sexual act or object use, not a pose or expression.
- swimwear_visible and lingerie_visible are different garments; use both only if two separate garments are visible. mirror_reflection_visible needs an actual visible mirror or reflection; a handheld selfie is not one.
- suggestive_pose_or_clothing: a pose or clothing that is provocative without any uncovered anatomy.

summary: ONE factual sentence, at most 140 characters, that identifies this exact image: who (hair, build), the main garment or its absence, and the pose or action. Example: "A blonde woman in a grey sweatshirt and sweatpants takes a mirror selfie on a wooden floor."
details: 1 to 4 more factual sentences: clothing and colours, objects and what they are doing, camera angle, facial expression, setting. At most 420 characters.
- Describe each thing once, from what is in the image. State what is in frame, not what is absent. Do not list body parts that are not visible and do not write disclaimers about nudity: the features object already records that.
- A still image shows no movement. Describe the pose and the visible state of things ("her hand rests on", "the sweatshirt is pulled up"), never motion or intent ("is sliding", "about to", "teasing").
- Never claim a body part, act, garment or mirror that the matching feature is not "yes" for.
short_label: 2 to 5 factual words, for example "grey sweatshirt mirror selfie".
clothing: array of short phrases for each garment or accessory, with its colour and state.
objects: array of other objects that matter (toys, props, furniture she is on), each with what it is doing. Background decor is not listed.
setting: where she is, a few words.
tags: array that is a subset of: ${MEDIA_TAGS.join(", ")}. Use topless/tits only when nipples_visible is yes, pussy only when genitals_visible is yes, anal only when anus_visible is yes, full_nude only when full_nudity_visible is yes, bikini only when swimwear_visible is yes, lingerie only when lingerie_visible is yes, mirror_selfie only when mirror_reflection_visible is yes. bed, pool, shower and outdoor only when she is on, in or at that place, not when it is only in the background.`;

/** Clip variant: the same fields, but the model only sees a handful of frames. */
export const VIDEO_CLASSIFICATION_PROMPT = `${MEDIA_CLASSIFICATION_PROMPT}
These images are N frames sampled in order from ONE video clip. You are NOT seeing the whole clip. Describe only what these frames show, as "in the sampled frames ...". A feature is "yes" if any frame clearly shows it. Never answer "no" for the clip as a whole: something absent from the frames may happen between them, so answer "unsure" for anything not shown. Do not describe what happens between frames and do not infer actions that are not in a frame.`;

const TAG_SET = new Set<string>(MEDIA_TAGS);
const PRESENCE = new Set<string>(["yes", "no", "unsure"]);

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

// ---- claim checking -------------------------------------------------------------------------------------------------
// A clause that denies, covers or hides something is not an affirmative claim about it.
const NEGATED = /\b(no|not|nor|neither|never|none|nothing|without|isn'?t|aren'?t|cannot|can'?t|covered|covering|covers|hidden|hides|hiding|obscured|blocked|out of frame|off[- ]camera|cropped)\b/i;
const CLAUSE_SPLIT = /[,;:]|\.\s|\s(?:but|and|so|while|though|although|as)\s/i;

/** Affirmative clauses only: negated, covered or hidden clauses are dropped so "her nipples are not visible" is never read as a claim. */
export function affirmativeClauses(text: string): string[] {
  return text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter((c) => c && !NEGATED.test(c));
}

// Words that describe motion or intent: a still image cannot show them.
const MOTION = /\b(is|are|was|were)\s+(moving|sliding|rubbing|stroking|thrusting|bouncing|dancing|walking|running|jumping|touching herself|teasing|pleasuring|grinding|twerking|swaying|waving)\b|\b(about to|going to|starts? to|begins? to|just (?:took|put|pulled|finished))\b|\bin motion\b/i;

/** Pure: returns the list of problems in one block of descriptive text against the features it must agree with. */
export function descriptionProblems(text: string, f: VisualFeatures, scope: "still" | "sampled_frames" = "still"): string[] {
  const problems: string[] = [];
  const nude = f.nipples_visible === "yes" || f.genitals_visible === "yes" || f.anus_visible === "yes" || f.bare_buttocks_visible === "yes";
  const rules: [boolean, RegExp, string][] = [
    [f.nipples_visible !== "yes", /\b(topless|tits|exposed (?:breasts?|chest)|bare (?:breasts?|chest)|uncovered (?:breasts?|chest)|nipples?|areolas?)\b/i, "breasts/nipples"],
    [f.genitals_visible !== "yes", /\b(genitals?|genitalia|vulva|vagina|pussy|penis|labia)\b/i, "genitals"],
    [f.anus_visible !== "yes", /\b(anus|anal|asshole)\b/i, "anus"],
    [f.bare_buttocks_visible !== "yes" && f.genitals_visible !== "yes" && f.anus_visible !== "yes", /\b(bare|naked|uncovered|exposed) (?:buttocks?|ass|bum|butt)\b/i, "bare buttocks"],
    [!nude, /\b(nude|naked|nudity|unclothed|undressed)\b/i, "nudity"],
    [f.mirror_reflection_visible !== "yes", /\bmirror\b/i, "mirror"],
    [f.swimwear_visible !== "yes", /\b(bikini|swimsuit|swimwear|swim ?suit)\b/i, "swimwear"],
    [f.lingerie_visible !== "yes", /\b(lingerie|thong|negligee|bodysuit)\b/i, "lingerie"],
    [f.sexual_activity_visible !== "yes", /\b(masturbat\w+|penetrat\w+|having sex|fingering|sex act|oral sex|blowjob|handjob)\b/i, "sexual act"],
  ];
  const clauses = affirmativeClauses(text);
  for (const clause of clauses) {
    for (const [absent, pattern, label] of rules) {
      if (absent && pattern.test(clause)) problems.push(`claims ${label} without a "yes" observation: "${clause.slice(0, 80)}"`);
    }
  }
  if (MOTION.test(text)) problems.push("describes motion or intent a still cannot show");
  if (scope === "sampled_frames" && /\b(throughout|the whole (?:video|clip)|entire (?:video|clip)|then|later|afterwards?|eventually)\b/i.test(text)) {
    problems.push("describes the clip beyond the sampled frames");
  }
  return [...new Set(problems)];
}

function presence(value: unknown): Presence | null {
  if (value === true) return "yes";       // legacy boolean evidence
  if (value === false) return "no";
  return typeof value === "string" && PRESENCE.has(value) ? (value as Presence) : null;
}

function cleanList(value: unknown, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => stripBannedDashes(x.trim()).slice(0, 80))
    .slice(0, max);
}

/** Whole sentences up to `max` characters. */
function sentencesUpTo(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const m = head.match(/^.*[.!?](?=\s)/);
  return m ? m[0] : head.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:]+$/, "") + ".";
}

const ANATOMY_LABEL: [VisualFeature, string][] = [
  ["nipples_visible", "nipples"], ["genitals_visible", "genitals"], ["anus_visible", "anus"], ["bare_buttocks_visible", "bare buttocks"],
];

/** The status sentence appended by code: confirmed, absent and unclear anatomy, each stated once, in a fixed shape. */
export function anatomyStatus(f: VisualFeatures, scope: "still" | "sampled_frames" = "still"): string {
  const yes = ANATOMY_LABEL.filter(([k]) => f[k] === "yes").map(([, l]) => l);
  const no = scope === "still" ? ANATOMY_LABEL.filter(([k]) => f[k] === "no").map(([, l]) => l) : [];
  const unsure = ANATOMY_LABEL.filter(([k]) => f[k] === "unsure" || (scope !== "still" && f[k] === "no")).map(([, l]) => l);
  const parts: string[] = [];
  if (yes.length) parts.push(`Visible: ${yes.join(", ")}.`);
  if (no.length) parts.push(`Not visible: ${no.join(", ")}.`);
  if (unsure.length) parts.push(`Unclear: ${unsure.join(", ")}.`);
  return parts.join(" ");
}

export type NormalizeOptions = { scope?: "still" | "sampled_frames"; frames?: number };
export type NormalizedMedia = Caption & { facts: VisualFacts; status: "ok" | "review"; issues: string[] };

/** Validate the model's observations and derive every stored field from them. Throws on anything unusable or
 * self-contradictory so the caller's bounded retry can run. It validates internal consistency; it cannot prove that
 * an observation matches the pixels. */
export function normalizeMediaClassification(value: unknown, opts: NormalizeOptions = {}): NormalizedMedia {
  const scope = opts.scope ?? "still";
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid visual metadata");
  const j = value as Record<string, unknown>;
  const raw = (j.features ?? j.visual_evidence) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") throw new Error("Visual metadata must include boolean evidence for every classification");
  const features = {} as VisualFeatures;
  for (const key of VISUAL_EVIDENCE_KEYS) {
    const p = presence(raw[key]);
    if (!p) throw new Error("Visual metadata must include boolean evidence for every classification");
    // A clip is seen through a few frames: "no" can never be established for it, only "yes" or "unsure".
    features[key] = scope === "sampled_frames" && p === "no" ? "unsure" : p;
  }
  const summarySource = typeof j.summary === "string" ? j.summary : typeof j.caption === "string" ? j.caption : "";
  const shortSource = typeof j.short_label === "string" ? j.short_label : typeof j.auto_desc === "string" ? j.auto_desc : "";
  if (!summarySource.trim() || !shortSource.trim()) throw new Error("Visual metadata needs factual descriptions");

  const nude = features.nipples_visible === "yes" || features.genitals_visible === "yes" ||
    features.anus_visible === "yes" || features.bare_buttocks_visible === "yes";
  if (features.full_nudity_visible === "yes" && !nude) throw new Error("Full nudity requires visible uncovered anatomy");

  const summary = sentencesUpTo(stripBannedDashes(summarySource.trim()), 140);
  const details = sentencesUpTo(stripBannedDashes(typeof j.details === "string" ? j.details.trim() : ""), 420);
  const autoDesc = stripBannedDashes(shortSource.trim()).slice(0, 60);
  const clothing = cleanList(j.clothing, 8);
  const objects = cleanList(j.objects, 6);
  const setting = typeof j.setting === "string" ? stripBannedDashes(j.setting.trim()).slice(0, 80) : "";

  const issues = [
    ...descriptionProblems(`${summary} ${details}`, features, scope),
    ...descriptionProblems(autoDesc, features, scope),
    ...descriptionProblems([...clothing, ...objects, setting].join(". "), features, scope),
  ];
  if (issues.length) throw new Error(`Description claims a feature without visible evidence: ${issues[0]}`);

  const requiredEvidence: Record<string, boolean> = {
    topless: features.nipples_visible === "yes",
    tits: features.nipples_visible === "yes",
    pussy: features.genitals_visible === "yes",
    anal: features.anus_visible === "yes",
    full_nude: features.full_nudity_visible === "yes" && nude,
    bikini: features.swimwear_visible === "yes",
    lingerie: features.lingerie_visible === "yes",
    mirror_selfie: features.mirror_reflection_visible === "yes",
  };
  const proposed = (Array.isArray(j.tags) ? j.tags : []).filter((t): t is string => typeof t === "string" && TAG_SET.has(t));
  // Tags are the confirmed observations plus the model's scene/body tags that the observations allow.
  const derived: string[] = [];
  if (requiredEvidence.topless) derived.push("topless");
  if (requiredEvidence.pussy) derived.push("pussy");
  if (requiredEvidence.anal) derived.push("anal");
  if (requiredEvidence.full_nude) derived.push("full_nude");
  if (requiredEvidence.bikini) derived.push("bikini");
  if (requiredEvidence.lingerie) derived.push("lingerie");
  if (requiredEvidence.mirror_selfie) derived.push("mirror_selfie");
  const tags = [...new Set([...proposed.filter((t) => requiredEvidence[t] !== false), ...derived])];

  const unresolved = NUDITY_FEATURES.filter((k) => features[k] === "unsure");
  const explicit = nude || features.sexual_activity_visible === "yes";
  const suggestive = features.suggestive_pose_or_clothing === "yes" || features.swimwear_visible === "yes" ||
    features.lingerie_visible === "yes" || unresolved.length > 0;
  const status: "ok" | "review" = scope === "still" && unresolved.length > 0 ? "review" : "ok";

  const prefix = scope === "sampled_frames" && !/sampled frames?/i.test(summary) ? "In the sampled frames: " : "";
  const visual_description = [`${prefix}${summary}`, details, anatomyStatus(features, scope)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return {
    caption: "",               // written from the facts by the caption step (lib/caption.ts), never by this observation call
    auto_desc: autoDesc,
    teaser_caption: "",
    visual_description,
    is_nude: nude,
    nsfw: explicit,
    explicitness: explicit ? "explicit" : suggestive ? "suggestive" : "none",
    tags,
    facts: { features, summary, details, clothing, objects, setting, scope, ...(opts.frames ? { frames: opts.frames } : {}) },
    status,
    issues: status === "review" ? [`unresolved: ${unresolved.join(", ")}`] : [],
  };
}
