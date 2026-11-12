/**
 * Characterization (W3 ui-onlyfans-preview-3, F9/F11 control half; holds at HEAD): within one mount of the inbox, a manual send whose
 * outcome is unknown (lost reply, client timeout, 502 proxy text, 500) is written once, never resent on its own, blocks a new send
 * while it waits, and "Retry same request" resends the SAME requestKey and an identical body (the controls route derives the command
 * key from that body, so the backend dedupes it). A change in components/onlyfans-preview/OnlyFansWorkspace.tsx (:855-859 onRetryCommand,
 * :727 key minting) that re-mints the requestKey on retry or drops the kept request turns this red.
 * Offline: jsdom, global fetch stubbed (https://fixture.invalid), real OnlyFansWorkspace + InboxView + server data source + fetch transport.
 */
import { bodyOf, click, close, json, settle, unexpected } from "../helpers/w3-preview3-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { clearDrafts } from "../../lib/onlyfans/inbox-drafts";
import { X, ack, composer, controlPosts, held, mountWorkspace, retryControl, sendButton, sendReply, workspaceBackend, world } from "../helpers/w3-preview3-workspace";

after(close);

const UNKNOWN: Array<[string, () => Response]> = [
  ["lost reply", () => { throw new TypeError("connection reset"); }],
  ["timeout", () => { throw new DOMException("timed out", "TimeoutError"); }],
  ["502 text", () => new Response("bad gateway", { status: 502 })],
  ["500 json", () => json({ error: "internal" }, 500)],
];

test("an unconfirmed manual send is retried only on request, with the same requestKey and an identical body", async () => {
  for (const [answer, first] of UNKNOWN) {
    clearDrafts();
    const w = world(); held(w, X);
    workspaceBackend(w, { control: (call, n) => n === 0 ? first() : ack(call) });
    await mountWorkspace();
    await sendReply(`still there? (${answer})`);
    await settle(200);
    assert.equal(controlPosts().length, 1, `${answer}: written once, not retried automatically`);
    assert.equal(sendButton()?.disabled, true, `${answer}: no new send (new requestKey) while the kept request waits`);
    assert.equal(composer()?.value, `still there? (${answer})`, `${answer}: the draft is kept`);
    const retry = retryControl();
    assert.equal(retry !== null && !retry.disabled, true, `${answer}: "Retry same request" is offered`);
    await click(retry);
    await settle(100);
    const [original, again] = controlPosts().map(bodyOf);
    assert.ok(again, `${answer}: retry sent`);
    assert.equal(again.requestKey, original.requestKey, `${answer}: retry keeps the requestKey`);
    assert.deepEqual(again, original, `${answer}: retry body is identical`);
    assert.equal(controlPosts().length, 2, `${answer}: one retry, one POST`);
    assert.deepEqual(unexpected, [], `${answer}: only expected requests`);
  }
});
