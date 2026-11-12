/**
 * Characterization (W3 ui-onlyfans-preview-3, F1 control half; holds at HEAD): a scan whose outcome is unknown (502 proxy text, the
 * route's 502 "unconfirmed" envelope, a lost connection, a client timeout) keeps the exact request, offers "Retry the same request",
 * mints no new requestId while it waits (Scan disabled), sends nothing on its own, and the retry carries the SAME requestId and an
 * identical body (the route derives the command key from that body, so the backend dedupes it). A change in
 * components/onlyfans-preview/OfferImportPanel.tsx that re-mints the requestId on retry or drops the kept request turns this red.
 * Offline: jsdom, global fetch stubbed (https://fixture.invalid), real OfferImportPanel + ContentSyncStatus + Next contexts.
 */
import { bodyOf, click, close, settle, unexpected } from "../helpers/w3-preview3-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { importBackend, job, mountPanel, ok, retryButton, scanButton, startPosts, unconfirmed502 } from "../helpers/w3-preview3-import";

after(close);

const UNKNOWN: Array<[string, () => Response]> = [
  ["502 text", () => new Response("bad gateway", { status: 502 })],
  ["502 unconfirmed envelope", unconfirmed502],
  ["lost reply", () => { throw new TypeError("connection reset"); }],
  ["timeout", () => { throw new DOMException("timed out", "TimeoutError"); }],
];

test("a scan with an unknown outcome is retried only on request, with the same requestId and an identical body", async () => {
  for (const [answer, first] of UNKNOWN) {
    importBackend({ start: (_c, n) => n === 0 ? first() : ok(job("running")) });
    await mountPanel();
    await click(scanButton());
    await settle(100);
    assert.equal(startPosts().length, 1, `${answer}: written once, not retried automatically`);
    assert.equal(scanButton()?.disabled, true, `${answer}: no new scan (new requestId) while the kept request waits`);
    const retry = retryButton();
    assert.ok(retry && !retry.disabled, `${answer}: the exact retry is offered`);
    await click(retry);
    const [original, again] = startPosts().map(bodyOf);
    assert.ok(again, `${answer}: retry sent`);
    assert.equal(again.requestId, original.requestId, `${answer}: retry keeps the requestId`);
    assert.deepEqual(again, original, `${answer}: retry body is identical`);
    assert.deepEqual(unexpected, [], `${answer}: only expected requests`);
  }
});
