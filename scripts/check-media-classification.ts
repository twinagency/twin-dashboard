import assert from "node:assert/strict";
import {
  normalizeMediaClassification, stripBannedDashes, cleanSendCaption, descriptionProblems, notVisibleLine,
  MEDIA_CLASSIFICATION_PROMPT, videoClassificationPrompt, secondLookPrompt, sentencesUpTo,
} from "../lib/media-classification";
import { FACT_KEYS } from "../lib/media-analysis-contract";
import { acceptCaption, inventedWords } from "../lib/send-caption";

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

// A positive genital flag must be supported by an affirmative factual description,
// just as an anus flag already requires support. Sheer fabric alone is not anatomy.
for (const details of [
  "She wears a black sheer thong and a mesh top.",
  "Her genitals are not visible through the fabric.",
]) {
  const r = norm({ genitals: "yes", lingerie: "yes" }, {
    identifying: "A woman in a sheer lingerie set kneels on a couch.",
    details, short_label: "sheer lingerie couch", visible: ["black sheer thong", "mesh top"], tags: [],
  });
  assert.equal(r.status, "needs_review", "unsubstantiated positive genital flag must be held");
  assert.ok(r.issues.some(p => /genitals.*affirm/.test(p)));
}
const supportedGenitals = norm({ genitals: "yes" }, {
  identifying: "A woman poses on a bed.", details: "The external genital anatomy is clearly visible.",
  short_label: "pose on bed", visible: ["bed"], tags: [],
});
assert.equal(supportedGenitals.status, "analysed", "affirmative named anatomy preserves an otherwise consistent observation");

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
// anus=yes needs the prose to name it (or a plug / insertion): a silent "yes" is an unsupported claim and goes to review, not "analysed".
const silentAnus = norm({ anus: "yes", bare_buttocks: "yes" }, { identifying: "A woman poses on a bed.", details: "She lies face down on a bed.", short_label: "bed pose", visible: ["bed"], tags: ["anal"] });
assert.equal(silentAnus.status, "needs_review", "anus yes with no mention of it must not be saved as analysed");
const namedAnus = norm({ anus: "yes", bare_buttocks: "yes" }, { identifying: "A woman lies face down with a pink plug inserted.", details: "Her anus is visible on a bed.", short_label: "plug bed", visible: ["bed", "pink plug"], tags: ["anal"] });
assert.equal(namedAnus.status, "analysed", "anus yes backed by the prose stays analysed");

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

