// KNOWN RED (W3 ui-onlyfans-preview-1, findings F1 F2 F3 F4 F6 in docs/review/W3/ui-onlyfans-preview-1.md). Team's Claude owns the fixes.
// F1 components/onlyfans-preview/CampaignManager.tsx:125,134,142: a create answered 503 is filed "not accepted" by the client status
//    list [400,404,409,413,503] without reading the body `outcome`, the kept retry is dropped and the next Queue mints a fresh
//    requestKey; the route hashes requestKey into commandKey, so an unconfirmed create can become a second mass campaign.
//    (The lib half, campaigns-backend.ts:19 labelling an upstream 503 "refused", is lane lib-onlyfans-1's; this file drives the
//    client with the route's own failure shape, outcome "unconfirmed".)
//     Client half only: classify by body outcome; the harm closes only with the lib-onlyfans-1 / lib-onlyfans-4-plus2 relabel of upstream 503
//     (at HEAD campaigns-backend.ts:19,24 label an upstream 503 outcome "refused" and send unconfirmed as 502).
// F2 CampaignManager.tsx:46,57,65: the kept retry lives in component state, the draft in a module Map without its requestKey;
//    switching account and back restores the filled form with no retry, and Queue mints a new key.
// F3 CampaignManager.tsx:147,181: `locked` includes `!!retry`, so a pending unconfirmed create disables Pause and Cancel remaining
//    on a running campaign while "Retry same request" (a go) stays enabled (REVIEW inv 7: STOP never harder than go).
// F4 CampaignManager.tsx:86,118,134: the write sets "outcome is not confirmed" and then awaits read(), whose catch overwrites the
//    notice with the refresh error; during an outage, exactly when writes go unconfirmed, the unconfirmed text vanishes (D7).
// F6 CampaignManager.tsx:143,157,174: a restored draft's catalogItemId is submitted as-is although the offer select only lists
//    sendable items; an item that is no longer terms_checked shows "Text only" yet the create attaches the paid offer.
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close). Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager + Next contexts.
import { ACCOUNT, bodyOf, calls, close, click, http502, lostReply, mount, q, rerender, serve, submit, button, settle } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import React from "react";
import { clearDrafts, rememberDraft, EMPTY_DRAFT } from "../../lib/onlyfans/campaign-audience";
import { CAMPAIGN, OTHER, SENDER, campaignBackend, createAck, createPosts, unconfirmed503, type Item } from "../helpers/w3-preview1-campaign";

after(close);
beforeEach(() => clearDrafts());
const PATH = "/onlyfans/campaigns";
const draft = (accountId = ACCOUNT, catalogItemId = "") => rememberDraft(accountId, { ...EMPTY_DRAFT, name: "Spring note", body: "Hello there", audienceKind: "all_known", catalogItemId });
async function manager(accountId = ACCOUNT) {
  const { default: CampaignManager } = await import("../../components/onlyfans-preview/CampaignManager");
  return <CampaignManager accountId={accountId} sender={SENDER} />;
}
const form = () => q("[data-of-campaign-manager] form");
/** What an operator does next after an unanswered create: the offered retry if there is one, else Queue again. */
async function nextCreate() {
  const retry = button(/^Retry same request$/);
  if (retry) await click(retry); else await submit(form());
}

test("control: a create with no reply (lost, 502) keeps the request and its retry resends the same requestKey", async () => {
  for (const first of [lostReply, http502]) {
    draft();
    serve(campaignBackend({ create: (_call, n) => n === 0 ? first() : createAck(ACCOUNT) }));
    await mount(await manager(), PATH);
    await submit(form());
    assert.match(q("[data-of-campaign-notice]")?.textContent ?? "", /outcome is not confirmed/);
    const retry = button(/^Retry same request$/);
    assert.ok(retry && !retry.disabled, "retry offered");
    await click(retry);
    const bodies = createPosts(calls).map(bodyOf);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].requestKey, bodies[0].requestKey, "the retry carries the first requestKey");
    assert.match(q("[data-of-campaign-notice]")?.textContent ?? "", /Campaign saved/);
  }
});

test("control: a running campaign's Pause and Cancel remaining are enabled when nothing is pending", async () => {
  draft();
  serve(campaignBackend({ withCampaign: true }));
  await mount(await manager(), PATH);
  await click(q(`[data-of-campaign="${CAMPAIGN}"]`));
  assert.ok(q(`[data-of-campaign-detail="${CAMPAIGN}"]`), "detail open");
  assert.equal(button(/^Pause$/)?.disabled, false);
  assert.equal(button(/^Cancel remaining$/)?.disabled, false);
});

