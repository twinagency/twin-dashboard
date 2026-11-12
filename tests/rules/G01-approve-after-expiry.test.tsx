// RULE G01 (promoted from known-red) (W1 lane 7a finding 13, docs/review/W1/preview-plan-c-status-ui.md; REVIEW.md inv 7 "Stale work" and
// "No send, no auto-retry"). PlanCConsole.tsx:49 decides expiry from `now`, which only moves on the 30 s tick (:167) or a
// reload, so a draft whose expiresAt passes after the page rendered keeps a live approve for up to 30 s and a click sends
// the command; the backend is left to refuse it (409). Design-neutral: the red goes green if approve is disabled at
// expiry, removed, OR a click on it sends nothing (a render scheduled at expiresAt, a click-time check, a shorter tick under 1.5 s).
// The expiry-409 copy ("changed") is lane 1's (plan-c-backend 409 text): note only. Team's Claude owns the fix.
// Basis: the UI's own claim, canApprove's comment plan-c.ts:259-260 "Approve is offered only for a draft that is ... not
// past its expiry"; REVIEW does not itself require client-side expiry (codex final check), so this is LOW.
// Not wired into npm scripts. Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy). The
// draft expires 1.5 s after seeding and the test waits 1.7 s of real time, so the 30 s tick is never reached. No network.
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