// Explicit crop coverage can make a photo usable for its confirmed facts, without asserting absent anatomy.
for (const key of ["nipples", "genitals", "anus", "bare_buttocks"]) {
  const cropped = norm({ [key]: "unclear" }, {
    identifying: "A woman in a grey sweatshirt takes a close-up portrait.", details: "The photo is cropped at her shoulders.",
    short_label: "grey sweatshirt portrait", visible: ["grey sweatshirt"], tags: ["solo", "topless", "pussy", "anal", "ass"],
    uncertainty_reasons: { [key]: "out_of_frame" },
  });
  assert.equal(cropped.status, "analysed", key);
  assert.equal(cropped.fields.visual_facts.evidence[key as keyof typeof cropped.fields.visual_facts.evidence], "unclear");
  assert.equal(cropped.fields.visual_facts.uncertainty_reasons?.[key as keyof typeof cropped.fields.visual_facts.evidence], "out_of_frame");
  assert.deepEqual(cropped.fields.tags, ["solo"]);
  assert.equal(cropped.fields.explicitness, "none", "a crop alone does not establish a suggestive or explicit category");
  assert.equal(cropped.fields.is_nude, false);
  assert.equal(cropped.fields.nsfw, false);
  assert.ok(!cropped.fields.visual_description.includes(`Not visible: ${key}`));
  assert.ok(descriptionProblems(`Her ${key.replace("bare_buttocks", "buttocks")} are visible.`, cropped.fields.visual_facts.evidence).length);
  const ambiguous = norm({ [key]: "unclear" }, { tags: ["solo"], uncertainty_reasons: { [key]: "ambiguous_visibility" } });
  assert.equal(ambiguous.status, "needs_review", "in-frame ambiguity stays held");
}
assert.equal(norm({ nipples: "unclear", genitals: "unclear" }, {
  tags: ["solo"], uncertainty_reasons: { nipples: "out_of_frame" },
}).status, "needs_review", "an unexplained second uncertainty is not waived");
assert.equal(norm({ nipples: "unclear" }, {
  identifying: "A topless woman stands.", details: "Her nipples are visible.", short_label: "topless pose",
  visible: ["topless"], uncertainty_reasons: { nipples: "out_of_frame" },
}).status, "needs_review", "a crop explanation cannot license contradictory prose");
for (const reasons of [{ nipples: "guess" }, { invented: "out_of_frame" }, [], null]) {
  assert.throws(() => norm({ nipples: "unclear" }, { uncertainty_reasons: reasons }), /uncertainty reason|uncertainty_reasons/);
}
assert.throws(() => norm({ nipples: "yes" }, { uncertainty_reasons: { nipples: "out_of_frame" } }), /uncertainty reason/);
const videoCrop = normalizeMediaClassification(obs({ nipples: "unclear" }, {
  tags: ["solo"], uncertainty_reasons: { nipples: "out_of_frame" },
}), { frames: 5 });
assert.equal(videoCrop.status, "needs_review", "photo coverage does not weaken the video gate");
assert.ok(!videoClassificationPrompt(5).includes("uncertainty_reasons"), "video analysis instructions remain unchanged");
const croppedFullNude = norm({ full_nudity: "yes", genitals: "unclear" }, {
  identifying: "A nude woman stands near a wall.", details: "The lower body is outside the crop.",
  short_label: "portrait by a wall", visible: ["wall"], tags: ["full_nude"],
  uncertainty_reasons: { genitals: "out_of_frame" },
});
assert.equal(croppedFullNude.status, "needs_review", "an out-of-frame region cannot establish whole-body nudity");
assert.ok(!croppedFullNude.fields.tags.includes("full_nude"));
assert.equal(croppedFullNude.fields.visual_facts.evidence.genitals, "unclear");

// ---- round 5, decision 1: visible cheeks with a worn thong are bare_buttocks yes, but a worn thong alone is not nudity ----
const thongBack = norm({ bare_buttocks: "yes", lingerie: "yes", suggestive_pose: "yes" }, { identifying: "A woman in a red thong is seen from behind on a bed.", details: "She wears a red thong, her bare buttocks visible from behind.", short_label: "red thong rear", visible: ["red thong", "bed"], tags: ["ass", "lingerie", "bed"] });
assert.equal(thongBack.fields.is_nude, false, "a worn thong alone is not nudity");
assert.equal(thongBack.fields.nsfw, false);
assert.equal(thongBack.fields.explicitness, "suggestive");
assert.ok(thongBack.fields.tags.includes("ass"), "visible cheeks license the ass tag even with a thong");
assert.ok(thongBack.fields.tags.includes("lingerie"));
assert.equal(thongBack.fields.visual_facts.evidence.bare_buttocks, "yes");
assert.equal(thongBack.status, "analysed", "no contradiction: not needs_review");
assert.deepEqual(thongBack.contradictions, []);
// the same frame with the model answering bare_buttocks "no" (cheeks not visible) gets no ass tag
const thongCovered = norm({ lingerie: "yes", suggestive_pose: "yes" }, { identifying: "A woman in a red thong is seen from behind on a bed.", details: "She wears a red thong.", short_label: "red thong rear", visible: ["red thong", "bed"], tags: ["ass", "lingerie", "bed"] });
assert.ok(!thongCovered.fields.tags.includes("ass"));
assert.equal(thongCovered.fields.is_nude, false);
// thong plus another nudity key stays nude/explicit (other evidence)
const thongNipples = norm({ bare_buttocks: "yes", nipples: "yes", lingerie: "yes" }, { identifying: "A topless woman in a pink thong kneels on a bed.", details: "Her nipples are visible and she wears a pink thong.", short_label: "topless thong", visible: ["pink thong", "bed"], tags: [] });
assert.equal(thongNipples.fields.is_nude, true);
assert.equal(thongNipples.fields.explicitness, "explicit");
// nothing worn: buttocks yes keeps nude/explicit
const nakedBack = norm({ bare_buttocks: "yes" }, { identifying: "A nude woman is seen from behind on a bed.", details: "Her bare buttocks are visible. She kneels on white sheets.", short_label: "nude from behind", visible: ["bed"], tags: ["ass"] });
assert.equal(nakedBack.fields.is_nude, true);
assert.equal(nakedBack.fields.nsfw, true);
assert.equal(nakedBack.fields.explicitness, "explicit");
assert.ok(nakedBack.fields.tags.includes("ass"));
// a thong pulled down/aside leaves the buttocks bare: nude/explicit as before
const pulled = norm({ lingerie: "yes", bare_buttocks: "yes" }, { identifying: "A woman bends over with her thong pulled down.", details: "The thong is pulled down to her thighs.", short_label: "thong pulled down", visible: ["thong pulled down"], tags: [] });
assert.equal(pulled.status, "analysed", "a garment pulled down leaves the buttocks bare");
assert.equal(pulled.fields.is_nude, true);
assert.equal(pulled.fields.explicitness, "explicit");
// a worn thong alone must not allow full_nudity
const thongFull = norm({ full_nudity: "yes", bare_buttocks: "yes", lingerie: "yes" }, { identifying: "A woman in a black thong stands on a bed.", details: "She wears a black thong.", short_label: "black thong", visible: ["black thong", "bed"], tags: ["full_nude"] });
assert.equal(thongFull.status, "needs_review");
assert.ok(!thongFull.fields.tags.includes("full_nude"));
// nude words are not licensed by thong-only buttocks
const thongNaked = norm({ bare_buttocks: "yes", lingerie: "yes" }, { identifying: "A naked woman in a thong stands on a bed.", details: "She wears a thong.", short_label: "thong", visible: ["thong"], tags: [] });
assert.ok(thongNaked.contradictions.some((c) => /nudity/.test(c)), "'naked' is not licensed by thong-only cheeks");

