/**
 * Characterization (W3 ui-onlyfans-preview-1, F16/F30 control half; holds at HEAD): a ConfigurationEditor or ContentEditor save whose
 * reply never arrived (UNKNOWN_OUTCOMES in the DOM helper: lost connection, timeout, 502, unreadable 200) is written once, keeps the exact request and offers
 * "Retry same save", and that retry resends a JSON-identical body (the routes derive commandKey from the body, so the backend
 * dedupes it). A change in components/onlyfans-preview/{ConfigurationEditor,ContentEditor}.tsx that drops the kept request on a
 * missing reply, or rebuilds the request for the retry, turns this red.
 * Offline: jsdom, global fetch stubbed (https://fixture.invalid), real components + Next contexts.
 */
import { UNKNOWN_OUTCOMES, calls, close, click, lostReply, posts, q, type Answer } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { configurationSave, contentSave } from "../helpers/w3-preview1-editors";

after(close);
const once = (first: Answer): Answer => { let n = 0; return () => (n++ === 0 ? first : lostReply)(); };

for (const [name, save, selector] of [["ConfigurationEditor", configurationSave, "[data-of-retry-configuration]"], ["ContentEditor", contentSave, "[data-of-retry-content]"]] as const) {
  test(`${name}: an unanswered save is retried only on request, with a JSON-identical body`, async () => {
    for (const [answer, first] of UNKNOWN_OUTCOMES) {
      await save(once(first));
      assert.equal(posts().length, 1, `${answer}: written once, not retried automatically`);
      const retry = q<HTMLButtonElement>(selector);
      assert.ok(retry && !retry.disabled, `${answer}: the exact retry is offered`);
      await click(retry);
      const [original, again] = calls.filter(call => call.method === "POST").map(call => JSON.stringify(call.body));
      assert.ok(again, `${answer}: retry sent`);
      assert.equal(again, original, `${answer}: retry body is identical`);
    }
  });
}
