// RULE G01 (REVIEW.md inv 7 "Stale work"; canApprove in lib/onlyfans/plan-c.ts): once a draft's expiresAt passes, its approve
// is off or sends nothing, without waiting for the 30 s tick. Design-neutral: disabled, removed or no POST all pass.
// Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy). The draft expires 1.5 s after seeding
// and the test waits 1.7 s of real time. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { seedDraft } from "../contracts/plan-c-mock-backend";
import { approveButton, click, mountConsole, settle } from "./7a-harness";

test("finding 13: control: a draft that expires in the future has a live approve", async () => {
  await mountConsole({ drafts: [seedDraft()] });
  assert.equal(approveButton()?.disabled, false);
});

test("finding 13: once a draft's expiry passes after render, approve is disabled or sends nothing", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft({ expiresAt: new Date(Date.now() + 1500).toISOString() })] });
  assert.equal(approveButton()?.disabled, false, "fixture: approve is live before expiry");
  await new Promise(resolve => setTimeout(resolve, 1700)); // real time passes expiresAt; no tick fires
  await settle();
  assert.ok(Date.now() > Date.parse(mock.state.drafts[0].expiresAt), "fixture: the draft has expired");
  const button = approveButton(); // absent (draft removed or approve hidden) also satisfies the rule
  const enabled = !!button && !button.disabled;
  if (button && enabled) await click(button);
  assert.equal(mock.posts().filter(call => /\/approve$/.test(call.path)).length, 0,
    `an expired draft's approve left the dashboard (approve was ${enabled ? "enabled" : "disabled"} after expiry)`);
});