// ---- round 5, decision 2: anatomy through sheer fabric is yes only when clearly discernible; an outline is not ----
const sheerYes = norm({ nipples: "yes", lingerie: "yes" }, { identifying: "A woman in a sheer white bodysuit stands in a bedroom.", details: "Her nipples are clearly visible through the transparent mesh.", short_label: "sheer bodysuit", visible: ["sheer white bodysuit", "bedroom"], tags: ["topless"] });
assert.equal(sheerYes.status, "analysed", "a discernible nipple through sheer fabric is not a contradiction");
assert.equal(sheerYes.fields.is_nude, true);
assert.ok(sheerYes.fields.tags.includes("topless"));
const sheerOutline = norm({ nipples: "yes", lingerie: "yes" }, { identifying: "A woman in a sheer white bodysuit stands in a bedroom.", details: "The faint outline of her nipples shows through the fabric.", short_label: "sheer bodysuit", visible: ["sheer white bodysuit"], tags: [] });
assert.equal(sheerOutline.status, "needs_review", "an outline answered yes is not accepted");
assert.match(sheerOutline.issues.join(" "), /outline/);
const sheerUnclear = norm({ nipples: "unclear", lingerie: "yes" }, { identifying: "A woman in a sheer white bodysuit stands.", details: "Her chest shows through the mesh.", short_label: "sheer bodysuit", visible: ["sheer white bodysuit"], tags: ["topless"] });
assert.equal(sheerUnclear.status, "needs_review");
assert.ok(!sheerUnclear.fields.tags.includes("topless"));

// ---- round 5, decision 3: a hand over the nipple means nipples no and no topless/tits tag ----
const handOver = norm({ nipples: "no", suggestive_pose: "yes" }, { identifying: "A woman covers her breasts with one hand and wears white shorts.", details: "Her hand covers her nipples. She stands in a bedroom.", short_label: "hand over chest", visible: ["white shorts", "bedroom"], tags: ["topless", "tits"] });
assert.ok(!handOver.fields.tags.includes("topless") && !handOver.fields.tags.includes("tits"));
assert.equal(handOver.fields.is_nude, false);
assert.equal(handOver.status, "analysed");
assert.match(handOver.fields.visual_description, /Not visible: nipples/);
const between = norm({ nipples: "yes" }, { identifying: "A woman covers her breasts with her hand.", details: "A nipple shows between her fingers.", short_label: "hand on chest", visible: ["hand"], tags: [] });
assert.ok(between.fields.tags.includes("topless"), "a nipple actually seen between fingers stays yes");
// the invented-exposure claim is a contradiction
const invented = norm({ nipples: "no" }, { identifying: "A topless woman covers herself with her hand.", details: "She stands.", short_label: "topless hand", visible: ["hand"], tags: [] });
assert.ok(invented.contradictions.length > 0 && invented.status === "needs_review");

