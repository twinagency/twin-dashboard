import assert from "node:assert/strict";
import {
  normalizeMediaClassification, stripBannedDashes, cleanSendCaption, descriptionProblems, anatomyStatus,
  MEDIA_CLASSIFICATION_PROMPT, VIDEO_CLASSIFICATION_PROMPT, VISUAL_EVIDENCE_KEYS, ANALYSIS_VERSION,
} from "../lib/media-classification";

const no = Object.fromEntries(VISUAL_EVIDENCE_KEYS.map((key) => [key, "no"]));
function obs(features: Record<string, unknown> = {}, changes: Record<string, unknown> = {}) {
  return {
    features: { ...no, suggestive_pose_or_clothing: "yes", ...features },
    summary: "A woman in an open white shirt stands outdoors and looks at the camera.",
    details: "The shirt is open at the front and her cleavage is visible. She stands on a path with trees behind her.",
    short_label: "open shirt outdoor",
    clothing: ["open white shirt"], objects: [], setting: "outdoor path",
    tags: ["topless", "tits", "outdoor", "solo"],
    ...changes,
  };
}

// ---- the prompt is an observation task, not a writing task --------------------------------------------------------------
assert.doesNotMatch(MEDIA_CLASSIFICATION_PROMPT, /SEND CAPTION|first person|horny|tease|Never mention OnlyFans/i,
  "the analysis prompt carries no promotional-writing instructions");
assert.match(MEDIA_CLASSIFICATION_PROMPT, /"yes", "no" or "unsure"/);
assert.match(VIDEO_CLASSIFICATION_PROMPT, /sampled/i);
assert.equal(typeof ANALYSIS_VERSION, "number");

// ---- cleavage / open shirt is not nudity; tags are gated by confirmed observations -----------------------------------------
const beach = normalizeMediaClassification(obs());
assert.equal(beach.is_nude, false, "open shirt and cleavage are not visible nudity");
assert.equal(beach.nsfw, false);
assert.equal(beach.explicitness, "suggestive");
assert.deepEqual(beach.tags, ["outdoor", "solo"], "topless/tits dropped: nipples_visible is not yes");
assert.equal(beach.status, "ok");
assert.equal(beach.auto_desc, "open shirt outdoor");
assert.equal(beach.caption, "", "the vision step never writes the send caption");
assert.match(beach.visual_description, /^A woman in an open white shirt/);
assert.match(beach.visual_description, /Not visible: nipples, genitals, anus, bare buttocks\.$/);

// one authoritative set: description, tags and flags all follow the same features
const nude = normalizeMediaClassification(obs({ nipples_visible: "yes" }, {
  summary: "A woman sits topless on a sofa.", details: "She wears grey shorts.", short_label: "topless on sofa",
  tags: ["solo"], clothing: ["grey shorts"],
}));
assert.equal(nude.is_nude, true);
assert.equal(nude.nsfw, true);
assert.equal(nude.explicitness, "explicit");
assert.ok(nude.tags.includes("topless"), "a confirmed observation derives its tag even when the model omitted it");
assert.match(nude.visual_description, /Visible: nipples\./);

// the two reference failures, expressed as observations
const kyla = normalizeMediaClassification(obs({ mirror_reflection_visible: "yes", suggestive_pose_or_clothing: "yes" }, {
  summary: "A blonde woman in a grey sweatshirt and sweatpants takes a mirror selfie on a wooden floor.",
  details: "The sweatshirt is pulled up over the lower part of her breasts and one hand covers them, so her nipples are not visible. A bed and a grey rug are behind her.",
  short_label: "sweatshirt mirror selfie", tags: ["mirror_selfie", "topless", "bed", "solo"],
}));
assert.deepEqual(kyla.tags.filter((t) => t === "topless" || t === "tits"), [], "Kyla: covered nipples never become a topless tag");
assert.equal(kyla.is_nude, false);
assert.ok(kyla.tags.includes("mirror_selfie"));
const dan = normalizeMediaClassification(obs({ genitals_visible: "yes", anus_visible: "yes", full_nudity_visible: "yes", bare_buttocks_visible: "yes" }, {
  summary: "A nude platinum blonde woman kneels bent forward on a bed with a pink plug in her anus.",
  details: "Her vulva is visible below the plug and her head is down on a grey blanket.", short_label: "nude kneeling plug", tags: ["ass", "anal", "bed", "solo"],
}));
assert.ok(["pussy", "anal", "full_nude"].every((t) => dan.tags.includes(t)), "Dan: confirmed anatomy derives pussy, anal and full_nude");
assert.equal(dan.explicitness, "explicit");

