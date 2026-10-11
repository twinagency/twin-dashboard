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
- nipples needs a visibly uncovered nipple or areola. Cleavage, underboob, a low neckline, an open shirt or a covered outline is "no". A hand, arm or fabric over the breasts is "no" when it covers the nipple and areola, and so is a lifted top that shows only the underside or lower curve of the breast. Answer "yes" only when the nipple or areola itself (the darker disc) can be seen, for example around or between the fingers or above a pulled-down cup. Judge each breast separately.
- genitals and anus need the actual uncovered anatomy, not its covered outline. anus is "yes" only when the anal opening itself can be seen; buttocks, a spread pose or a rear view alone are not enough. Never write that the anus is not visible while answering "yes".
- bare_buttocks is "yes" only when NO garment covers the buttocks (nothing worn, or the garment is pulled down or aside). A thong, G-string, bikini bottom, briefs or other underwear that is worn counts as covering them even when the cheeks are mostly visible from behind: answer "no" and name the garment in visible. Check every body part that is in frame before answering.
- full_nudity needs a clearly unclothed body: if ANY garment (a top bunched on the torso, a skirt, shorts, a bikini piece, a robe) is on the torso or lower body in the frame, full_nudity is "no" and the garment goes in visible. sexual_activity needs a visible sexual act or a toy in use, not a pose or an expression. sex_toy needs a visible sex toy.
- swimwear and lingerie are different garments; use both only if two separate garments are visible. mirror_reflection is "yes" when a mirror or reflective surface is visible and she or her phone is seen in it, including a person photographing herself in a mirror with the phone visible in the reflection. A selfie taken directly at arm's length with no mirror in frame is "no".
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
The image is a contact sheet of ${frames} separate frames sampled at even intervals from ONE video clip, tiled left to right, top to bottom. You are NOT seeing the whole clip, only these still frames. Describe only what these frames show. A key is "yes" if any frame clearly shows it. genitals and anus are "yes" only if the skin or opening itself is plainly seen uncovered in at least one frame; a nude body seen from a distance, a blur, a hand over the area, or a garment that could be pulled aside is not enough. A garment in view forbids full_nudity "yes" and words like "unclothed". Answer "no" only if the frames show that part of the body or garment in frame and plainly absent or covered in every frame; otherwise "unclear". Make no claims about motion, actions between frames, what happens before, after or throughout the clip, or what the clip is "doing". Do not use words like "then", "later", "throughout", "continues" or "static", and do not describe what the camera does.`;
}

// ---- video second look -------------------------------------------------------------------------------------------------
// A contact sheet makes any-frame-yes cheap, which over-claims the keys with the worst cost of being wrong. When one of the
// TRIGGER keys is "yes", ONE more call re-asks only the keys that were yes; whatever is not re-confirmed becomes "unclear".
export const SECOND_LOOK_TRIGGERS = ["genitals", "anus", "sexual_activity", "sex_toy"] as const satisfies readonly FactKey[];
export const SECOND_LOOK_KEYS = [...SECOND_LOOK_TRIGGERS, "full_nudity"] as const satisfies readonly FactKey[];

/** The keys to re-ask for a first-pass evidence set, or [] when no trigger key is "yes". */
export function secondLookKeys(ev: Record<FactKey, Tri>): FactKey[] {
  if (!SECOND_LOOK_TRIGGERS.some((k) => ev[k] === "yes")) return [];
  return SECOND_LOOK_KEYS.filter((k) => ev[k] === "yes");
}

export function secondLookPrompt(frames: number, keys: readonly FactKey[]): string {
  return `The image is a contact sheet of ${frames} separate still frames from one video, tiled left to right, top to bottom. Look at each frame again, carefully, and answer ONLY these keys: ${keys.join(", ")}.