// ---- round 5, decision 4: body paint is not a garment ----
const paint = norm({ swimwear: "yes" }, { identifying: "A woman with a red and blue painted bikini design stands on a beach.", details: "The paint covers her chest and hips.", short_label: "painted bikini", visible: ["body paint"], tags: ["bikini", "outdoor"] });
assert.ok(!paint.fields.tags.includes("bikini"), "paint licenses no bikini tag");
assert.equal(paint.status, "needs_review");
assert.match(paint.issues.join(" "), /paint/);
const paintNo = norm({ swimwear: "no", nipples: "unclear" }, { identifying: "A woman wearing only red body paint on her chest stands on a beach.", details: "Red paint covers her chest and hips.", short_label: "body paint beach", visible: ["red body paint", "beach"], tags: ["bikini"] });
assert.ok(!paintNo.fields.tags.includes("bikini"));
assert.deepEqual(paintNo.contradictions, [], "describing paint as paint is not a swimwear claim");
const realBikini = norm({ swimwear: "yes" }, { identifying: "A woman in a red bikini stands on a beach with painted nails.", details: "She has painted nails.", short_label: "red bikini", visible: ["red bikini"], tags: ["bikini"] });
assert.ok(realBikini.fields.tags.includes("bikini"));
assert.equal(realBikini.status, "analysed");

// ---- round 5, decision 5: a mirror in the background is not a mirror selfie ----
const bgMirror = norm({ mirror_reflection: "yes" }, { identifying: "A woman in a grey dress stands in a room with a large mirror in the background.", details: "She looks at the camera.", short_label: "grey dress room", visible: ["grey dress", "mirror in the background"], tags: ["mirror_selfie"] });
assert.ok(!bgMirror.fields.tags.includes("mirror_selfie"));
assert.equal(bgMirror.status, "needs_review");
const bgMirrorNo = norm({ mirror_reflection: "no" }, { identifying: "A woman in a grey dress stands in a room with a large mirror in the background.", details: "She looks at the camera.", short_label: "grey dress room", visible: ["grey dress", "mirror in the background"], tags: ["mirror_selfie"] });
assert.ok(!bgMirrorNo.fields.tags.includes("mirror_selfie"));
assert.equal(bgMirrorNo.status, "analysed", "a plain mirror object is a fact, not a claim");
const realMirror = norm({ mirror_reflection: "yes" }, { identifying: "A woman takes a mirror selfie holding her phone.", details: "A second mirror hangs in the background.", short_label: "mirror selfie", visible: ["phone", "mirror"], tags: [] });
assert.ok(realMirror.fields.tags.includes("mirror_selfie"));
assert.equal(realMirror.status, "analysed");

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
assert.match(MEDIA_CLASSIFICATION_PROMPT, /thong or G-string/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /outline or ambiguous shape is "unclear"/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /Body paint is not a garment/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /mirror in the background/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /photographing herself in a mirror/);
assert.match(MEDIA_CLASSIFICATION_PROMPT, /nipple or areola itself \(the darker disc\) can be seen/);

// ---- facts shape (the contract) ----
// Both calls must ask for the same visibility threshold; a second call cannot silently change the rubric.
for (const prompt of [MEDIA_CLASSIFICATION_PROMPT, videoClassificationPrompt(5), secondLookPrompt(undefined, ["genitals", "anus", "nipples"]), secondLookPrompt(5, ["genitals", "anus"])]) {
  assert.match(prompt, /anatomy itself.*clearly discernible/i, "discernible anatomy, not clothing presence, decides visibility");
  assert.doesNotMatch(prompt, /sheer fabric\/hat\/hand/, "sheer fabric is not an unconditional prohibition");
  assert.doesNotMatch(prompt, /or an object is plainly seen inserted/, "an inserted object is not independent proof that the opening is visible");
  assert.doesNotMatch(prompt, /a hand or fabric over the nipple means no/, "transparent fabric cannot conflict with the sheer rule");
}

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

