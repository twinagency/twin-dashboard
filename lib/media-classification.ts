import { MEDIA_TAGS } from "./pricing";
import { ANALYSIS_VERSION, FACT_KEYS, type AnalysisFields, type FactKey, type Tri, type VisualFacts } from "./media-analysis-contract";

// ONE observation set per item: a tri-state answer for every FACT_KEY plus a list of short `visible` phrases. Every stored
// field is derived or validated against that observation set. Internal agreement does not prove the observation is true;
// targeted contradictions and unresolved visibility cases are held for review. Only "yes" can support a positive claim: "no" and "unclear" never
// make a tag or a flag. The promotional send caption is NOT written here (see lib/send-caption.ts).

export { ANALYSIS_VERSION, FACT_KEYS };

/** The anatomy keys whose "unclear" answer must never read as "clean". */
export const NUDITY_KEYS: readonly FactKey[] = ["nipples", "genitals", "anus", "bare_buttocks"];

const OBSERVATION_TASK = `You are cataloguing media for an internal database. Report only what is visibly present. This is an observation task: do not write marketing copy, captions, flirting or opinions.
Return JSON with exactly these keys: evidence, identifying, details, short_label, visible, tags.

evidence: an object with ALL these keys, each "yes", "no" or "unclear": ${FACT_KEYS.join(", ")}.
- "yes": the feature itself is clearly discernible and unmistakable, following the feature-specific rules below.
- "no": that part of the body, garment or object would be in frame and is plainly not there, or is plainly concealed from view.
- "unclear": cropped out, hidden, blurred, too small, ambiguous or only guessed. Never answer "no" for something you cannot actually see; never answer "yes" for something you infer.
- nipples needs the nipple or areola itself to be clearly discernible, bare or through transparent fabric under the sheer rule below. Cleavage, underboob, a low neckline or an open shirt alone is "no". A hand, arm or opaque fabric that conceals the nipple and areola is "no", and so is a lifted top that shows only the underside or lower curve of the breast; describe the actual clothing and coverage, never an exposure you cannot see. Answer "yes" only when the nipple or areola itself (the darker disc) can be seen, for example around or between the fingers or above a pulled-down cup. Judge each breast separately.
- sheer, mesh or transparent fabric: a garment being worn neither proves that anatomy is hidden nor that it is visible. nipples, genitals and bare_buttocks are "yes" through sheer fabric only when the nipple/areola or the anatomy itself is clearly discernible; an outline or ambiguous shape is "unclear" (not "yes", not "no"). Say in details that it is seen through the fabric.
- genitals needs the actual external anatomy itself to be clearly discernible, bare or through transparent fabric under the sheer rule above, not an outline. anus is "yes" only when the anal opening itself can be seen; an inserted object, buttocks, a spread pose or a rear view alone are not enough. An object can establish sex_toy without establishing anus. Never write that the anus is not visible while answering "yes".
- bare_buttocks is "yes" when the buttock cheeks themselves are clearly discernible, uncovered or through transparent fabric under the sheer rule above, including from behind with a thong or G-string worn (the strip does not cover the cheeks); name the garment in visible and details. It is "no" when opaque briefs, shorts, a bikini bottom or other fabric conceals the cheeks, and "unclear" when they are cropped out, hidden or too small to judge. A worn thong or other garment is never a reason to answer "yes" for full_nudity or genitals. Check every body part that is in frame before answering.
- full_nudity needs a clearly unclothed body: if ANY garment (a top bunched on the torso, a skirt, shorts, a bikini piece, a robe) is on the torso or lower body in the frame, full_nudity is "no" and the garment goes in visible. sexual_activity needs a visible sexual act or a toy in use, not a pose or an expression. sex_toy needs a visible sex toy.
- swimwear and lingerie are different garments; use both only if two separate garments are visible. Body paint is not a garment: colour painted or drawn on skin never makes swimwear or lingerie "yes" and is never described as a bikini, bra or underwear; write "body paint" in visible. mirror_reflection is "yes" only when she (or her phone) is seen reflected in a mirror or reflective surface, including a person photographing herself in a mirror with the phone visible in the reflection. A mirror in the background, on a wall or behind her that does not show her reflection is "no", and a selfie taken directly at arm's length with no mirror in frame is "no".
- suggestive_pose: a provocative pose or clothing, with no uncovered anatomy required.

identifying: ONE factual sentence, at most 140 characters, that identifies this exact item: the woman (hair, build), the main garment or its absence, and the pose or setting. It is used as the label for this item in later conversation, so it must be specific. Example: "A blonde woman in a grey sweatshirt and sweatpants takes a mirror selfie on a wooden floor."
details: 1 to 4 more factual sentences, at most 420 characters: clothing and colours, objects and their state, camera angle, facial expression, setting. Say what is in frame, not what is absent: the evidence object already records absence. Do not infer anything hidden, and do not describe movement or intent that a still cannot show (no "is sliding", "about to", "teasing"); describe the pose and visible state instead.
short_label: 2 to 5 factual words, for example "grey sweatshirt mirror selfie".
visible: array of up to 10 short phrases (garment with colour, setting, objects, pose), each confirmed visible.
tags: array that is a subset of: ${MEDIA_TAGS.join(", ")}. Use topless/tits only when nipples is yes under the visibility rules above, pussy only when genitals is yes, anal only when anus is yes, ass only when bare_buttocks is yes (a worn thong with the cheeks visible is yes), full_nude only when full_nudity is yes, bikini only when swimwear is yes, lingerie only when lingerie is yes, mirror_selfie only when mirror_reflection is yes. bed, pool, shower and outdoor only when she is on, in or at that place, not when it is only in the background.
Never claim a body part, act, garment, toy or mirror whose evidence key is not "yes".`;

