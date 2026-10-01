import assert from "node:assert/strict";
import { parseMediaBundleCampaign, sameMediaBundleCampaign, mediaCampaignReviewKey } from "../media-campaign";
import { classifyFan, type CandidateRow, type ClassifyContext } from "../audience";
import { validateMessage } from "../media-caption";

const cloneId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const h = (s: string) => s.repeat(64);
const freeCaption = "Two free videos for you ❤️\nReply if you want the rest.";
const paidCaption = "Unlock the full bundle ❤️";
const manifest = {
  version: 1 as const, cloneId, kind: "video" as const, caption: freeCaption,
  assets: ["a", "b"].map((hash, i) => ({ id: `${id}-${i}`, sha256: h(hash), width: 510, height: 880, durationSeconds: 30 + i })),
  bundle: { id, starPrice: 1900, caption: paidCaption, itemPaths: [`${cloneId}/campaigns/${id}/${h("c")}.jpg`, `${cloneId}/campaigns/${id}/${h("d")}.mp4`] },
};
const parsed = parseMediaBundleCampaign(manifest, cloneId);
assert.deepEqual(parsed, manifest, "ordered free album and mixed paid bundle roundtrip exactly");
assert.equal(parsed.caption, freeCaption);
assert.equal(parsed.bundle.caption, paidCaption);
assert.equal(parsed.bundle.starPrice, 1900);
const reordered = { bundle: { itemPaths: [...manifest.bundle.itemPaths], caption: paidCaption, starPrice: 1900, id }, assets: manifest.assets.map(a => ({ durationSeconds: a.durationSeconds, height: a.height, width: a.width, sha256: a.sha256, id: a.id })), caption: freeCaption, kind: "video", cloneId, version: 1 };
assert.equal(sameMediaBundleCampaign(manifest, reordered, cloneId), true, "JSONB key order cannot break retry identity");
assert.equal(sameMediaBundleCampaign(manifest, { ...manifest, assets: [...manifest.assets].reverse() }, cloneId), false, "reordered free media changes identity");
assert.equal(sameMediaBundleCampaign(manifest, { ...manifest, bundle: { ...manifest.bundle, starPrice: 1901 } }, cloneId), false, "changed price changes identity");
for (const broken of [
  { ...manifest, assets: [] },
  { ...manifest, assets: Array.from({ length: 11 }, (_, i) => ({ ...manifest.assets[0], id: `${id}-${i}`, sha256: i.toString(16).repeat(64) })) },
  { ...manifest, assets: [manifest.assets[0], { ...manifest.assets[0], id: `${id}-2` }] },
  { ...manifest, assets: [manifest.assets[0], { ...manifest.assets[1], id: manifest.assets[0].id }] },
  { ...manifest, assets: [{ ...manifest.assets[0], width: 0 }] },
  { ...manifest, assets: [{ ...manifest.assets[0], height: 1.5 }] },
  { ...manifest, sequence: {} },
  { ...manifest, captions: ["Rotating copy"] },
  { ...manifest, caption: "a".repeat(1024) + " " },
  { ...manifest, caption: "Look\u200fhere" },
  { ...manifest, caption: "{{name}}" },
  { ...manifest, caption: "I saw you online" },
  { ...manifest, caption: "Unlock today only" },
  { ...manifest, caption: "Visit https://example.com" },
  { ...manifest, bundle: { ...manifest.bundle, id: cloneId } },
  { ...manifest, bundle: { ...manifest.bundle, itemPaths: [manifest.bundle.itemPaths[0], manifest.bundle.itemPaths[0]] } },
  { ...manifest, bundle: { ...manifest.bundle, starPrice: 0 } },
  { ...manifest, bundle: { ...manifest.bundle, caption: "\u2066hidden" } },
]) assert.throws(() => parseMediaBundleCampaign(broken, cloneId), "unsafe or malformed campaign refused");
assert.notEqual(validateMessage("Unlock my free video for 1900 Stars"), null, "generic message rules preserved");
assert.notEqual(validateMessage("Unlock my free video for 1900 Stars", 1024, { freePicsCopy: true }), null, "legacy free-pics rules preserved");
assert.equal(validateMessage("Unlock my free video for 1900 Stars", 1024, { reviewedCampaignCopy: true }), null, "reviewed campaign may state the offer");
assert.equal(validateMessage("A video for you 👩‍❤️‍👨", 1024, { reviewedCampaignCopy: true }), null, "joined emoji remain valid");
const reviewRun = { photoCampaign: manifest, cloneIds: [cloneId], filters: { segment: "lapsed_buyers", includeLegacy: true }, dailyCap: 1200, runCap: null, holdoutPct: 0, allowRecontact: true };
assert.equal(mediaCampaignReviewKey(reviewRun), mediaCampaignReviewKey({ ...reviewRun, photoCampaign: reordered, filters: { includeLegacy: true, segment: "lapsed_buyers" } }));
assert.notEqual(mediaCampaignReviewKey(reviewRun), mediaCampaignReviewKey({ ...reviewRun, allowRecontact: false }));
assert.notEqual(mediaCampaignReviewKey(reviewRun), mediaCampaignReviewKey({ ...reviewRun, dailyCap: 1201 }));
assert.notEqual(mediaCampaignReviewKey(reviewRun), mediaCampaignReviewKey({ ...reviewRun, photoCampaign: { ...manifest, bundle: { ...manifest.bundle, starPrice: 1901 } } }));
assert.equal(mediaCampaignReviewKey({ ...reviewRun, photoCampaign: undefined }), null);
const fan: CandidateRow = { id, clone_id: cloneId, telegram_id: -901, name: "Fixture", language_code: "en", blocked: false, blocked_reason: null, paused: false, is_active: true, minor_flagged_at: null, first_seen_at: null, legacy_id: null, purchase_count: 1, last_message_received: "2026-09-01T00:00:00Z", total_spent_stars: 500, spend_tier: null };
const ctx: ClassifyContext = { nowMs: Date.parse("2026-10-01T00:00:00Z"), minSilenceHours: 24, isOptedOut: () => false, isAlreadyContacted: () => false, isWithinContactCooldown: () => false, includeLegacy: true };
assert.equal(classifyFan(fan, ctx), "eligible");
assert.equal(classifyFan(fan, { ...ctx, isWithinContactCooldown: () => true }), "within_24h", "recontact preserves rolling cooldown");
assert.equal(classifyFan(fan, { ...ctx, isOptedOut: () => true }), "opt_out", "recontact preserves optouts");
assert.equal(classifyFan(fan, { ...ctx, isAlreadyContacted: () => true }), "already_contacted", "ordinary runs preserve previous-contact exclusions");
assert.equal(classifyFan({ ...fan, last_message_received: "2026-09-30T23:00:00Z" }, ctx), "within_24h", "active24h fans still excluded");
console.log("PASS media campaign: exact captions, mixed bundle price, ordered album, retry identity and guard boundaries");
