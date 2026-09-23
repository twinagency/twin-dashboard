import assert from "node:assert/strict";
import { normalizeMediaClassification, VISUAL_EVIDENCE_KEYS } from "../lib/media-classification";

const clearEvidence = Object.fromEntries(VISUAL_EVIDENCE_KEYS.map((key) => [key, false]));
function metadata(evidence: Record<string, unknown> = {}, changes: Record<string, unknown> = {}) {
  return {
    caption: "woman in open white shirt outdoors, cleavage visible, looking at camera",
    auto_desc: "open shirt outdoor",
    tags: ["topless", "tits", "outdoor", "solo"],
    // Deliberately contradictory legacy/model flags must not override evidence.
    is_nude: true, nsfw: false, explicitness: "suggestive",
    visual_evidence: { ...clearEvidence, suggestive_pose_or_clothing: true, ...evidence },
    ...changes,
  };
}

const beach = normalizeMediaClassification(metadata());
assert.equal(beach.is_nude, false, "open shirt and cleavage are not visible nudity");
assert.equal(beach.nsfw, false);
assert.equal(beach.explicitness, "suggestive");
assert.deepEqual(beach.tags, ["outdoor", "solo"]);
assert.equal(beach.auto_desc, "open shirt outdoor");

const car = normalizeMediaClassification(metadata({ swimwear_visible: true }, {
  caption: "woman in white bikini top and crocheted shorts sitting in car, seatbelt across chest",
  auto_desc: "bikini car", tags: ["bikini", "lingerie", "mirror_selfie", "solo", "solo", "invented"],
}));
assert.equal(car.is_nude, false);
assert.equal(car.nsfw, false);
assert.equal(car.explicitness, "suggestive");
assert.deepEqual(car.tags, ["bikini", "solo"], "a bikini car selfie is neither lingerie nor a mirror selfie");

const nude = normalizeMediaClassification(metadata({ nipples_visible: true }, {
  caption: "topless adult sitting indoors", auto_desc: "topless indoors", tags: ["topless", "tits", "solo"],
  is_nude: false, nsfw: false, explicitness: "none",
}));
assert.equal(nude.is_nude, true, "genuine observed nudity must not be downgraded");
assert.equal(nude.nsfw, true);
assert.equal(nude.explicitness, "explicit");
assert.deepEqual(nude.tags, ["topless", "tits", "solo"]);

for (const feature of ["genitals_visible", "anus_visible", "bare_buttocks_visible"]) {
  const result = normalizeMediaClassification(metadata({ [feature]: true }));
  assert.equal(result.is_nude, true);
  assert.equal(result.nsfw, true);
  assert.equal(result.explicitness, "explicit");
}
const activity = normalizeMediaClassification(metadata({ sexual_activity_visible: true }));
assert.equal(activity.is_nude, false, "sexual activity and visible nudity are separate observations");
assert.equal(activity.nsfw, true);
assert.equal(activity.explicitness, "explicit");

const ordinary = normalizeMediaClassification(metadata({ suggestive_pose_or_clothing: false }, {
  caption: "person in a T-shirt sitting at a desk", auto_desc: "desk portrait", tags: ["solo"],
}));
assert.equal(ordinary.explicitness, "none");
assert.equal(ordinary.is_nude, false);
assert.equal(ordinary.nsfw, false);

const mirror = normalizeMediaClassification(metadata({ lingerie_visible: true, mirror_reflection_visible: true }, {
  caption: "adult in lingerie posing in a mirror", auto_desc: "lingerie mirror", tags: ["lingerie", "mirror_selfie"],
}));
assert.deepEqual(mirror.tags, ["lingerie", "mirror_selfie"]);
assert.equal(mirror.explicitness, "suggestive");

for (const claim of ["topless outdoor", "nude outdoors", "exposed breasts", "lingerie outdoors", "bikini outdoors", "mirror selfie"]) {
  assert.throws(() => normalizeMediaClassification(metadata({}, { auto_desc: claim })), /without visible evidence/);
}
assert.throws(() => normalizeMediaClassification(metadata({ nipples_visible: "false" })), /boolean evidence/,
  "the string false must never be coerced to true");
assert.throws(() => normalizeMediaClassification(metadata({}, { visual_evidence: {} })), /boolean evidence/);
assert.throws(() => normalizeMediaClassification(metadata({ full_nudity_visible: true })), /uncovered anatomy/);
assert.throws(() => normalizeMediaClassification(metadata({}, { caption: "" })), /factual descriptions/);
assert.throws(() => normalizeMediaClassification(null), /Invalid visual metadata/);

console.log("Media classification regression checks passed: cleavage, swimwear, true nudity, tags, contradictions and malformed evidence.");
