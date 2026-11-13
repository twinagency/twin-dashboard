// RULE G01 (REVIEW.md inv 7 "No false success"): a command's confirmation says "Lists reloaded" only when the re-read succeeded.
// Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy); the second GET .../drafts answers 503
// at the backend wire. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { seedDraft } from "../contracts/plan-c-mock-backend";
import { approveButton, click, mountConsole, q } from "./7a-harness";

/** Approve one draft; with `rereadFails` the backend answers the second GET .../drafts with 503. Returns the confirmation. */
async function approveThenReload(rereadFails: boolean) {
  let draftReads = 0;
  const { mock } = await mountConsole({ drafts: [seedDraft()], wire: backend => (async (input: RequestInfo | URL, init?: RequestInit) =>
    (init?.method ?? "GET") === "GET" && String(input).endsWith("/drafts") && ++draftReads > 1 && rereadFails
      ? new Response(null, { status: 503 }) : backend.fetch(input, init)) as typeof fetch });
  const button = approveButton();
  assert.ok(button && !button.disabled, "fixture: approve is live");
  await click(button);
  assert.equal(mock.state.drafts[0].status, "approved", "fixture: the approve was recorded");
  if (rereadFails) assert.ok(q("[data-plan-c-drafts-error]"), "fixture: the re-read failed and says so");
  return q("[data-plan-c-confirmation]")?.textContent ?? "";
}

test("finding 6: control: an approve followed by a good re-read says 'Lists reloaded'", async () => {
  assert.match(await approveThenReload(false), /Lists reloaded/);
});

test("finding 6: an approve followed by a failed re-read does not claim the lists reloaded", async () => {
  assert.doesNotMatch(await approveThenReload(true), /Lists reloaded/, "the confirmation claims a reload that failed");
});