test("control: a sendable saved offer from the draft is shown in the select and attached to the create", async () => {
  const items: Item[] = [{ itemId: "102", readiness: "terms_checked", priceCents: 1200, label: "Beach set" }];
  draft(ACCOUNT, "102");
  serve(campaignBackend({ items, create: () => createAck(ACCOUNT) }));
  await mount(await manager(), PATH);
  assert.equal(q<HTMLSelectElement>("[data-of-campaign-offer]")?.value, "102");
  await submit(form());
  assert.equal(bodyOf(createPosts(calls)[0]).catalogItemId, 102);
});

test("F1: after a create answered 503 outcome unconfirmed, the next create reuses the first requestKey", async () => {
  draft();
  serve(campaignBackend({ create: (_call, n) => n === 0 ? unconfirmed503() : createAck(ACCOUNT) }));
  await mount(await manager(), PATH);
  await submit(form());
  assert.equal(createPosts(calls).length, 1);
  await nextCreate();
  const bodies = createPosts(calls).map(bodyOf);
  assert.equal(bodies.length, 2, "the operator could create again");
  assert.equal(bodies[1].requestKey, bodies[0].requestKey, "an unconfirmed 503 must not mint a second campaign identity");
});

test("F3: while an unconfirmed create waits for its retry, Pause and Cancel remaining stay enabled", async () => {
  draft();
  serve(campaignBackend({ withCampaign: true, create: lostReply }));
  await mount(await manager(), PATH);
  await click(q(`[data-of-campaign="${CAMPAIGN}"]`));
  await submit(form());
  assert.ok(button(/^Retry same request$/), "a retry (go) is pending");
  assert.equal(button(/^Pause$/)?.disabled, false, "Pause must not be harder than the pending go");
  assert.equal(button(/^Cancel remaining$/)?.disabled, false, "Cancel remaining must not be harder than the pending go");
});

test("F2: after an unconfirmed create, switching account and back keeps the request identity", async () => {
  draft();
  serve(campaignBackend({ create: (_call, n) => n === 0 ? lostReply() : createAck(ACCOUNT) }));
  await mount(await manager(), PATH);
  await submit(form());
  assert.ok(button(/^Retry same request$/), "unconfirmed: retry kept");
  await rerender(await manager(OTHER), PATH);
  await rerender(await manager(ACCOUNT), PATH);
  await settle();
  assert.equal((q("[data-of-campaign-body]") as HTMLTextAreaElement | null)?.value, "Hello there", "the draft came back");
  await nextCreate();
  const bodies = createPosts(calls).map(bodyOf);
  assert.equal(bodies.length, 2, "the operator could create again");
  assert.deepEqual(bodies[1], bodies[0], "the retry after remount must resend the unconfirmed request whole (the route hashes the entire input into commandKey)");
});

test("F6: a restored offer that is no longer sendable is not attached while the select shows Text only", async () => {
  const items: Item[] = [{ itemId: "101", readiness: "needs_review", priceCents: 1200, label: "Held set" }, { itemId: "102", readiness: "terms_checked", priceCents: 1500, label: "Beach set" }];
  draft(ACCOUNT, "101");
  serve(campaignBackend({ items, create: () => createAck(ACCOUNT) }));
  await mount(await manager(), PATH);
  const select = q<HTMLSelectElement>("[data-of-campaign-offer]");
  assert.equal(select?.selectedOptions[0]?.textContent, "Text only", "the operator sees a text-only campaign");
  await submit(form());
  const creates = createPosts(calls);
  assert.equal(creates.length, 1, "one create sent");
  assert.equal("catalogItemId" in bodyOf(creates[0]), false, "a campaign shown as Text only must attach no paid offer at all");
});

test("F4: an unconfirmed create still says so when the follow-up refresh fails", async () => {
  draft();
  const base = campaignBackend({ create: lostReply });
  serve(call => call.method === "GET" && /\/campaigns$/.test(call.url) && createPosts(calls).length ? new Response(null, { status: 500 }) : base(call));
  await mount(await manager(), PATH);
  await submit(form());
  assert.ok(button(/^Retry same request$/), "unconfirmed: retry kept");
  assert.match(q("[data-of-campaign-notice]")?.textContent ?? "", /not confirmed/, "the unconfirmed outcome must stay on screen next to its retry");
});
