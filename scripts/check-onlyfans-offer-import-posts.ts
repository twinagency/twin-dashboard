/** Native paid-post/legacy-message offer import compatibility regressions. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { IMPORT_SCHEMA, REASON_LABELS, messageRefreshSources, parseCandidate, parseSourceSample } from "../lib/onlyfans/offer-import";
const stamp = "2026-10-23T00:00:00Z";
const summary = { candidateId: "a".repeat(64), revision: 2, attachmentCount: 2, sourceCount: 1, observedPrices: [1999], variantCount: 1, verifiedSources: 1, itemId: null, status: "ready_for_review" };
const legacy = { fanId: "501", messageId: 1001, priceCents: 1999, sentAt: stamp };
const post = { sourceKind: "post", fanId: null, messageId: 1001, priceCents: 1999, sentAt: stamp };
const observation = { observationId: "11111111-1111-4111-8111-111111111111", fingerprint: "b".repeat(64), sourceKind: "post", sourceId: "1001", fanId: null, sourceContext: "unknown", sourceAt: stamp, observedAt: stamp,
  mediaIds: ["12", "11"], previewIds: ["12"], lockedText: false, priceCents: 1999, currency: "USD", attachments: [{ mediaId: "12", kind: "photo", freePreview: true }, { mediaId: "11", kind: "video", freePreview: false }], reasons: [], ready: true };
const detail = (change = {}) => ({ ...summary, variants: [{ key: "1999:12,11", priceCents: 1999, mediaIds: ["12", "11"], count: 1, latest: post }], samples: [post], observations: [observation], assetReasons: [], existingItem: null, ...change });
const parsed = (candidate: unknown) => parseCandidate({ schemaVersion: IMPORT_SCHEMA, ok: true, accountId: "acc-a", candidate }, "acc-a");

test("offer post: legacy samples normalize to message and retain exact identity", () => {
  assert.deepEqual(parseSourceSample(legacy), { ...legacy, sourceKind: "message" });
  const d = parsed(detail({ samples: [legacy], variants: [{ key: "legacy", priceCents: 1999, mediaIds: ["12", "11"], count: 1, latest: legacy }] }));
  assert.equal(d?.variants[0].latest?.sourceKind, "message"); assert.equal(d?.samples[0].fanId, "501");
});
test("offer post: paid post candidate keeps null fan, exact cents, attachment order and previews", () => {
  const d = parsed(detail()); assert(d);
  assert.equal(d.samples[0].sourceKind, "post"); assert.equal(d.samples[0].fanId, null); assert.equal(d.variants[0].latest?.messageId, 1001);
  assert.equal(d.observations[0].priceCents, 1999); assert.deepEqual(d.observations[0].mediaIds, ["12", "11"]); assert.deepEqual(d.observations[0].previewIds, ["12"]);
  assert.deepEqual(d.observations[0].attachments.map(a => [a.mediaId, a.freePreview]), [["12", true], ["11", false]]);
});
test("offer post: free and superseded observations remain visible and blocked", () => {
  const zero = { ...post, priceCents: 0 }, free = parsed(detail({ observedPrices: [0], samples: [zero], variants: [{ key: "0:12,11", priceCents: 0, mediaIds: ["12", "11"], count: 1, latest: zero }], observations: [{ ...observation, priceCents: 0, ready: false, reasons: ["price_out_of_range"] }] }));
  assert.equal(free?.samples[0].priceCents, 0); assert.equal(free?.observations[0].ready, false);
  const superseded = parsed(detail({ observations: [{ ...observation, ready: false, reasons: ["superseded_source"] }] }));
  assert.equal(superseded?.observations[0].ready, false); assert(REASON_LABELS.superseded_source.includes("changed or was removed"));
  assert.deepEqual(superseded?.observations[0].mediaIds, ["12", "11"]);
  assert.equal(parsed(detail({ observations: [{ ...observation, ready: true, reasons: ["superseded_source"] }] })), null, "blocked evidence cannot claim readiness");
});
test("offer post: malformed samples and post/message fan mismatches are refused", () => {
  for (const invalid of [{ ...legacy, fanId: null }, { ...post, fanId: "501" }, { ...post, sourceKind: "other" }, { ...post, messageId: Number.MAX_SAFE_INTEGER + 1 }, { ...post, messageId: "1001" }, { ...post, messageId: 0 }, { ...post, messageId: 1.5 }, { ...post, priceCents: 19.99 }, { ...post, sentAt: "not-a-date" }, { ...post, sourceId: "1001" }]) {
    assert.equal(parseSourceSample(invalid), null); assert.equal(parsed(detail({ samples: [invalid] })), null);
  }
});
test("offer post: every latest variant source is validated instead of cast", () => {
  const variant = detail().variants[0];
  for (const invalid of [{ ...variant, latest: { ...post, fanId: "501" } }, { ...variant, latest: { ...post, priceCents: 2500 } }, { ...variant, latest: { ...post, messageId: false } }, { ...variant, mediaIds: [12] }, { ...variant, count: -1 }, { ...variant, latest: {} }]) assert.equal(parsed(detail({ variants: [invalid] })), null);
  assert.equal(parsed(detail({ variants: [{ ...variant, latest: null }] }))?.variants[0].latest, null);
});
test("offer post: message refresh excludes all posts, missing fans and unsafe identities", () => {
  assert.deepEqual(messageRefreshSources([post, legacy, { ...legacy, sourceKind: "message" }, { ...legacy, fanId: null }, { ...legacy, sourceKind: "other" }]), [{ fanId: "501", messageId: "1001" }]);
  assert.deepEqual(messageRefreshSources([post]), []);
  assert.deepEqual(messageRefreshSources([post, { ...legacy, messageId: Number.MAX_SAFE_INTEGER + 1 }]), []);
  assert.equal(messageRefreshSources(Array.from({ length: 125 }, (_, i) => ({ ...legacy, messageId: 1001 + i }))).length, 50);
});
test("offer post: matching provider IDs do not collapse post and message identities", () => {
  const d = parsed(detail({ samples: [post, legacy], sourceCount: 2 })); assert.equal(d?.samples.length, 2);
  assert.equal(d?.samples[0].sourceKind, "post"); assert.equal(d?.samples[1].sourceKind, "message");
  assert.deepEqual(messageRefreshSources(d!.samples), [{ fanId: "501", messageId: "1001" }]);
});
test("offer post: observation source-kind binding is strict and unknown previews stay unknown", () => {
  assert.equal(parsed(detail({ observations: [{ ...observation, fanId: "501" }] })), null);
  assert.equal(parsed(detail({ observations: [{ ...observation, sourceKind: "message" }] })), null);
  const d = parsed(detail({ observations: [{ ...observation, previewIds: null, lockedText: null, ready: false, reasons: ["previews_unknown", "locked_text_unknown"] }] }));
  assert.equal(d?.observations[0].previewIds, null); assert.equal(d?.observations[0].lockedText, null); assert.equal(d?.observations[0].ready, false);
});
