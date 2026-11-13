// RULE G09 (W3 ui-onlyfans-preview-2 P7): paid media priced 0 is not sendable. A paid intent needs a price inside the backend's
// paid bound (USD 3.00 to 200.00, twin-onlyfans-backend service/onlyfans_runtime/text_delivery.py:385); 0 means free there, so
// sending it would deliver the paid intent as free. P8/P9 are not G09. Offline: jsdom, fetch stubbed, synthetic ids.
import { close, json, mount, resetDom, serve } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { clearDrafts, draftKey, writeDraft } from "../../lib/onlyfans/inbox-drafts";
import type { VaultItem } from "../../lib/onlyfans/vault";
import { PRINCIPAL, detailFor, inbox, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a"), CONV = "conv-1";
const key = draftKey(PRINCIPAL, A.accountId, CONV);
const photo: VaultItem = { mediaId: "501", kind: "photo", durationSeconds: null, width: null, height: null, ready: true, reason: null, description: null };
const offer = (itemId: string, readiness = "terms_checked") => ({ itemId, label: `Offer ${itemId}`, kind: "message", description: "", descriptionTruncated: false,
  mediaCount: 2, previewCount: 1, priceCents: 1500, currency: "USD", readiness, updatedAt: null });
const contentPage = (items: unknown[], nextCursor: string | null = null) => json({ workspace: { schemaVersion: "of-workspace.v2", section: "content", accountId: A.accountId,
  asOf: "2026-10-17T09:00:00.000Z", lastCompleteSyncAt: null, historyRecoveryRequired: false, providerConnectionVerified: true, items, nextCursor } });
function serveCatalogue(page: () => Response) {
  serve(call => /\/workspace\/content/.test(call.url) ? page() : json({ ok: false }, 404));
}

const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");
const show = () => mount(inbox({ account: A, detail: detailFor(A.accountId, CONV) }));

beforeEach(() => { clearDrafts(); serveCatalogue(() => contentPage([offer("11")])); });
afterEach(resetDom);
after(close);

test("control: paid media at USD 5.00 with one locked attachment enables Send; free media enables Send", async () => {
  writeDraft(key, { selectedMedia: [photo], mediaPaid: true, mediaPrice: "5.00", body: "for you" });
  await show();
  assert.match(document.querySelector("[data-of-manual-total]")?.textContent ?? "", /USD 5\.00 total/);
  assert.equal(send()?.disabled, false);
  writeDraft(key, { mediaPaid: false });
  await show();
  assert.equal(send()?.disabled, false, "free media is sendable");
});

test("P7: paid media with price 0 is not sendable", async () => {
  writeDraft(key, { selectedMedia: [photo], mediaPaid: true, mediaPrice: "0", body: "for you" });
  await show();
  assert.match(document.querySelector("[data-of-manual-total]")?.textContent ?? "", /Enter a price from USD 3\.00 to 200\.00/, "panel says no valid price");
  assert.equal(send()?.disabled, true, "Send is enabled for paid media priced 0: the paid intent would go out as free");
});
