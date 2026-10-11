import { MEDIA_TAGS } from "./pricing";
import { ANALYSIS_VERSION, FACT_KEYS, type AnalysisFields, type FactKey, type Tri, type VisualFacts } from "./media-analysis-contract";

// ONE observation set per item: a tri-state answer for every FACT_KEY plus a list of short `visible` phrases. Every stored
// field (tags, is_nude/nsfw/explicitness, auto_desc, visual_description) is DERIVED from it by code, so the model can never
// produce a description, tags and flags that disagree. Only "yes" is ever a fact about the item: "no" and "unclear" never
// make a tag or a flag. The promotional send caption is NOT written here (see lib/send-caption.ts).

export { ANALYSIS_VERSION, FACT_KEYS };

/** The anatomy keys whose "unclear" answer must never read as "clean". */
export const NUDITY_KEYS: readonly FactKey[] = ["nipples", "genitals", "anus", "bare_buttocks"];

const OBSERVATION_TASK = `You are cataloguing media for an internal database. Report only what is visibly present. This is an observation task: do not write marketing copy, captions, flirting or opinions.
Return JSON with exactly these keys: evidence, identifying, details, short_label, visible, tags.

evidence: an object with ALL these keys, each "yes", "no" or "unclear": ${FACT_KEYS.join(", ")}.
- "yes": clearly visible, uncovered, unmistakable.
- "no": that part of the body, garment or object would be in frame and is plainly not there, or is plainly covered.
- "unclear": cropped out, hidden, blurred, too small, ambiguous or only guessed. Never answer "no" for something you cannot actually see; never answer "yes" for something you infer.
- nipples needs a visibly uncovered nipple or areola. Cleavage, underboob, a low neckline, an open shirt, a covered outline or a hand over the breasts is "no". genitals and anus need the actual uncovered anatomy, not its covered outline. bare_buttocks needs clearly uncovered buttocks, not a swimsuit edge or a clothed shape. Check every body part that is in frame before answering.
- full_nudity needs a clearly unclothed body. sexual_activity needs a visible sexual act or a toy in use, not a pose or an expression. sex_toy needs a visible sex toy.
- swimwear and lingerie are different garments; use both only if two separate garments are visible. mirror_reflection needs an actual visible mirror or reflection; a handheld selfie is not one.
- suggestive_pose: a provocative pose or clothing, with no uncovered anatomy required.

identifying: ONE factual sentence, at most 140 characters, that identifies this exact item: the woman (hair, build), the main garment or its absence, and the pose or setting. It is used as the label for this item in later conversation, so it must be specific. Example: "A blonde woman in a grey sweatshirt and sweatpants takes a mirror selfie on a wooden floor."
details: 1 to 4 more factual sentences, at most 420 characters: clothing and colours, objects and their state, camera angle, facial expression, setting. Say what is in frame, not what is absent: the evidence object already records absence. Do not infer anything hidden, and do not describe movement or intent that a still cannot show (no "is sliding", "about to", "teasing"); describe the pose and visible state instead.
short_label: 2 to 5 factual words, for example "grey sweatshirt mirror selfie".
visible: array of up to 10 short phrases (garment with colour, setting, objects, pose), each confirmed visible.
tags: array that is a subset of: ${MEDIA_TAGS.join(", ")}. Use topless/tits only when nipples is yes, pussy only when genitals is yes, anal only when anus is yes, ass only when bare_buttocks is yes, full_nude only when full_nudity is yes, bikini only when swimwear is yes, lingerie only when lingerie is yes, mirror_selfie only when mirror_reflection is yes. bed, pool, shower and outdoor only when she is on, in or at that place, not when it is only in the background.
Never claim a body part, act, garment, toy or mirror whose evidence key is not "yes".`;

export const MEDIA_CLASSIFICATION_PROMPT = `${OBSERVATION_TASK}
This is a single photo.`;

/** Video variant: ONE contact sheet of N frames tiled in order, so the model sees separate frames and never the motion. */
export function videoClassificationPrompt(frames: number): string {
  return `${OBSERVATION_TASK}
The image is a contact sheet of ${frames} separate frames sampled at even intervals from ONE video clip, tiled left to right, top to bottom. You are NOT seeing the whole clip, only these still frames. Describe only what these frames show. A key is "yes" if any frame clearly shows it. Answer "no" only if the frames show that part of the body or garment in frame and plainly absent or covered in every frame; otherwise "unclear". Make no claims about motion, actions between frames, what happens before, after or throughout the clip, or what the clip is "doing". Do not use words like "then", "later", "throughout" or "continues".`;
}

const TAG_SET = new Set<string>(MEDIA_TAGS);
const TRI = new Set<string>(["yes", "no", "unclear"]);

// Owner rule: no em dash or en dash in descriptions, ever. The prompt asks the model not to use one, but this is the
// backstop; never rely on the model alone for a hard style rule.
export function stripBannedDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/ {2,}/g, " ")
    .replace(/,\s*([.,!?])/g, "$1")
    .trim();
}