export const MEDIA_CLASSIFICATION_PROMPT = `${OBSERVATION_TASK}
This is a single photo.`;

/** Video variant: ONE contact sheet of N frames tiled in order, so the model sees separate frames and never the motion. */
export function videoClassificationPrompt(frames: number): string {
  return `${OBSERVATION_TASK}
The image is a contact sheet of ${frames} separate frames sampled at even intervals from ONE video clip, tiled left to right, top to bottom. You are NOT seeing the whole clip, only these still frames. Describe only what these frames show. A key is "yes" if any frame clearly shows it under the same visibility rules above; a nude body seen from a distance, a blur, a hand hiding the area, or a garment that could be pulled aside is not enough. A garment in view forbids full_nudity "yes" and words like "unclothed". Answer "no" only if the frames show that part of the body or garment in frame and plainly absent or concealed in every frame; otherwise "unclear". Make no claims about motion, actions between frames, what happens before, after or throughout the clip, or what the clip is "doing". Do not use words like "then", "later", "throughout", "continues" or "static", and do not describe what the camera does.`;
}

// ---- second look (video, and since round 5 photos) --------------------------------------------------------------------
// A contact sheet makes any-frame-yes cheap, which over-claims the keys with the worst cost of being wrong. When one of the
// TRIGGER keys is "yes", ONE more call re-asks only the keys that were yes; whatever is not re-confirmed becomes "unclear".
// Photos (round 5): same machinery, plus nipples as a trigger/asked key, with a stricter "the skin / nipple / opening / toy itself
// is plainly seen" wording. WHAT THIS DOES NOT FIX: (1) false claims on keys that are not triggers (bare_buttocks, mirror_reflection,
// lingerie, swimwear); (2) details answered "no" that are really there (missed nipples/anus); (3) the second answer comes from the
// SAME model, so a re-confirmed "yes" is not proof, only "the model said it twice". It is a filter for over-claims, not a verifier.
export const SECOND_LOOK_TRIGGERS = ["genitals", "anus", "sexual_activity", "sex_toy"] as const satisfies readonly FactKey[];
export const SECOND_LOOK_KEYS = [...SECOND_LOOK_TRIGGERS, "full_nudity"] as const satisfies readonly FactKey[];
export const PHOTO_SECOND_LOOK_TRIGGERS = ["genitals", "anus", "nipples", "sexual_activity", "sex_toy", "full_nudity"] as const satisfies readonly FactKey[];

/** The keys to re-ask for a first-pass evidence set, or [] when no trigger key is "yes". Videos trigger on SECOND_LOOK_TRIGGERS
 * and re-ask the yes keys among SECOND_LOOK_KEYS; photos trigger on and re-ask PHOTO_SECOND_LOOK_TRIGGERS. */
export function secondLookKeys(ev: Record<FactKey, Tri>, photo = false): FactKey[] {
  if (photo) return PHOTO_SECOND_LOOK_TRIGGERS.filter((k) => ev[k] === "yes");
  if (!SECOND_LOOK_TRIGGERS.some((k) => ev[k] === "yes")) return [];
  return SECOND_LOOK_KEYS.filter((k) => ev[k] === "yes");
}