// ---- round 3 ----
const evAll = (o: Record<string, string> = {}) => ({ ...allNo, ...o }) as Parameters<typeof descriptionProblems>[1];
// thong: allowed when swimwear OR lingerie is yes, still a contradiction when neither is
assert.deepEqual(descriptionProblems("A woman in red thong bikini bottoms.", evAll({ swimwear: "yes" })), []);
assert.deepEqual(descriptionProblems("A woman in a black thong.", evAll({ lingerie: "yes" })), []);
assert.ok(descriptionProblems("A woman in a black thong.", evAll()).length > 0);
assert.ok(descriptionProblems("She wears a lace bodysuit.", evAll({ swimwear: "yes" })).length > 0, "lingerie words still need lingerie yes");
// mirror: an object is not a claim, being in it is
assert.deepEqual(descriptionProblems("mirror", evAll()), []);
assert.deepEqual(descriptionProblems("A mirror hangs on the wall behind the bed.", evAll()), []);
assert.deepEqual(descriptionProblems("There is no mirror in frame.", evAll()), []);
for (const t of ["A mirror selfie.", "She poses in the mirror.", "She stands in front of a large mirror.", "Her reflection shows her back."]) {
  assert.ok(descriptionProblems(t, evAll()).length > 0, t);
  assert.deepEqual(descriptionProblems(t, evAll({ mirror_reflection: "yes" })), [], t);
}
// video clip narration: static camera claims
for (const t of ["The camera is static.", "The camera angle is static.", "A static shot."]) {
  assert.ok(descriptionProblems(t, evAll(), true).length > 0, t);
  assert.deepEqual(descriptionProblems(t, evAll(), false), [], `${t} (photo)`);
}
assert.deepEqual(descriptionProblems("The camera angle is low.", evAll(), true), []);
// headline cut: no fragment, no period glued onto one
const c08 = "A woman with light skin and no visible hair lies on a bed in bright pink lingerie, holding her breasts in a suggestive pose across three";
const c14 = "A woman with long dark hair and arm tattoos, wearing a white crop top and red shorts, seated and looking over her shoulder in a red-walled";
assert.equal(sentencesUpTo(c14 + " room.", 140), "A woman with long dark hair and arm tattoos, wearing a white crop top and red shorts.");
assert.equal(sentencesUpTo(c08 + " frames of the clip.", 140), "A woman with light skin and no visible hair lies on a bed in bright pink lingerie.");
// no comma to cut at: word boundary, dangling words dropped, NO period glued onto the fragment
const noComma = "A tattooed woman with long dark hair stands in a bedroom and looks over her shoulder at the camera while sitting in a red-walled room.";
const frag = sentencesUpTo(noComma + " Extra detail follows here to be long enough.", 130);
assert.ok(frag.length <= 130 && !/[.!?]$/.test(frag) && !/\b(in|a|the|at|of|and|across)$/.test(frag), frag);
assert.equal(sentencesUpTo("Short one.", 140), "Short one.");
{
  const r = norm({}, { identifying: c14 + " room. She waits.", details: "" });
  assert.ok(!/red-walled\./.test(r.fields.visual_description), r.fields.visual_description);
  assert.ok(r.fields.visual_description.startsWith("A woman with long dark hair and arm tattoos, wearing a white crop top and red shorts."));
}
// full_nudity with a worn garment on the body
{
  const r = norm({ full_nudity: "yes", genitals: "yes" }, { identifying: "A red-haired woman lies on a bed.", details: "A pink top is bunched on her torso.", short_label: "bed", visible: ["pink top bunched on torso"], tags: ["full_nude"] });
  assert.equal(r.status, "needs_review");
  assert.ok(!r.fields.tags.includes("full_nude"));
  assert.match(r.issues.join(" "), /worn garment/);
  const fine = norm({ full_nudity: "yes", genitals: "yes" }, { identifying: "A red-haired woman lies nude on a bed.", details: "Her top is pulled off and lies beside her.", short_label: "bed", visible: ["bed"], tags: [] });
  assert.equal(fine.fields.tags.includes("full_nude"), true);
  assert.ok(descriptionProblems("She is fully nude.", evAll({ genitals: "yes" })).length > 0, "'fully nude' needs full_nudity yes");
}
// send caption: words the facts do not support, wrong persona
{
  const ev = evAll({ genitals: "yes", lingerie: "yes", suggestive_pose: "yes" });
  const facts = "A woman lies on a bed in a black thong, legs spread. Not visible: anus.";
  assert.equal(acceptCaption("laying here in my thong, legs open for you 😈 like what you see?", { evidence: ev }, facts) !== null, true);
  for (const bad of ["so wet and damp through my thong 😈 want a look?", "two fingers deep for you 😈 like it?", "i just came, cum everywhere 😈 look", "this loose shirt is coming off 😈 wanna see?"]) {
    assert.equal(acceptCaption(bad, { evidence: ev }, facts), null, bad);
  }
  assert.deepEqual(inventedWords("so wet and deep", "she is wet"), ["deep"]);
  const man = "A man with short hair lies on a bed, stroking his penis.";
  assert.equal(acceptCaption("look at my pussy and my tits spread for you 😈 like it?", undefined, man), null, "no female persona on a clip of a man");
  assert.equal(acceptCaption("mmm my pussy is on show for you 😈 like it?", undefined, "A woman shows her pussy on a bed."), "mmm my pussy is on show for you 😈 like it?");
  assert.equal(acceptCaption("mmm my tits are out for you 😈 like it?", undefined, "A woman lies on a bed in a thong."), null, "a body part the facts do not name");
}

