import assert from "node:assert/strict";
import {
  normalizeMediaClassification, stripBannedDashes, cleanSendCaption, descriptionProblems, notVisibleLine,
  MEDIA_CLASSIFICATION_PROMPT, videoClassificationPrompt,
} from "../lib/media-classification";
import { FACT_KEYS } from "../lib/media-analysis-contract";
import { acceptCaption } from "../lib/send-caption";

// Every key "no" = a fully clothed, plainly covered subject. Overrides turn keys on/unclear.
const allNo = Object.fromEntries(FACT_KEYS.map((k) => [k, "no"]));
function obs(evidence: Record<string, unknown> = {}, changes: Record<string, unknown> = {}) {
  return {
    evidence: { ...allNo, ...evidence },
    identifying: "A woman in an open white shirt stands outdoors and looks at the camera.",
    details: "The open shirt shows cleavage. She has long brown hair and stands on a lawn.",
    short_label: "open shirt outdoor",
    visible: ["open white shirt", "long brown hair", "lawn"],
    tags: ["topless", "tits", "outdoor", "solo"], // deliberately over-claimed: only "yes" evidence may license topless/tits
    ...changes,
  };
}
const norm = (e?: Record<string, unknown>, c?: Record<string, unknown>) => normalizeMediaClassification(obs(e, c));

// ---- flags and tags come from "yes" evidence only ----
const shirt = norm({ suggestive_pose: "yes" });
assert.equal(shirt.fields.is_nude, false, "open shirt and cleavage are not visible nudity");
assert.equal(shirt.fields.nsfw, false);
assert.equal(shirt.fields.explicitness, "suggestive");
assert.deepEqual(shirt.fields.tags, ["outdoor", "solo"], "topless/tits dropped without a nipples yes");
assert.equal(shirt.status, "analysed");
assert.deepEqual(shirt.contradictions, []);

const nude = norm({ nipples: "yes" }, { identifying: "A topless woman sits indoors.", details: "Her nipples are visible. She sits on a sofa.", short_label: "topless indoors", visible: ["topless", "sofa"] });
assert.equal(nude.fields.is_nude, true);
assert.equal(nude.fields.nsfw, true);
assert.equal(nude.fields.explicitness, "explicit");
assert.deepEqual(nude.fields.tags, ["outdoor", "solo", "topless", "tits"], "model scene tags kept, topless/tits licensed by nipples yes");
assert.equal(nude.status, "analysed");

for (const key of ["genitals", "anus", "bare_buttocks"]) {
  const r = norm({ [key]: "yes" }, { identifying: "A woman poses.", details: "A woman poses on a bed.", short_label: "pose", visible: ["bed"], tags: [] });
  assert.equal(r.fields.is_nude, true, key);
  assert.equal(r.fields.explicitness, "explicit", key);
}
const act = norm({ sexual_activity: "yes" }, { identifying: "A woman uses a toy.", details: "She sits on a bed.", short_label: "toy use", visible: ["bed"], tags: [] });
assert.equal(act.fields.is_nude, false, "a sexual act and visible nudity are separate observations");
assert.equal(act.fields.nsfw, true);
assert.equal(act.fields.explicitness, "explicit");

const ordinary = norm({}, { identifying: "A woman in a T-shirt sits at a desk.", details: "She types on a laptop.", short_label: "desk portrait", visible: ["T-shirt", "desk"], tags: ["solo", "invented"] });
assert.equal(ordinary.fields.explicitness, "none");
assert.deepEqual(ordinary.fields.tags, ["solo"]);

const car = norm({ swimwear: "yes" }, { identifying: "A woman in a white bikini top sits in a car.", details: "A seatbelt crosses her chest.", short_label: "bikini car", visible: ["white bikini top"], tags: ["bikini", "lingerie", "mirror_selfie", "solo"] });
assert.deepEqual(car.fields.tags, ["solo", "bikini"], "a bikini car selfie is neither lingerie nor a mirror selfie");
assert.equal(car.fields.explicitness, "suggestive");

// ---- "no" and "unclear" never make a tag or a flag ----
const tooMuch = norm({ nipples: "unclear", genitals: "no" }, { identifying: "A woman stands.", details: "She stands.", short_label: "standing", visible: ["standing"], tags: ["topless", "pussy", "anal", "full_nude", "ass", "bikini", "lingerie", "mirror_selfie"] });
assert.deepEqual(tooMuch.fields.tags, []);
assert.equal(tooMuch.fields.is_nude, false);
assert.equal(tooMuch.fields.nsfw, false);