const PHOTO_KEY_DEFS: Partial<Record<FactKey, string>> = {
  genitals: "genitals: the actual external anatomy itself is clearly discernible, bare or through transparent fabric. Opaque fabric, a hat, hand or hair concealing it, a covered outline, an uncertain detail or a crop is NOT yes. A garment being worn neither proves visibility nor concealment.",
  anus: "anus: the anal opening ITSELF is plainly seen. An inserted object alone, buttocks, a spread pose or a rear view is NOT yes. A visible toy can establish sex_toy without establishing anus.",
  nipples: "nipples: the nipple or areola ITSELF is plainly seen (bare, or clearly discernible through sheer fabric). Covered by opaque fabric, hand, arm, petals, hair, or only an outline = NOT yes.",
  sexual_activity: "sexual_activity: a sexual act or a toy in use is plainly seen. A pose, an object nearby or a hand resting on the body is NOT yes.",
  sex_toy: "sex_toy: a sex toy is plainly seen.",
  full_nudity: "full_nudity: the whole body is plainly unclothed. ANY garment on torso or lower body, or the lower body hidden by a hat/object/crop, is NOT yes.",
};

/** `frames` undefined = a single photo; a number = a video contact sheet of that many frames. */
export function secondLookPrompt(frames: number | undefined, keys: readonly FactKey[]): string {
  if (frames === undefined) {
    return `You are checking an adult creator's own catalogue photo for a content-labelling system. Be conservative: wrongly saying yes is worse than saying unclear.
Answer ONLY these keys: ${keys.join(", ")}.
Each value: "yes", "no" or "unclear". Say yes ONLY if the skin / nipple / opening / toy itself is plainly seen in the image; otherwise no or unclear.
${keys.map((k) => PHOTO_KEY_DEFS[k] ?? k).join("\n")}
Return JSON only: {${keys.map((k) => `"${k}":"..."`).join(",")}}`;
  }
  return `The image is a contact sheet of ${frames} separate still frames from one video, tiled left to right, top to bottom. Look at each frame again, carefully, and answer ONLY these keys: ${keys.join(", ")}.
Return JSON with exactly these keys, each "yes", "no" or "unclear". Answer "yes" only if the feature itself is clearly discernible in at least one frame under these same rules:
${keys.map((k) => PHOTO_KEY_DEFS[k] ?? k).join("\n")}
A covered outline, opaque clothing, hands concealing the area, a blur, a small or distant body, or a pose alone is "no" or "unclear". full_nudity is "yes" only if no garment is on the torso or lower body in any frame. Do not infer; do not describe.`;
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

// Round 5. Visible, uncovered cheeks are bare_buttocks "yes" even with a thong worn, but a worn bottom garment alone is not nudity:
// bare_buttocks drives is_nude/explicit only when no worn bottom garment is named in the prose (or it is pulled down/aside).
const WORN_BOTTOM_RE = /\b(?:thong|g-?string|bikini (?:bottoms?|briefs?)|bikini bottom|panties|underwear|briefs|knickers|lingerie bottoms?)\b/i;
const PULLED_DOWN_RE = /\b(?:pulled|pushed|moved|slid|tugged|yanked) (?:down|aside|off|to the side)|\b(?:down|aside|off) (?:around|at) (?:her )?(?:thighs|knees|ankles)\b|\bwithout (?:a )?(?:thong|underwear|panties)\b/i;
/** True when the prose names a bottom garment that is worn (in place), as opposed to pulled down, aside or absent. Pure. */
export function wornBottomIn(prose: string): boolean {
  return WORN_BOTTOM_RE.test(prose) && !PULLED_DOWN_RE.test(prose);
}
/** A review exception, not a claim that fabric makes anatomy invisible. Shared
 * with repair validation so an older saved proposal cannot bypass the hold. */
export function genitalVisibilityReviewReason(evidence: Pick<Record<FactKey, Tri>, "genitals">, prose: string): string | null {
  if (evidence.genitals !== "yes") return null;
  const throughFabric = prose.split(/[.;]/).some(c => GENITALS_MENTIONED.test(c) &&
    /\bthrough\b[^.;]*\b(?:fabric|mesh|lace|clothing|garment|thong|underwear|robe|dress|bodysuit)\b/i.test(c));
  return wornBottomIn(prose) || throughFabric
    ? "genital visibility with a worn garment requires review; repeated model agreement is insufficient"
    : null;
}
/** The ONE nude derivation: any nudity key yes, except bare_buttocks alone does not count while a bottom garment is worn. */
function isNude(ev: Record<FactKey, Tri>, wornBottom: boolean): boolean {
  return ev.nipples === "yes" || ev.genitals === "yes" || ev.anus === "yes" || ev.full_nudity === "yes" ||
    (ev.bare_buttocks === "yes" && !wornBottom);
}
// Body paint is not a garment (round 5): paint on skin, never a bikini/bra/underwear fact. Painted nails do not count.
const NAILS = /\b(?:painted|polished) (?:finger|toe)?nails?\b|\bnail (?:paint|polish)\b|\bpainted (?:lips|toenails|fingernails)\b/gi;
const PAINT = /\b(?:body ?paint\w*|(?:face|skin) ?paint\w*|airbrush\w*|paint(?:ed|ing)?|painted[- ]on)\b/i;
function isPaint(clause: string): boolean { return PAINT.test(clause.replace(NAILS, "")); }
const PAINT_GARMENT = /\b(?:bikini|swimsuit|swimwear|lingerie|bra|thong|g-?string|bodysuit|underwear|panties|top|bottoms?|outfit|dress|garment|clothing|clothes)\b/i;
// A mirror that is only part of the scene ("mirror in the background") does not put her in it.
const BACKGROUND_MIRROR = /\bmirrors?\b[^.;]*\b(?:background|behind|on the wall|wall[- ]mounted|nearby|beside|next to|leaning|hang(?:s|ing)?)\b|\b(?:background|behind|nearby|beside)\b[^.;]*\bmirrors?\b/i;
// An outline, silhouette or faint shape is not the anatomy itself (round 5, sheer fabric).
const OUTLINE_ONLY = /\b(?:outlines?|silhouettes?|impressions?|faint(?:ly)?|vague(?:ly)?|hints? of|suggest\w*|shapes?|bulges?|barely|seems? to|appears? to|possibly|perhaps|might|may be)\b/i;
const FEATURE_WORDS: [FactKey, RegExp][] = [
  ["nipples", /\b(?:nipples?|areolas?)\b/i],
  ["genitals", /\b(?:genitals?|genitalia|vulva|vagina|pussy|labia)\b/i],
  ["bare_buttocks", /\b(?:buttocks?|cheeks|ass|bum|butt)\b/i],
];

/** Pure: problems in one block of descriptive text against the evidence it must agree with. Only "yes" licenses a claim. */
export function descriptionProblems(text: string, ev: Record<FactKey, Tri>, video = false, wornBottom = false): string[] {
  const problems: string[] = [];
  const nude = isNude(ev, wornBottom);
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
      // colour painted on skin described AS paint is a plain fact, not a swimwear/lingerie claim (the paint backstop handles yes)
      if ((label === "swimwear" || label === "lingerie") && isPaint(clause)) continue;
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
const GENITALS_MENTIONED = /\b(?:genitals?|genitalia|genital anatomy|vulva|vagina|pussy|labia|penis|scrotum)\b/i;
const ANUS_NOT_VISIBLE = /\b(?:anus|anal|asshole)\b[^.]*\b(?:not|isn'?t|no longer|barely)\b[^.]*\b(?:visible|seen|shown)\b|\b(?:not|no|nor)\b[^.]*\b(?:visible|seen)\b[^.]*\b(?:anus|asshole)\b|\bno (?:visible )?(?:anus|asshole)\b/i;
// The tag vocabulary has no male-genital tag, and "pussy" on a man's genitals is wrong.
// A garment named as worn/on the body contradicts full_nudity=yes ("pink top bunched on her torso"). Pulled off/down/aside is not worn.
const WORN_GARMENT = /\b(?:wears?|wearing|dressed in|in an?|bunched|pulled up|rolled up|draped|covers?|covering)\b[^.;]*\b(?:top|shirt|t-?shirt|tank|dress|bra|bodysuit|skirt|shorts|jeans|pants|leggings|robe|hoodie|sweater|jacket|crop top|bikini|swimsuit|lingerie|garment|clothing|nightie|camisole|corset|thong|g-?string|panties|underwear|briefs)\b|\b(?:top|shirt|t-?shirt|tank|dress|bra|bodysuit|skirt|shorts|jeans|pants|leggings|robe|hoodie|sweater|jacket|crop top|bikini|swimsuit|lingerie|garment|clothing|nightie|camisole|corset|thong|g-?string|panties|underwear|briefs)\b[^.;]*\b(?:bunched|rolled up|worn|on (?:her|his|the) (?:torso|body|chest|hips|waist|stomach)|around (?:her|his|the) (?:waist|hips|torso|chest)|covers?|covering)\b/i;
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

  // Prose as the model wrote it: a worn bottom garment named here decides whether visible cheeks make the item nude (see isNude).
  const rawProse = `${j.identifying} ${typeof j.details === "string" ? j.details : ""} ${(Array.isArray(j.visible) ? j.visible : []).filter((x) => typeof x === "string").join(". ")}`;
  const wornBottom = wornBottomIn(rawProse);
  const nude = isNude(evidence, wornBottom);
  const explicit = nude || evidence.sexual_activity === "yes";
  const unclear = NUDITY_KEYS.filter((k) => evidence[k] === "unclear");
  const suggestive = evidence.suggestive_pose === "yes" || evidence.swimwear === "yes" || evidence.lingerie === "yes" ||
    evidence.sex_toy === "yes" || evidence.bare_buttocks === "yes" || unclear.length > 0; // unclear nudity must never read as "none"

  let identifying = sentencesUpTo(stripBannedDashes(j.identifying.trim()), 140);
  let details = sentencesUpTo(stripBannedDashes(typeof j.details === "string" ? j.details.trim() : ""), 420);
  let autoDesc = stripBannedDashes(j.short_label.trim()).slice(0, 60);
  let visible = cleanList(j.visible, 10);

  const contradictions = [
    ...descriptionProblems(`${identifying} ${details}`, evidence, video, wornBottom),
    ...descriptionProblems(autoDesc, evidence, video, wornBottom),
    ...descriptionProblems(visible.join(". "), evidence, video, wornBottom),
  ];
  const contradicted = contradictions.length > 0;
  if (contradicted) {
    // Facts-only fallback: keep only phrases that pass, never the contradicted prose.
    visible = visible.filter((p) => descriptionProblems(p, evidence, video, wornBottom).length === 0);
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
  // A garment (including sheer fabric) does not substantiate a genital flag.
  // Check the original factual prose, before any generated absence line. This
  // is an internal-consistency hold, not independent verification of the pixels.
  if (evidence.genitals === "yes" && !affirmativeClauses(rawProse).some(c => GENITALS_MENTIONED.test(c))) {
    issuesExtra.push("genitals is yes but the factual description never affirms it; review required");
  }
  // The evaluated model can repeat a coherent but unsupported genital claim through
  // a worn garment. Neither prose agreement nor its second look clears this case.
  // Keep the observation intact for explicit review: transparent fabric can reveal
  // anatomy, so this is a visibility hold, not a rule that the anatomy is absent.
  const garmentReview = genitalVisibilityReviewReason(evidence, rawProse);
  if (garmentReview) issuesExtra.push(garmentReview);
  // Round 5: yes is only ever as good as the prose backing it. An outline through fabric, paint read as a garment and a
  // background mirror are not evidence; each goes to review and drops the tag it would have licensed.
  const clauses = affirmativeClauses(proseAll);
  for (const [k, re] of FEATURE_WORDS) {
    if (evidence[k] !== "yes") continue;
    const outline = clauses.find((c) => re.test(c) && OUTLINE_ONLY.test(c));
    if (outline) issuesExtra.push(`${k} is yes but the description gives only an outline or faint shape: "${outline.slice(0, 60)}"`);
  }
  if (evidence.swimwear === "yes" || evidence.lingerie === "yes") {
    const paint = clauses.find((c) => isPaint(c) && PAINT_GARMENT.test(c));
    if (paint) {
      issuesExtra.push(`swimwear/lingerie is yes but the description is body paint, not a garment: "${paint.slice(0, 60)}"`);
      blocked.add("bikini"); blocked.add("lingerie");
    }
  }
  if (evidence.mirror_reflection === "yes" && clauses.some((c) => BACKGROUND_MIRROR.test(c)) && !clauses.some((c) => MIRROR_CLAIM.test(c))) {
    issuesExtra.push("mirror_reflection is yes but the mirror is only described as part of the background");
    blocked.add("mirror_selfie");
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