// A coherent positive claim through a lower garment is still an unresolved
// visibility exception. This does not relabel transparent anatomy as absent.
for (const garment of ["sheer thong", "lace underwear", "mesh bikini bottom"]) {
  const r = norm({ genitals: "yes", lingerie: "yes", swimwear: "yes" }, {
    identifying: `A woman wears a ${garment}.`,
    details: "Her external genital anatomy is described as visible through the fabric.",
    short_label: "garment front view", visible: [garment], tags: [],
  });
  assert.equal(r.status, "needs_review", `coherent through-garment claim held: ${garment}`);
  assert.equal(r.fields.visual_facts.evidence.genitals, "yes", "preserve the observation for review, do not invent no");
  assert.match(r.issues.join(" "), /genital visibility.*garment.*review/i);
}
{
  const r = norm({ genitals: "yes", lingerie: "yes" }, {
    identifying: "A woman wears a transparent robe.", details: "Her vulva is visible through the fabric.",
    short_label: "transparent robe", visible: ["transparent robe"], tags: [],
  });
  assert.equal(r.status, "needs_review", "through-fabric claim does not depend on a particular garment tag");
  const bare = norm({ genitals: "yes" }, {
    identifying: "A woman sits on a sheet.", details: "Her external genital anatomy is clearly visible.",
    short_label: "seated on sheet", visible: ["white sheet"], tags: [],
  });
  assert.equal(bare.status, "analysed", "no blanket hold of every positive anatomy observation");
  const concealed = norm({ lingerie: "yes" }, {
    identifying: "A woman wears a black thong.", details: "Black fabric covers the lower front.",
    short_label: "black thong", visible: ["black thong"], tags: [],
  });
  assert.equal(concealed.status, "analysed", "a worn garment alone does not require review");
}

// A real staging correction changed held paintbrushes into painted imagery.
// Hold that unresolved distinction without holding ordinary painted skin.
for (const details of [
  "Blue body paint covers her arm, with a painted paintbrush design on her torso.",
  "Blue body paint has a trompe-l'oeil design of paintbrushes across the chest.",
  "Blue body paint includes a painted image of a brush on her torso.",
  "Blue body paint is shaped like a paintbrush on her torso and arm.",
  "The paint forms an image of a paintbrush across her chest and right arm.",
]) {
  const r = norm({}, { identifying: "A woman with body paint poses against a white backdrop.", details, short_label: "painted torso", visible: [], tags: [] });
  assert.equal(r.status, "needs_review");
  assert.match(r.issues.join(" "), /body-paint object depiction requires review/);
}
for (const details of [
  "Blue body paint covers her arm. She holds two paintbrushes in one hand.",
  "Blue body paint covers her arm. The brushes are real, not a painted brush design.",
  "Her nails have a painted flower design.",
]) {
  assert.equal(norm({}, { identifying: "A woman poses against a white backdrop.", details, short_label: "portrait", visible: [], tags: [] }).status, "analysed", details);
}

console.log("Media classification checks passed: yes-only tags and flags, unclear never clean, contract facts, description rules, negation-aware validation, retryable malformed answers, factual-only prompts.");