// ---- unclear nudity can never read as clean ----
assert.equal(tooMuch.status, "needs_review");
assert.notEqual(tooMuch.fields.explicitness, "none", "unclear nipples must not read as explicitness none");
assert.match(tooMuch.issues[0], /nipples/);

// ---- worn garments are not bare buttocks (round 2) ----
const thong = norm({ lingerie: "yes", suggestive_pose: "yes" }, { identifying: "A woman in a red thong is seen from behind on a bed.", details: "She wears a red thong, buttocks visible from behind.", short_label: "red thong rear", visible: ["red thong", "bed"], tags: ["ass", "lingerie", "bed"] });
assert.equal(thong.fields.is_nude, false, "a worn thong is not nudity");
assert.equal(thong.fields.nsfw, false);
assert.equal(thong.fields.explicitness, "suggestive");
assert.ok(!thong.fields.tags.includes("ass"), "no ass tag without bare_buttocks yes");
assert.ok(thong.fields.tags.includes("lingerie"));
assert.equal(thong.status, "analysed");
// backstop: the model says bare_buttocks yes while the prose names a worn thong -> review, never a silent nude flag write
const thongYes = norm({ lingerie: "yes", bare_buttocks: "yes" }, { identifying: "A woman in a pink thong kneels on a bed.", details: "She wears a pink thong.", short_label: "pink thong", visible: ["pink thong", "bed"], tags: [] });
assert.equal(thongYes.status, "needs_review");
assert.match(thongYes.issues.join(" "), /thong/);
const pulled = norm({ lingerie: "yes", bare_buttocks: "yes" }, { identifying: "A woman bends over with her thong pulled down.", details: "The thong is pulled down to her thighs.", short_label: "thong pulled down", visible: ["thong pulled down"], tags: [] });
assert.equal(pulled.status, "analysed", "a garment pulled down leaves the buttocks bare");
assert.equal(pulled.fields.is_nude, true);

// ---- anus yes contradicted by the prose -> review; male genitals never get the pussy tag ----
const anusNo = norm({ anus: "yes", genitals: "yes", nipples: "no" }, { identifying: "A nude woman lies on a bed.", details: "Her anus is not visible.", short_label: "nude bed", visible: ["bed"], tags: [] });
assert.equal(anusNo.status, "needs_review");
assert.match(anusNo.issues.join(" "), /anus/);
const maleGen = norm({ genitals: "yes", sexual_activity: "yes" }, { identifying: "A woman kneels in front of a tattooed man.", details: "A woman performs a sex act on the man.", short_label: "couple", visible: ["tattooed man", "kneeling woman"], tags: ["pussy"] });
assert.ok(!maleGen.fields.tags.includes("pussy"), "no pussy tag when a man is the described subject");
assert.equal(maleGen.fields.is_nude, true);
const femGen = norm({ genitals: "yes" }, { identifying: "A nude woman lies on a bed.", details: "She lies on white sheets.", short_label: "nude bed", visible: ["bed"], tags: [] });
assert.ok(femGen.fields.tags.includes("pussy"));

// ---- prompt wording ----
assert.match(MEDIA_CLASSIFICATION_PROMPT, /thong, G-string, bikini bottom/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /photographing herself in a mirror/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /nipple or areola can be seen around, between or under the fingers/);

// ---- facts shape (the contract) ----
const f = shirt.fields.visual_facts;
assert.equal(f.v, 2);
assert.deepEqual(Object.keys(f.evidence).sort(), [...FACT_KEYS].sort());
assert.deepEqual(f.visible, ["open white shirt", "long brown hair", "lawn"]);
assert.equal(f.frames, undefined);
assert.equal(norm({}, {}).fields.visual_facts.frames, undefined);
assert.equal(normalizeMediaClassification(obs(), { frames: 5 }).fields.visual_facts.frames, 5);

// ---- description: first sentence identifies (<=140), optional final "Not visible" line, no hidden detail ----
const d = shirt.fields.visual_description;
assert.ok(d.startsWith("A woman in an open white shirt stands outdoors"), d);
assert.match(d, /Not visible: nipples, genitals, anus, bare buttocks\.$/);
assert.ok(d.split(/(?<=\.)\s/)[0].length <= 140);
const long = norm({}, { identifying: "A woman " + "with a very long description ".repeat(10) + "stands. She waits." });
assert.ok(long.fields.visual_description.split(/(?<=[.!?])\s/)[0].length <= 140, "identifying sentence is capped at 140 chars");
assert.equal(notVisibleLine({ ...allNo, nipples: "unclear" } as never), "Not visible: genitals, anus, bare buttocks.", "unclear is never listed as not visible");
const vid = normalizeMediaClassification(obs(), { frames: 5 });
assert.match(vid.fields.visual_description, /Based on 5 sampled frames\. Not visible:/);

