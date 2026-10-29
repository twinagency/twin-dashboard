import assert from "node:assert/strict";
import { contentHistoryLabels, fanContentHistory } from "../lib/onlyfans/chat-content-history";
import { isSendableOffer, offerMediaSummary } from "../components/onlyfans-preview/ChatContentPicker";

const msg = (id: string, direction: "inbound" | "outbound", media: string[], cents: number) => ({ messageId: id, conversationId: "c", direction, origin: "human" as const, body: "", occurredAt: "2026-10-29T00:00:00Z",
  delivery: "delivered" as never, evidenceRef: null, attachments: { count: media.length, media: media.map(mediaId => ({ mediaId, kind: "photo" as const })), price: { currency: "USD" as const, minorUnits: cents }, purchaseStatus: cents ? "not_purchased" as const : "not_applicable" as const } });
const owned = [{ mediaId: "1", label: "x", purchasedAt: "2026-10-01T00:00:00Z", price: { currency: "USD" as const, minorUnits: 500 } }];
const complete = { version: "of-fan-financials.v1", totals: [], coverageComplete: true, coverageAt: null, commerceHeld: false };
const base = { ownedMedia: owned as never, messages: [msg("m1", "outbound", ["2"], 0), msg("m2", "outbound", ["3"], 900), msg("m3", "inbound", ["4"], 0)] as never };

const full = fanContentHistory({ ...base, financials: complete });
assert.equal(full.complete, true);
assert.deepEqual(contentHistoryLabels(full, "1"), ["Purchased"]);
assert.deepEqual(contentHistoryLabels(full, "2"), ["Previously sent", "Shared free"]);
assert.deepEqual(contentHistoryLabels(full, "3"), ["Previously sent"]);
assert.deepEqual(contentHistoryLabels(full, "4"), ["No recorded delivery"]);
for (const partial of [fanContentHistory(base), fanContentHistory({ ...base, financials: { ...complete, coverageComplete: false } }), fanContentHistory({ ...base, financials: complete, previousCursor: "older" })]) {
  assert.equal(partial.complete, false);
  assert.deepEqual(contentHistoryLabels(partial, "4"), ["History incomplete"]);
  assert.deepEqual(contentHistoryLabels(partial, "1"), ["Purchased"]);
}
assert(![...contentHistoryLabels(full, "9"), ...contentHistoryLabels(fanContentHistory(null), "9")].some(label => /never/i.test(label)));
const offer = { itemId: "7", label: "Set", kind: "bundle", description: "", descriptionTruncated: false, mediaCount: 5, previewCount: 2, priceCents: 1500, currency: "USD" as const, readiness: "terms_checked" as const, updatedAt: null };
assert.equal(isSendableOffer(offer), true);
assert.equal(isSendableOffer({ ...offer, priceCents: 100 }), false);
assert.equal(isSendableOffer({ ...offer, readiness: "needs_review" }), false);
assert.equal(offerMediaSummary(offer), "5 media, 2 free, 3 paid");
assert.equal(offerMediaSummary({ ...offer, previewCount: null }), "5 media, free previews need review");
console.log("chat content checks passed");
