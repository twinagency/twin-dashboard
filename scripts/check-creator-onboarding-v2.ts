import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CREATOR_QUESTIONNAIRE } from "../lib/creator-questionnaire";
import {
  CREATOR_QUESTIONNAIRE_PAGES,
  creatorQuestionnairePage,
  nextQuestionnaireRevision,
  parseQuestionnairePagePatch,
  questionnairePageQuestions,
  questionnaireRequiredMissing,
} from "../lib/creator-questionnaire-draft";
import {
  CREATOR_CONTENT_REQUIREMENTS,
  creatorContentCompleted,
  creatorContentCounts,
  creatorContentRequirementsMet,
  isCreatorContentKind,
} from "../lib/creator-content-requirements";
import {
  CREATOR_IMAGE_DECODE_TIMEOUT_SECONDS,
  CREATOR_IMAGE_MAX_CHANNELS,
  CREATOR_IMAGE_MAX_PIXELS,
  CREATOR_IMAGE_PROBE_EDGE,
} from "../lib/creator-image-validation";

const pagedQuestions = CREATOR_QUESTIONNAIRE_PAGES.flatMap(questionnairePageQuestions);
const deletedQuestionIds = [
  "appearance_physical",
  "creating_duration",
  "platforms",
  "main_niche",
  "lifestyle_routines",
  "secondary_niche",
  "audience_description",
  "audience_size",
  "audience_interests",
  "creator_persona",
  "content_unique",
  "core_values",
  "content_style",
  "ai_personality",
  "short_term_goals",
  "collabs",
  "fun_fact",
  "ai_dont_know",
  "car",
  "parents_status",
  "creator_friends",
  "inspires_you",
  "best_advice",
  "top_accomplishments",
  "most_extreme",
] as const;

assert.equal(CREATOR_QUESTIONNAIRE_PAGES.length, 17);
assert.equal(CREATOR_QUESTIONNAIRE.length, 83);
assert.equal(pagedQuestions.length, 83);
assert.equal(new Set(pagedQuestions.map(({ id }) => id)).size, 83);
assert.deepEqual(pagedQuestions.map(({ id }) => id), CREATOR_QUESTIONNAIRE.map(({ id }) => id), "Questionnaire pages must preserve every canonical question in order");
for (const id of deletedQuestionIds) {
  assert.equal(CREATOR_QUESTIONNAIRE.some((question) => question.id === id), false, `${id} must remain deleted`);
}
assert.ok(CREATOR_QUESTIONNAIRE_PAGES.every((page) => questionnairePageQuestions(page).length <= 8), "Every questionnaire part must stay short");
assert.equal(creatorQuestionnairePage("forged").slug, CREATOR_QUESTIONNAIRE_PAGES[0].slug);

const firstPage = CREATOR_QUESTIONNAIRE_PAGES[0];
assert.deepEqual(parseQuestionnairePagePatch(firstPage, { full_name: "  Creator Name  ", preferred_name: "Creator" }), { full_name: "Creator Name", preferred_name: "Creator" });
assert.deepEqual(parseQuestionnairePagePatch(firstPage, { full_name: "" }), { full_name: "" }, "An explicit blank must clear only that answer");
assert.throws(() => parseQuestionnairePagePatch(firstPage, { boundaries: "forged cross-page value" }), /Unsupported/);
const tonePage = CREATOR_QUESTIONNAIRE_PAGES.find((page) => page.slug === "style-tone-ai")!;
assert.throws(() => parseQuestionnairePagePatch(tonePage, { humour_style: "Forged choice" }), /Invalid questionnaire choice/);
assert.deepEqual(questionnaireRequiredMissing({ full_name: "A", preferred_name: "B", boundaries: "D" }), []);
assert.deepEqual(questionnaireRequiredMissing({ full_name: "A" }), ["preferred_name", "boundaries"]);
assert.ok(Date.parse(nextQuestionnaireRevision("2099-01-01T00:00:00.000Z")) > Date.parse("2099-01-01T00:00:00.000Z"));