// ---- negation-aware prose validation ----
const e = { ...allNo } as never;
assert.deepEqual(descriptionProblems("Her nipples are not visible and no genitals are shown.", e), [], "negated clauses are not claims");
assert.deepEqual(descriptionProblems("Nipples covered by a bikini top.", e), []);
assert.ok(descriptionProblems("She shows her nipples.", e).length > 0);
assert.ok(descriptionProblems("A mirror selfie.", e).length > 0);
assert.ok(descriptionProblems("She holds a vibrator.", e).length > 0);
assert.ok(descriptionProblems("She is sliding her hand down.", e).some((p) => /motion/.test(p)));
assert.ok(descriptionProblems("Then she turns around.", e, true).some((p) => /sampled frames/.test(p)));
assert.deepEqual(descriptionProblems("Then she turns around.", e, false), []);

// a contradiction is reported, the fallback holds only facts, and the status is needs_review
const bad = norm({}, { details: "She is topless on a mirror selfie in lingerie." });
assert.ok(bad.contradictions.length >= 2);
assert.equal(bad.status, "needs_review");
assert.doesNotMatch(bad.fields.visual_description, /topless|lingerie|mirror/i, "contradicted prose never survives");
assert.deepEqual(bad.fields.tags, ["outdoor", "solo"]);
for (const claim of ["topless outdoor", "nude outdoors", "exposed breasts", "lingerie outdoors", "bikini outdoors", "mirror selfie"]) {
  assert.ok(norm({}, { short_label: claim }).contradictions.length > 0, claim);
}

// ---- malformed answers throw so the bounded retry can run ----
assert.throws(() => norm({ nipples: "maybe" }), /evidence value for every key/);
assert.throws(() => norm({ nipples: true }), /evidence value for every key/, "booleans are not accepted: the string false must never become a yes");
assert.throws(() => normalizeMediaClassification(obs({}, { evidence: {} })), /evidence value for every key/);
assert.throws(() => norm({}, { identifying: "" }), /factual descriptions/);
assert.throws(() => normalizeMediaClassification(null), /Invalid visual metadata/);
assert.equal(norm({ nipples: "unsure" }).status, "needs_review", "unsure is read as unclear");

// ---- dashes ----
const dashed = norm({}, { details: "She is on the bed — legs together – smiling." });
assert.ok(!/[—–]/.test(dashed.fields.visual_description));
for (const [input, expected] of [
  ["I'm on the bed — legs spread for you", "I'm on the bed, legs spread for you"],
  ["one – two – three", "one, two, three"],
] as const) assert.equal(stripBannedDashes(input), expected);

// ---- the analysis prompt is factual only; the send caption lives elsewhere ----
for (const p of [MEDIA_CLASSIFICATION_PROMPT, videoClassificationPrompt(5)]) {
  assert.doesNotMatch(p, /SEND CAPTION/);
  assert.doesNotMatch(p, /first person|horny|tease|dare/i);
  assert.match(p, /observation task/);
  assert.match(p, /"unclear"/);
}
assert.match(videoClassificationPrompt(5), /5 separate frames/);
assert.match(videoClassificationPrompt(5), /no claims about motion/i);

// ---- send caption helpers ----
assert.equal(cleanSendCaption("mmm just for you — look at my ass 😈"), "mmm just for you, look at my ass 😈");
assert.equal(cleanSendCaption("look at me bent over 😈 tap to unlock it baby. can you see everything?"), "look at me bent over 😈 can you see everything?");
assert.doesNotMatch(cleanSendCaption("only 200 stars to see it. mmm look"), /stars/i);
assert.equal(acceptCaption("mmm check out my ass 😈 want more?", shirt.fields.visual_facts), "mmm check out my ass 😈 want more?");
assert.equal(acceptCaption("my nipples are out for you 😈 want a taste?", shirt.fields.visual_facts), null, "a caption may not claim what the facts do not confirm");
assert.equal(acceptCaption("my nipples are out for you 😈 want a taste?", nude.fields.visual_facts) !== null, true);
assert.equal(acceptCaption("only 200 stars to unlock this one baby"), null);

console.log("Media classification checks passed: yes-only tags and flags, unclear never clean, contract facts, description rules, negation-aware validation, retryable malformed answers, factual-only prompts.");
