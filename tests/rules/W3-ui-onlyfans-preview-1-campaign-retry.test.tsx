/**
 * Characterization (W3 ui-onlyfans-preview-1, F1 control half; holds at HEAD): a campaign create whose reply never arrived (lost
 * connection, timeout, 502, unreadable 200; UNKNOWN_OUTCOMES in the DOM helper) keeps the exact request, offers "Retry same request", and that retry carries the SAME requestKey (the
 * route hashes it into commandKey, so the backend dedupes it). Nothing is re-sent on its own. A change in
 * components/onlyfans-preview/CampaignManager.tsx that re-mints the key or drops the kept request turns this red.
 * Offline: jsdom, global fetch stubbed (https://fixture.invalid), real CampaignManager + Next contexts.
 */
import { ACCOUNT, UNKNOWN_OUTCOMES, bodyOf, calls, close, click, mount, q, serve, submit, button } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import React from "react";
import { clearDrafts, rememberDraft, EMPTY_DRAFT } from "../../lib/onlyfans/campaign-audience";
import { SENDER, campaignBackend, createAck, createPosts } from "../helpers/w3-preview1-campaign";

after(close);
beforeEach(() => clearDrafts());


test("an unanswered campaign create is retried only on request, with the same requestKey and identical body", async () => {
  const { default: CampaignManager } = await import("../../components/onlyfans-preview/CampaignManager");
  for (const [answer, first] of UNKNOWN_OUTCOMES) {
    rememberDraft(ACCOUNT, { ...EMPTY_DRAFT, name: "Spring note", body: "Hello there", audienceKind: "all_known" });
    serve(campaignBackend({ create: (_call, n) => n === 0 ? first() : createAck(ACCOUNT) }));
    await mount(<CampaignManager accountId={ACCOUNT} sender={SENDER} />, "/onlyfans/campaigns");
    await submit(q("[data-of-campaign-manager] form"));
    assert.equal(createPosts(calls).length, 1, `${answer}: written once, not retried automatically`);
    const retry = button(/^Retry same request$/);
    assert.ok(retry && !retry.disabled, `${answer}: the exact retry is offered`);
    await click(retry);
    const [original, again] = createPosts(calls).map(bodyOf);
    assert.ok(again, `${answer}: retry sent`);
    assert.equal(again.requestKey, original.requestKey, `${answer}: retry keeps the requestKey`);
    assert.deepEqual(again, original, `${answer}: retry body is identical`);
  }
});