assert.deepEqual(CREATOR_CONTENT_REQUIREMENTS.map(({ kind, minimum }) => [kind, minimum]), [
  ["content_sfw_image", 20],
  ["content_nsfw_image", 30],
  ["content_sfw_video", 15],
  ["content_nsfw_video", 30],
]);
for (const { kind } of CREATOR_CONTENT_REQUIREMENTS) assert.equal(isCreatorContentKind(kind), true);
assert.equal(isCreatorContentKind("content"), false);
assert.equal(isCreatorContentKind("voice"), false);
assert.equal(isCreatorContentKind("content_forged"), false);
const imageRequirements = CREATOR_CONTENT_REQUIREMENTS.filter(({ media }) => media === "image");
assert.ok(imageRequirements.every(({ accept }) => accept === "image/jpeg,image/png,image/webp,image/gif"));
assert.ok(imageRequirements.every(({ accept, formatHint }) => !/heic|heif/i.test(`${accept} ${formatHint}`)));
assert.ok(imageRequirements.every(({ formatHint }) => /JPG, PNG, WebP or GIF/.test(formatHint)));
assert.equal(CREATOR_IMAGE_MAX_PIXELS, 25_000_000);
assert.equal(CREATOR_IMAGE_MAX_CHANNELS, 4);
assert.equal(CREATOR_IMAGE_PROBE_EDGE, 32);
assert.equal(CREATOR_IMAGE_DECODE_TIMEOUT_SECONDS, 5);

const files = CREATOR_CONTENT_REQUIREMENTS.flatMap(({ kind, minimum }) => Array.from({ length: minimum }, () => ({ kind, storage_transfer_status: "verified" })));
assert.equal(creatorContentRequirementsMet(files), true);
for (const requirement of CREATOR_CONTENT_REQUIREMENTS) {
  const oneShort = files.filter((file, index) => file.kind !== requirement.kind || index !== files.findIndex((candidate) => candidate.kind === requirement.kind));
  assert.equal(creatorContentRequirementsMet(oneShort), false, `${requirement.kind} must enforce its minimum`);
}
assert.equal(creatorContentRequirementsMet([...files, { kind: "content", storage_transfer_status: "verified" }]), true, "Legacy rows must remain harmless");
const legacyOnly = [{ kind: "content", storage_transfer_status: "verified" }];
assert.equal(creatorContentCompleted(legacyOnly, true), true, "Previously completed legacy uploads must remain grandfathered");
assert.equal(creatorContentCompleted(legacyOnly, false), false, "New creators must meet the categorized minimums");
assert.equal(creatorContentRequirementsMet(files.map((file, index) => index === 0 ? { ...file, storage_transfer_status: "pending" } : file)), false, "Only verified files count");
const counts = creatorContentCounts(files);
for (const { kind, minimum } of CREATOR_CONTENT_REQUIREMENTS) assert.equal(counts[kind], minimum);

const uploadRoute = readFileSync("app/creator-auth/upload/route.ts", "utf8");
assert.match(uploadRoute, /isCreatorContentKind\(kind\)/);
assert.match(uploadRoute, /creatorContentCompleted\(verifiedFiles \|\| \[\], !!progress\?\.content_completed\)/);
assert.match(uploadRoute, /contentSignatureMatches/);
assert.match(uploadRoute, /creatorImageDecodes/);
assert.match(uploadRoute, /boundedFormData/);
assert.match(uploadRoute, /MAX_ACTIVE_UPLOADS = 4/);
assert.match(uploadRoute, /mediaToolPath\("ffprobe"\)/);
assert.match(uploadRoute, /mediaToolPath\("ffmpeg"\)/);
assert.match(uploadRoute, /creatorUploadsEditable\(application\?\.status, creator\)/);
assert.doesNotMatch(uploadRoute, /kind !== "content" && kind !== "voice"/);
const submitRoute = readFileSync("app/creator-auth/onboarding/route.ts", "utf8");
assert.match(submitRoute, /creatorContentCompleted\(files \|\| \[\], !!progress\?\.content_completed\)/);
assert.match(submitRoute, /questionnaireRequiredMissing/);
assert.match(submitRoute, /CREATOR_QUESTIONNAIRE_TERMINAL_STATUSES/);
const pageSource = readFileSync("app/creator/onboarding/page.tsx", "utf8");
assert.match(pageSource, /<CreatorQuestionnaireWizard/);
assert.match(pageSource, /<ReadinessItem/);
assert.match(pageSource, /disabled=\{submitted \|\| !readyToSubmit \|\| applicationLocked\}/);
const dockerSource = readFileSync("Dockerfile", "utf8");
assert.match(dockerSource, /apk add --no-cache ffmpeg/);

console.log("CREATOR ONBOARDING V2 PASSED: 83 questions in 17 short autosave parts, strict category counts, verified-only content requirements, and gated final submission.");
