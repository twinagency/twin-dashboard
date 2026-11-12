// KNOWN RED (W3 ui-onlyfans-preview-1, findings F16 F18 in docs/review/W3/ui-onlyfans-preview-1.md). Team's Claude owns the fixes.
// F16 components/onlyfans-preview/ConfigurationEditor.tsx:115-118: the client status list [400,404,409,413,503] files a 503 as
//     "The change was refused" and sets nextRetry = null without reading the body `outcome` the route forwards (route.ts:47; route-local refusals hard-code "refused", :12), so a
//     503 outcome "unconfirmed" loses the exact retry and reads refused (D7).
//     Client half only: classify by body outcome; the harm closes only with the lib-onlyfans-1 / lib-onlyfans-4-plus2 relabel of upstream 503
//     (at HEAD configuration-backend.ts:21,28 label an upstream 503 outcome "refused" and send unconfirmed as 502).
// F18 ConfigurationEditor.tsx:52-61,121-128: every save outcome runs read(), which overwrites persona (and every other field) with
//     server values; on 409 nextRetry = null, so the operator's edit is gone although the copy says "Review the refreshed values".
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close). Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ConfigurationEditor + Next contexts.
import { close, lostReply, q, routeFailure } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { TYPED_PERSONA, configurationNotice, configurationSave } from "../helpers/w3-preview1-editors";

after(close);
const retry = () => q("[data-of-retry-configuration]");

test("control: a save refused with 400 says refused and offers no retry", async () => {
  await configurationSave(() => routeFailure(400, "refused"));
  assert.match(configurationNotice(), /The change was refused/);
  assert.equal(retry(), null);
});

test("control: a save with no reply keeps the exact retry and says not confirmed", async () => {
  await configurationSave(lostReply);
  assert.match(configurationNotice(), /Save outcome not confirmed/);
  assert.ok(retry());
});

test("F16: a save answered 503 outcome unconfirmed keeps the exact retry and is not called refused", async () => {
  await configurationSave(() => routeFailure(503, "unconfirmed"));
  assert.doesNotMatch(configurationNotice(), /refused/, "an unconfirmed outcome is not a refusal");
  assert.ok(retry(), "the exact retry is kept");
});

test("F18: a save answered 409 keeps the persona the operator typed", async () => {
  await configurationSave(() => routeFailure(409, "refused"));
  assert.match(configurationNotice(), /Configuration changed/);
  assert.equal(q<HTMLTextAreaElement>("[data-of-edit-persona]")?.value, TYPED_PERSONA, "the operator's edit must survive the refresh");
});