Return JSON with exactly these keys, each "yes", "no" or "unclear". Answer "yes" only if the skin, opening or toy is plainly seen, uncovered, in at least one frame. A covered outline, a thong or bottom that is in place (even if it could be pulled aside), hands covering the area, a blur, a small or distant body, or a pose alone is "no" or "unclear". full_nudity is "yes" only if no garment is on the torso or lower body in any frame. sexual_activity is "yes" only if a sexual act or a toy in use is plainly visible. Do not infer; do not describe.`;
}

/** Apply a second-look answer to the first pass's raw value: any asked key not answered "yes" becomes "unclear".
 * `answer` null means the second look could not run, so nothing is confirmed. Pure. */
export function applySecondLook(value: unknown, keys: readonly FactKey[], answer: unknown): { value: unknown; downgraded: FactKey[] } {
  const j = value as Record<string, unknown>;
  const ev = { ...(j.evidence as Record<string, unknown>) };
  const ans = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};
  const downgraded: FactKey[] = [];
  for (const k of keys) {
    if (ans[k] !== "yes") { ev[k] = "unclear"; downgraded.push(k); }
  }
  return { value: { ...j, evidence: ev }, downgraded };
}

// ---- video review gate ---------------------------------------------------------------------------------------------------
// Shared by every path that analyses a NEW video (dashboard upload, import-videos, import-video-media all go through analyseVideo).
// A contact sheet of 5 frames over-claims explicit keys (eval c19 worn thong as genitals, c21 clothed read as unclothed, c01 false
// anus) and misses real ones. The model's fields are kept for the reviewer, but a video that shows or may show any of these never
// ends "analysed": it waits for the operator's explicit completeReview. RESIDUAL RISK: a miss answered "no" (c13: a visible nipple
// reported as "no") looks exactly like a clean clip and cannot be detected by code; only a person looking at it can.
export const VIDEO_GATE_KEYS = ["nipples", "genitals", "anus", "bare_buttocks", "full_nudity", "sexual_activity", "sex_toy"] as const satisfies readonly FactKey[];

/** A reason string when a video's evidence must wait for human review, else null (all gate keys "no"). Pure. */
export function videoReviewReason(ev: Record<FactKey, Tri>): string | null {
  const hit = VIDEO_GATE_KEYS.filter((k) => ev[k] !== "no");
  if (!hit.length) return null;
  return `video review required: ${hit.map((k) => `${k} ${ev[k]}`).join(", ")}; confirm before it is sold`;
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
const CLIP_NARRATION = /\b(throughout|the whole (?:video|clip)|entire (?:video|clip)|then|later|afterwards?|eventually|continues?|static|the camera (?:is|stays|remains|moves|pans|follows|zooms|holds))\b/i;
// Claims that she (or her phone) is IN a mirror. The bare word "mirror" naming an object on the wall is not one.
const MIRROR_CLAIM = /\b(?:mirror[- ]?(?:selfies?|reflections?|shots?|pics?|photos?|images?)|reflections?|reflected|(?:in|into|at|before|toward|towards|facing|via|using) (?:a|an|the|her|his) (?:[\w-]+ ){0,2}mirror|in front of (?:a|an|the|her|his) (?:[\w-]+ ){0,2}mirror|selfie (?:in|with|using))\b/i;

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
    [ev.full_nudity !== "yes", /\b(?:(?:fully|completely|totally|entirely) (?:nude|naked|unclothed|undressed)|unclothed)\b/i, "full nudity"],
    // A mirror OBJECT in the scene is a plain fact; the claim that needs mirror_reflection=yes is her (or her phone) being in it.
    [ev.mirror_reflection !== "yes", MIRROR_CLAIM, "mirror"],
    [ev.swimwear !== "yes", /\b(bikini|swimsuit|swimwear|swim ?suit)\b/i, "swimwear"],
    [ev.lingerie !== "yes", /\b(lingerie|negligee|bodysuit)\b/i, "lingerie"],
    // a thong is lingerie OR a bikini cut: either answer licenses the word
    [ev.lingerie !== "yes" && ev.swimwear !== "yes", /\b(thong|g-?string)\b/i, "lingerie"],
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

const DANGLING = /\s+(?:a|an|the|in|on|at|of|to|for|with|by|from|across|over|under|into|onto|and|or|but|her|his|their|its|while|as|near|against|toward|towards|some|three|two|four|five|several|both|each)$/i;

/** Whole sentences up to `max` characters. When the first sentence alone is longer, cut at the last clause comma (a complete
 * clause, closed with a period) or else at a word boundary with dangling prepositions/articles dropped (a fragment gets NO period). */
export function sentencesUpTo(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const window = t.slice(0, max + 1);
  const m = window.match(/^.*[.!?](?=\s)/);
  if (m) return m[0];
  const comma = window.slice(0, max).lastIndexOf(",");
  if (comma >= Math.min(40, max / 2)) return window.slice(0, comma).replace(/[,;:\s]+$/, "") + ".";
  let cut = window.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "");
  for (let i = 0; i < 4 && DANGLING.test(cut); i++) cut = cut.replace(DANGLING, "").replace(/[,;:\s]+$/, "");
  return cut;
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

/** The fact key each tag speaks for (inverse of TAGS_FROM_YES, plus full_nude). Used to carry an operator's tag correction into the facts. */
export const TAG_FACT_KEY: Record<string, FactKey> = {
  ...Object.fromEntries(TAGS_FROM_YES.flatMap(([k, tags]) => tags.map((t) => [t, k] as const))),
  full_nude: "full_nudity",
};

const DENIAL_WORDS: [FactKey, RegExp][] = [
  ["nipples", /\b(?:nipples?|areolas?|topless|breasts?|boobs?|tits)\b/i],
  ["genitals", /\b(?:genitals?|genitalia|vulva|vagina|pussy|labia)\b/i],
  ["anus", /\b(?:anus|anal|asshole)\b/i],
  ["bare_buttocks", /\b(?:buttocks?|bare (?:ass|bum|butt)|ass)\b/i],
];

/** Anatomy keys an operator's description DENIES (a negated or covered clause that names the part: "nipples are not visible"). */
export function deniedFactKeys(text: string): FactKey[] {
  const denied = new Set<FactKey>();
  const listed = text.match(/\bnot visible:\s*([^.]*)/i)?.[1] ?? ""; // the "Not visible: nipples, genitals." line the analysis itself writes
  for (const [k, re] of DENIAL_WORDS) if (listed && re.test(listed)) denied.add(k);
  for (const clause of text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean)) {
    if (!NEGATED.test(clause)) continue;
    for (const [k, re] of DENIAL_WORDS) if (re.test(clause)) denied.add(k);
  }
  return [...denied];
}

// anus=yes must be backed by the prose actually naming the anus (or a plug / insertion). A "yes" the description never mentions is an
// unsupported claim: it goes to review instead of being saved as analysed (eval #40: anus=yes + 'anal' tag with silent prose).
const ANUS_MENTIONED = /\b(?:anus|anal|asshole|butt ?plug|plug|inserted|insertion|penetrat\w*)\b/i;
const ANUS_NOT_VISIBLE = /\b(?:anus|anal|asshole)\b[^.]*\b(?:not|isn'?t|no longer|barely)\b[^.]*\b(?:visible|seen|shown)\b|\b(?:not|no|nor)\b[^.]*\b(?:visible|seen)\b[^.]*\b(?:anus|asshole)\b|\bno (?:visible )?(?:anus|asshole)\b/i;
const WORN_BOTTOM = /\b(?:thong|g-?string|bikini (?:bottoms?|briefs?)|bikini bottom|panties|underwear|briefs|knickers|lingerie bottoms?)\b/i;
const PULLED_DOWN = /\b(?:pulled|pushed|moved|slid|tugged|yanked) (?:down|aside|off|to the side)|\b(?:down|aside|off) (?:around|at) (?:her )?(?:thighs|knees|ankles)\b|\bwithout (?:a )?(?:thong|underwear|panties)\b/i;
// The tag vocabulary has no male-genital tag, and "pussy" on a man's genitals is wrong.
// A garment named as worn/on the body contradicts full_nudity=yes ("pink top bunched on her torso"). Pulled off/down/aside is not worn.
const WORN_GARMENT = /\b(?:wears?|wearing|dressed in|in an?|bunched|pulled up|rolled up|draped|covers?|covering)\b[^.;]*\b(?:top|shirt|t-?shirt|tank|dress|bra|bodysuit|skirt|shorts|jeans|pants|leggings|robe|hoodie|sweater|jacket|crop top|bikini|swimsuit|lingerie|garment|clothing|nightie|camisole|corset)\b|\b(?:top|shirt|t-?shirt|tank|dress|bra|bodysuit|skirt|shorts|jeans|pants|leggings|robe|hoodie|sweater|jacket|crop top|bikini|swimsuit|lingerie|garment|clothing|nightie|camisole|corset)\b[^.;]*\b(?:bunched|rolled up|worn|on (?:her|his|the) (?:torso|body|chest|hips|waist|stomach)|around (?:her|his|the) (?:waist|hips|torso|chest)|covers?|covering)\b/i;
const GARMENT_REMOVED = /\b(?:pulled|pushed|slid|taken|tugged|yanked) (?:down|aside|off)|\bremoved\b|\bwithout (?:a |any )?(?:top|shirt|clothes|clothing|garment)/i;
const MALE_WORDS = /\b(?:man|men|male|guy|boy|penis|cock|dick|him|his)\b/i;

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

  // Backstops for known model slips. They never invent facts: they drop an unlicensed tag or send the row to review.
  const issuesExtra: string[] = [];
  const proseAll = `${identifying} ${details} ${visible.join(". ")}`;
  const blocked = new Set<string>();
  if (evidence.anus === "yes" && ANUS_NOT_VISIBLE.test(`${j.identifying} ${typeof j.details === "string" ? j.details : ""} ${(Array.isArray(j.visible) ? j.visible : []).join(". ")}`)) {
    issuesExtra.push("anus is yes but the description says it is not visible");
  }
  if (evidence.anus === "yes" && !ANUS_MENTIONED.test(proseAll)) {
    issuesExtra.push("anus is yes but the description never mentions it");
  }
  if (evidence.bare_buttocks === "yes" && WORN_BOTTOM.test(proseAll) && !PULLED_DOWN.test(proseAll)) {
    issuesExtra.push("bare_buttocks is yes but a worn thong/bottom/underwear is described");
  }
  let fullNudeBlocked = false;
  if (evidence.full_nudity === "yes") {
    const worn = affirmativeClauses(proseAll).find((c) => WORN_GARMENT.test(c) && !GARMENT_REMOVED.test(c));
    if (worn) { issuesExtra.push(`full_nudity is yes but a worn garment is described: "${worn.slice(0, 60)}"`); fullNudeBlocked = true; }
  }
  if (evidence.genitals === "yes" && MALE_WORDS.test(`${identifying} ${visible.join(". ")}`)) blocked.add("pussy");

  const proposed = (Array.isArray(j.tags) ? j.tags : []).filter((t): t is string => typeof t === "string" && TAG_SET.has(t));
  const licensed = new Set<string>(TAGS_FROM_YES.filter(([k]) => evidence[k] === "yes").flatMap(([, t]) => t));
  const needsEvidence = new Set<string>(TAGS_FROM_YES.flatMap(([, t]) => t));
  if (evidence.full_nudity === "yes" && nude && !fullNudeBlocked) licensed.add("full_nude");
  needsEvidence.add("full_nude");
  for (const t of blocked) licensed.delete(t);
  const tags = [...new Set([...proposed.filter((t) => !needsEvidence.has(t)), ...licensed])];

  const tail = [video ? `Based on ${opts.frames} sampled frames.` : "", notVisibleLine(evidence)].filter(Boolean);
  // a word-boundary cut (sentencesUpTo adds no period to a fragment) is closed here so the stored text still reads as sentences
  const headline = identifying && !/[.!?]$/.test(identifying) ? `${identifying}.` : identifying;
  const visual_description = [headline, details, ...tail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const facts: VisualFacts = { v: ANALYSIS_VERSION, evidence, visible, ...(video ? { frames: opts.frames } : {}) };
  const issues = [...(unclear.length ? [`unclear: ${unclear.join(", ")}`] : []), ...issuesExtra];
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
    status: contradicted || unclear.length || issuesExtra.length ? "needs_review" : "analysed",
    contradictions,
    issues,
  };
}