// The stored send caption rides on timed, campaign and catalogue sends, which can be free or locked, so it must never talk
// about paying. Sentences that do are dropped.
const SALES_TALK = /\b(only ?fans|onlyfans|stars?|price|pay|paid|tip|tipping|unlock\w*|tap)\b/i;
export function cleanSendCaption(text: string): string {
  const dashless = stripBannedDashes(text.trim());
  const sentences = dashless.split(/(?<=[.!?]|\p{Extended_Pictographic})\s+/u).filter((part) => !SALES_TALK.test(part));
  return sentences.join(" ").trim() || dashless.replace(new RegExp(SALES_TALK.source, "gi"), "").replace(/ {2,}/g, " ").trim();
}

// ---- claim checking ---------------------------------------------------------------------------------------------------
// A clause that denies, covers or hides something is not an affirmative claim about it.
const NEGATED = /\b(no|not|nor|neither|never|none|nothing|without|isn'?t|aren'?t|cannot|can'?t|covered|covering|covers|hidden|hides|hiding|obscured|blocked|out of frame|off[- ]camera|cropped)\b/i;
const CLAUSE_SPLIT = /[,;:]|\.\s|\s(?:but|and|so|while|though|although|as)\s/i;

/** Affirmative clauses only: negated, covered or hidden clauses are dropped so "nipples are not visible" is never read as a claim. */
export function affirmativeClauses(text: string): string[] {
  return text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter((c) => c && !NEGATED.test(c));
}

// Words that describe motion or intent (a still shows neither) and clip-wide narration (a few frames cannot support it).
const MOTION = /\b(is|are|was|were)\s+(moving|sliding|rubbing|stroking|thrusting|bouncing|dancing|walking|running|jumping|touching herself|teasing|pleasuring|grinding|twerking|swaying|waving)\b|\b(about to|going to|starts? to|begins? to|just (?:took|put|pulled|finished))\b|\bin motion\b/i;
const CLIP_NARRATION = /\b(throughout|the whole (?:video|clip)|entire (?:video|clip)|then|later|afterwards?|eventually|continues?)\b/i;

/** Pure: problems in one block of descriptive text against the evidence it must agree with. Only "yes" licenses a claim. */
export function descriptionProblems(text: string, ev: Record<FactKey, Tri>, video = false): string[] {
  const problems: string[] = [];
  const nude = ev.nipples === "yes" || ev.genitals === "yes" || ev.anus === "yes" || ev.bare_buttocks === "yes" || ev.full_nudity === "yes";
  const rules: [boolean, RegExp, string][] = [
    [ev.nipples !== "yes", /\b(topless|tits|exposed (?:breasts?|chest)|bare (?:breasts?|chest)|uncovered (?:breasts?|chest)|nipples?|areolas?)\b/i, "breasts/nipples"],
    [ev.genitals !== "yes", /\b(genitals?|genitalia|vulva|vagina|pussy|penis|labia)\b/i, "genitals"],
    [ev.anus !== "yes", /\b(anus|anal|asshole)\b/i, "anus"],
    [ev.bare_buttocks !== "yes" && ev.genitals !== "yes" && ev.anus !== "yes", /\b(bare|naked|uncovered|exposed) (?:buttocks?|ass|bum|butt)\b/i, "bare buttocks"],
    [!nude, /\b(nude|naked|nudity|unclothed|undressed)\b/i, "nudity"],
    [ev.mirror_reflection !== "yes", /\bmirror\b/i, "mirror"],
    [ev.swimwear !== "yes", /\b(bikini|swimsuit|swimwear|swim ?suit)\b/i, "swimwear"],
    [ev.lingerie !== "yes", /\b(lingerie|thong|negligee|bodysuit)\b/i, "lingerie"],
    [ev.sex_toy !== "yes", /\b(vibrator|dildo|sex toy|butt plug|toy)\b/i, "sex toy"],
    [ev.sexual_activity !== "yes", /\b(masturbat\w+|penetrat\w+|having sex|fingering|sex act|oral sex|blowjob|handjob)\b/i, "sexual act"],
  ];
  for (const clause of affirmativeClauses(text)) {
    for (const [absent, pattern, label] of rules) {
      if (absent && pattern.test(clause)) problems.push(`claims ${label} without a "yes" observation: "${clause.slice(0, 80)}"`);
    }
  }
  if (MOTION.test(text)) problems.push("describes motion or intent a still cannot show");
  if (video && CLIP_NARRATION.test(text)) problems.push("describes the clip beyond the sampled frames");
  return [...new Set(problems)];
}

function tri(value: unknown): Tri | null {
  if (value === "unsure") return "unclear";
  return typeof value === "string" && TRI.has(value) ? (value as Tri) : null;
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
  const m = t.slice(0, max + 1).match(/^.*[.!?](?=\s)/);
  return m ? m[0] : t.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:]+$/, "") + ".";
}

const ANATOMY_LABEL: [FactKey, string][] = [
  ["nipples", "nipples"], ["genitals", "genitals"], ["anus", "anus"], ["bare_buttocks", "bare buttocks"],
];