// ---- tri-state: unsure is neither a fact nor an absence ---------------------------------------------------------------------
const unsure = normalizeMediaClassification(obs({ nipples_visible: "unsure" }));
assert.equal(unsure.status, "review", "an unresolved anatomy answer is held for review, never silently SFW");
assert.equal(unsure.is_nude, false);
assert.equal(unsure.explicitness, "suggestive", "unresolved is never classified as plainly safe");
assert.match(unsure.visual_description, /Unclear: nipples\./);
assert.ok(!unsure.tags.includes("topless"));

// legacy boolean evidence is still understood
const legacy = normalizeMediaClassification({
  caption: "woman in a T-shirt at a desk", auto_desc: "desk portrait", tags: ["solo"],
  visual_evidence: Object.fromEntries(VISUAL_EVIDENCE_KEYS.map((k) => [k, false])),
});
assert.equal(legacy.explicitness, "none");
assert.equal(legacy.status, "ok");

// ---- self-contradiction is rejected (the caller retries once) -------------------------------------------------------------------
for (const claim of [
  "A topless woman stands outdoors.", "She is nude outdoors.", "Her exposed breasts are visible.", "She wears lingerie outdoors.",
  "She wears a bikini outdoors.", "She takes a mirror selfie.",
]) {
  assert.throws(() => normalizeMediaClassification(obs({}, { summary: claim })), /without visible evidence/, claim);
}
assert.throws(() => normalizeMediaClassification(obs({}, { short_label: "nude outdoor" })), /without visible evidence/);
assert.throws(() => normalizeMediaClassification(obs({}, { details: "She is sliding her hand down." })), /motion or intent/);
assert.throws(() => normalizeMediaClassification(obs({ full_nudity_visible: "yes" })), /uncovered anatomy/);
assert.throws(() => normalizeMediaClassification(obs({ nipples_visible: "maybe" })), /boolean evidence/);
assert.throws(() => normalizeMediaClassification(obs({}, { features: {} })), /boolean evidence/);
assert.throws(() => normalizeMediaClassification(obs({}, { summary: "" })), /factual descriptions/);
assert.throws(() => normalizeMediaClassification(null), /Invalid visual metadata/);

// negation is not a claim: absent / covered / hidden clauses never trip the check
assert.deepEqual(descriptionProblems("Her nipples are not visible. One hand covers her breasts, so no anatomy shows.", (obs().features as never)), []);
assert.deepEqual(descriptionProblems("There is a mirror behind her.", obs({ mirror_reflection_visible: "yes" }).features as never), []);

// ---- clip scope: absence can never be established from sampled frames ------------------------------------------------------------
const clip = normalizeMediaClassification(obs({ nipples_visible: "no", genitals_visible: "no", anus_visible: "no" }, {
  summary: "A woman in a red dress dances in a living room.", details: "In the sampled frames she wears a red dress.", short_label: "red dress living room",
  tags: ["solo"], clothing: ["red dress"],
}), { scope: "sampled_frames", frames: 5 });
assert.equal(clip.facts.scope, "sampled_frames");
assert.equal(clip.facts.frames, 5);
assert.equal(clip.facts.features.nipples_visible, "unsure", "a clip is never recorded as 'no': frames cannot show what happens between them");
assert.match(clip.visual_description, /^In the sampled frames:/);
assert.match(clip.visual_description, /Unclear: nipples, genitals, anus, bare buttocks\.$/);
assert.equal(clip.status, "ok", "an unresolved clip is expected, not an exception");
assert.throws(() => normalizeMediaClassification(obs({}, { details: "Then she leaves the room later." }), { scope: "sampled_frames" }), /beyond the sampled frames/);

// ---- owner style rules still hold -----------------------------------------------------------------------------------------------
const emDashed = normalizeMediaClassification(obs({}, { details: "She is on the bed — legs together – smiling." }));
assert.ok(!/[—–]/.test(emDashed.visual_description), emDashed.visual_description);
for (const [input, expected] of [
  ["I'm on the bed — legs spread for you", "I'm on the bed, legs spread for you"],
  ["one – two – three", "one, two, three"],
] as const) assert.equal(stripBannedDashes(input), expected);
assert.equal(cleanSendCaption("mmm just for you — look at my ass 😈"), "mmm just for you, look at my ass 😈");
assert.equal(cleanSendCaption("look at me bent over 😈 tap to unlock it baby. can you see everything?"), "look at me bent over 😈 can you see everything?");
assert.doesNotMatch(cleanSendCaption("only 200 stars to see it. mmm look"), /stars/i);

// ---- status sentence is built by code in a fixed shape -----------------------------------------------------------------------------
assert.equal(
  anatomyStatus({ ...no, genitals_visible: "yes", anus_visible: "unsure" } as never),
  "Visible: genitals. Not visible: nipples, bare buttocks. Unclear: anus.",
);

console.log("Media classification checks passed: tri-state observations, derived tags/flags, Kyla and Dan references, unresolved review, clip scope, contradiction rejection, negation safety, style rules.");
