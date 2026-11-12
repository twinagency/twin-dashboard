// KNOWN RED (W3 ui-onlyfans-preview-2 P7/P8/P9, data-risk, manual prices only):
//   P7 InboxView.tsx:422 + ManualMediaAttachments.tsx:47-54 — "Set price" with "0" becomes priceCents 0 (manual-media.ts:19) and
//      validManualMedia accepts it as FREE, so Send is enabled while the panel says "Enter a price from USD 3.00 to 200.00".
//   P8 ManualMediaAttachments.tsx:48 (draft default inbox-drafts.ts:7 mediaPrice "3.00") — clicking "Set price" yields a sendable
//      USD 3.00 the operator never typed.
//   P9 InboxView.tsx:425 — `submittable` ignores whether the draft's catalogItemId is loaded and still sendable.
// Team's Claude owns the fixes (roots partly in lib-onlyfans-2/-3). Offline: jsdom, fetch stubbed, synthetic ids.
import { click, inNextApp, json, mount, stubFetch, typeInto } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
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
let fetchStub: ReturnType<typeof stubFetch>;
function serveCatalogue(page: () => Response) {
  fetchStub = stubFetch(url => /\/workspace\/content/.test(url) ? page() : json({ ok: false }, 404));
}

const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");
const show = () => mount(inNextApp(inbox({ account: A, detail: detailFor(A.accountId, CONV) })));

beforeEach(() => { clearDrafts(); serveCatalogue(() => contentPage([offer("11")])); });

// ---- P7 ----
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

// ---- P8 ----
const setPrice = () => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Attachment price"] button')].find(b => /Set price/.test(b.textContent ?? ""));
const priceField = () => document.querySelector<HTMLInputElement>("[data-of-manual-price]");

test("control: Set price, then type 3.00: Send is enabled", async () => {
  writeDraft(key, { selectedMedia: [photo], body: "for you" });
  await show();
  await click(setPrice());
  await typeInto(priceField(), "3.00");
  assert.deepEqual({ priceField: priceField()?.value, sendDisabled: send()?.disabled }, { priceField: "3.00", sendDisabled: false });
});

test("P8: clicking Set price without typing gives no sendable price", async () => {
  writeDraft(key, { selectedMedia: [photo], body: "for you" });
  await show();
  await click(setPrice());
  assert.ok(priceField(), "price field shown after Set price");
  assert.equal(send()?.disabled, true, `a price the operator never typed is sendable (price field shows ${JSON.stringify(priceField()?.value)})`);
});

// ---- P9 ----
test("control: a loaded, sendable catalogue item shows its label and enables Send", async () => {
  writeDraft(key, { catalogItemId: "11", body: "for you" });
  await show();
  assert.match(document.querySelector("[data-of-composition-summary]")?.textContent ?? "", /Offer 11/);
  assert.equal(send()?.disabled, false);
  assert.ok(fetchStub.matching(/\/workspace\/content/).length >= 1, "catalogue was read through the stub");
});

test("P9: draft item not on the loaded catalogue page keeps Send disabled", async () => {
  serveCatalogue(() => contentPage([offer("11")], "page2"));
  writeDraft(key, { catalogItemId: "77", body: "for you" });
  await show();
  assert.match(document.querySelector("[data-of-composition-summary]")?.textContent ?? "", /Not loaded yet/, "summary admits the item is not loaded");
  assert.equal(send()?.disabled, true, "Send is enabled with an unloaded catalogue item (price and media never shown)");
});

test("P9: catalogue read failed keeps Send disabled for a draft item", async () => {
  serveCatalogue(() => json({ ok: false }, 503));
  writeDraft(key, { catalogItemId: "11", body: "for you" });
  await show();
  assert.match(document.querySelector(".of-paid-content")?.textContent ?? "", /Saved paid content is unavailable/, "catalogue failure is on screen");
  assert.equal(send()?.disabled, true, "Send is enabled with a catalogue item while the catalogue could not be read");
});

test("P9: draft item now needs_review is not sendable", async () => {
  serveCatalogue(() => contentPage([offer("11"), offer("12", "needs_review")]));
  writeDraft(key, { catalogItemId: "12", body: "for you" });
  await show();
  assert.match(document.querySelector("[data-of-composition-summary]")?.textContent ?? "", /Offer 12/, "item 12 is loaded");
  assert.equal(send()?.disabled, true, "Send is enabled for a catalogue item that is no longer sendable (needs_review)");
});
