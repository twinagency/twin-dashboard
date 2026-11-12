// KNOWN RED (REVIEW.md inv 7 "no false success"; W3-lib-onlyfans-1 finding F10).
//  - chat-content-history.ts:14-17 never reads message.delivery: an outbound attachment the provider refused or that failed
//    still reads "Previously sent" (and "Shared free" at price 0) in ChatVaultBrowser. Only "sent" is provider evidence
//    (lib/onlyfans-preview/types.ts DeliveryOutcome). Note: scripts/check-onlyfans-chat-content.ts:6 builds its messages with
//    delivery "delivered" as never, a value the type does not allow, so it cannot see this.
// (Round 2 removed the content.ts price-0 red: a free teaser with a null stored price legitimately sends 0, ContentEditor.tsx:75,79,
// so the request validator cannot refuse it; F11 now names the item-aware layer.)
// Each red has a control that passes today. Team's Claude owns the fix. Not wired into npm scripts or init.sh (its list is hard-coded); run with node --import tsx --test.
import assert from "node:assert/strict";
import test from "node:test";
import { contentHistoryLabels, fanContentHistory } from "../../lib/onlyfans/chat-content-history";

const complete = { version: "of-fan-financials.v1", totals: [], coverageComplete: true, coverageAt: null, commerceHeld: false };
const outbound = (delivery: string, mediaId: string, cents: number) => ({ messageId: `m-${mediaId}`, conversationId: "c", direction: "outbound",
  origin: "human", body: "", occurredAt: "2026-10-29T00:00:00Z", delivery, evidenceRef: null,
  attachments: { count: 1, media: [{ mediaId, kind: "photo" }], price: { currency: "USD", minorUnits: cents }, purchaseStatus: "not_applicable" } });
const labels = (delivery: string) => contentHistoryLabels(fanContentHistory({ ownedMedia: [], messages: [outbound(delivery, "5", 0)] as never, financials: complete as never }), "5");

test("control: a free attachment the provider accepted reads Previously sent + Shared free", () => {
  assert.deepEqual(labels("sent"), ["Previously sent", "Shared free"]);
});
for (const delivery of ["refused", "failed"]) test(`no false success: an attachment whose delivery is ${delivery} never reads Previously sent or Shared free`, () => {
  const got = labels(delivery);
  assert.ok(!got.includes("Previously sent") && !got.includes("Shared free"), JSON.stringify(got));
});