/** The optional final line, built by code: the anatomy the observer plainly saw absent or covered. */
export function notVisibleLine(ev: Record<FactKey, Tri>): string {
  const no = ANATOMY_LABEL.filter(([k]) => ev[k] === "no").map(([, l]) => l);
  return no.length ? `Not visible: ${no.join(", ")}.` : "";
}

// Tags that a "yes" observation licenses, and the ones the model may add only if their key is "yes".
const TAGS_FROM_YES: [FactKey, string[]][] = [
  ["nipples", ["topless", "tits"]], ["genitals", ["pussy"]], ["anus", ["anal"]], ["bare_buttocks", ["ass"]],
  ["swimwear", ["bikini"]], ["lingerie", ["lingerie"]], ["mirror_reflection", ["mirror_selfie"]],
];

export type NormalizeOptions = { frames?: number };
export type NormalizedMedia = {
  fields: Omit<AnalysisFields, "caption">;
  status: "analysed" | "needs_review";
  /** Prose that contradicts the evidence. The caller retries once; if it survives, the fields hold a facts-only fallback and status is needs_review. */
  contradictions: string[];
  /** Other reasons for needs_review (unclear nudity). */
  issues: string[];
};

/** Validate the observations and derive every stored field from them. Throws on a malformed answer (the caller retries).
 * It checks internal consistency; it cannot prove an observation matches the pixels. */
export function normalizeMediaClassification(value: unknown, opts: NormalizeOptions = {}): NormalizedMedia {
  const video = opts.frames !== undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid visual metadata");
  const j = value as Record<string, unknown>;
  const raw = j.evidence as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") throw new Error("Visual metadata must include an evidence value for every key");
  const evidence = {} as Record<FactKey, Tri>;
  for (const key of FACT_KEYS) {
    const t = tri(raw[key]);
    if (!t) throw new Error("Visual metadata must include an evidence value for every key");
    evidence[key] = t;
  }
  if (typeof j.identifying !== "string" || !j.identifying.trim() || typeof j.short_label !== "string" || !j.short_label.trim()) {
    throw new Error("Visual metadata needs factual descriptions");
  }

  const nude = evidence.nipples === "yes" || evidence.genitals === "yes" || evidence.anus === "yes" ||
    evidence.bare_buttocks === "yes" || evidence.full_nudity === "yes";
  const explicit = nude || evidence.sexual_activity === "yes";
  const unclear = NUDITY_KEYS.filter((k) => evidence[k] === "unclear");
  const suggestive = evidence.suggestive_pose === "yes" || evidence.swimwear === "yes" || evidence.lingerie === "yes" ||
    evidence.sex_toy === "yes" || unclear.length > 0; // unclear nudity must never read as "none"

  let identifying = sentencesUpTo(stripBannedDashes(j.identifying.trim()), 140);
  let details = sentencesUpTo(stripBannedDashes(typeof j.details === "string" ? j.details.trim() : ""), 420);
  let autoDesc = stripBannedDashes(j.short_label.trim()).slice(0, 60);
  let visible = cleanList(j.visible, 10);

  const contradictions = [
    ...descriptionProblems(`${identifying} ${details}`, evidence, video),
    ...descriptionProblems(autoDesc, evidence, video),
    ...descriptionProblems(visible.join(". "), evidence, video),
  ];
  const contradicted = contradictions.length > 0;
  if (contradicted) {
    // Facts-only fallback: keep only phrases that pass, never the contradicted prose.
    visible = visible.filter((p) => descriptionProblems(p, evidence, video).length === 0);
    identifying = visible.length ? sentencesUpTo(`Shows ${visible.join(", ")}.`, 140) : "Description needs review.";
    details = "";
    autoDesc = visible[0]?.slice(0, 60) || "needs review";
  }

  const proposed = (Array.isArray(j.tags) ? j.tags : []).filter((t): t is string => typeof t === "string" && TAG_SET.has(t));
  const licensed = new Set<string>(TAGS_FROM_YES.filter(([k]) => evidence[k] === "yes").flatMap(([, t]) => t));
  const needsEvidence = new Set<string>(TAGS_FROM_YES.flatMap(([, t]) => t));
  if (evidence.full_nudity === "yes" && nude) licensed.add("full_nude");
  needsEvidence.add("full_nude");
  const tags = [...new Set([...proposed.filter((t) => !needsEvidence.has(t)), ...licensed])];

  const tail = [video ? `Based on ${opts.frames} sampled frames.` : "", notVisibleLine(evidence)].filter(Boolean);
  const visual_description = [identifying, details, ...tail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const facts: VisualFacts = { v: ANALYSIS_VERSION, evidence, visible, ...(video ? { frames: opts.frames } : {}) };
  const issues = unclear.length ? [`unclear: ${unclear.join(", ")}`] : [];
  return {
    fields: {
      auto_desc: autoDesc,
      tags,
      visual_description,
      visual_facts: facts,
      explicitness: explicit ? "explicit" : suggestive ? "suggestive" : "none",
      is_nude: nude,
      nsfw: explicit,
    },
    status: contradicted || unclear.length ? "needs_review" : "analysed",
    contradictions,
    issues,
  };
}
