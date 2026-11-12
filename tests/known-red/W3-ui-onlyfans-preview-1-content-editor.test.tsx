// KNOWN RED (W3 ui-onlyfans-preview-1, findings F30 F32 in docs/review/W3/ui-onlyfans-preview-1.md). Team's Claude owns the fixes.
// F30 components/onlyfans-preview/ContentEditor.tsx:105-108: the client status list [400,404,409,413,503] files a 503 as "The change
//     was refused" and sets nextRetry = null; the body `outcome` is ignored, so a 503 outcome "unconfirmed" reads refused and the
//     retry button is gone (D7). (content-backend.ts:25 relaying upstream 503 as refused is lane lib-onlyfans-1's.)
//     Client half only: classify by body outcome; the harm closes only with the lib-onlyfans-1 / lib-onlyfans-4-plus2 relabel of upstream 503
//     (at HEAD content-backend.ts:25-28,35 label an upstream 503 outcome "refused" and send unconfirmed as 502).
// F32 ContentEditor.tsx:59-60,111-117: `finally` always awaits read(), which resets label, description, price and enabled from the
//     server; on 409 nextRetry = null, so the operator's typed description is discarded.
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close). Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ContentEditor + Next contexts.
import { close, lostReply, q, routeFailure } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { TYPED_DESCRIPTION, contentNotice, contentSave } from "../helpers/w3-preview1-editors";

after(close);
const retry = () => q("[data-of-retry-content]");

test("control: a save refused with 400 says refused and offers no retry", async () => {
  await contentSave(() => routeFailure(400, "refused"));
  assert.match(contentNotice(), /The change was refused/);
  assert.equal(retry(), null);
});

test("control: a save with no reply keeps the exact retry and says not confirmed", async () => {
  await contentSave(lostReply);
  assert.match(contentNotice(), /Save outcome not confirmed/);
  assert.ok(retry());
});

test("F30: a save answered 503 outcome unconfirmed keeps the exact retry and is not called refused", async () => {
  await contentSave(() => routeFailure(503, "unconfirmed"));
  assert.doesNotMatch(contentNotice(), /refused/, "an unconfirmed outcome is not a refusal");
  assert.ok(retry(), "the exact retry is kept");
});

test("F32: a save answered 409 keeps the description the operator typed", async () => {
  await contentSave(() => routeFailure(409, "refused"));
  assert.match(contentNotice(), /Catalogue item changed/);
  assert.equal(q<HTMLTextAreaElement>("[data-of-edit-content-description]")?.value, TYPED_DESCRIPTION, "the operator's edit must survive the refresh");
});
