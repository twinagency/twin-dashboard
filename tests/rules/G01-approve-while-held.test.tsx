// RULE G01 (promoted from known-red) (W1 lane 7a finding 4, docs/review/W1/preview-plan-c-status-ui.md; REVIEW.md inv 7 "Holds and STOP": holds
// are shown and never offer approve/send/resend). PlanCConsole.tsx:105 gates approve on canApprove (status + expiry only,
// plan-c.ts:261). So approve stays live (a) beside the draft's own "Unresolved evidence" (:80), (b) while an unknown_send
// for the same conversation is listed under Unresolved work (:231-236), and (c) when the unresolved list could not be read
// at all (fails open). Draft *status* holds are already covered by tests/rules/a-holds-win.test.tsx:103.
// Part (a), "draft.evidence means a hold", is NOT tested: no contract says so (NEEDS-BACKEND.md:123 gives the shape
// only), so it stays an [i] finding + LIVE-CHECK (codex final check). Team's Claude owns the fix.
// Not wired into npm scripts. Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy); (c)
// answers 503 for the unresolved read only, at the backend wire. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_ACCOUNT, seedDraft, type PlanCMock, type RawUnresolved } from "../contracts/plan-c-mock-backend";
import { all, approveButton, assertApproveHeld, mountConsole, q } from "./7a-harness";

const FAN = "900000000001", CONVERSATION = `${MOCK_ACCOUNT}:${FAN}`;
const unknownSend: RawUnresolved = { id: "unk-7a", kind: "unknown_send", owner: "engine", nextStep: "reconcile_with_provider",
  summary: "A send left the worker and no provider answer was recorded.", conversationId: CONVERSATION, revision: 7, createdAt: new Date().toISOString() };
/** The backend answers the unresolved read with 503; drafts stay readable. */
const unresolvedDown = (backend: PlanCMock) => (async (input: RequestInfo | URL, init?: RequestInit) =>
  (init?.method ?? "GET") === "GET" && String(input).endsWith("/unresolved") ? new Response(null, { status: 503 }) : backend.fetch(input, init)) as typeof fetch;

test("finding 4: control: a plain awaiting draft has a live approve", async () => {
  await mountConsole({ drafts: [seedDraft({ fanId: FAN })] });
  assert.equal(approveButton()?.disabled, false);
});

test("finding 4: an unknown send for the same conversation holds that conversation's approve", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft({ fanId: FAN })], unresolved: [unknownSend] });
  assert.ok(q("[data-plan-c-unresolved='unk-7a']"), "fixture: the unknown send is listed");
  await assertApproveHeld(mock, "an unknown send for this conversation is unresolved");
});

test("finding 4: when unresolved work cannot be read, approve fails closed", async () => {
  const { mock } = await mountConsole({ drafts: [seedDraft({ fanId: FAN })], unresolved: [unknownSend], wire: unresolvedDown });
  assert.ok(q("[data-plan-c-unresolved-error]"), "fixture: the unresolved read failed");
  assert.equal(all("[data-plan-c-draft]").length, 1, "fixture: the drafts read succeeded");
  await assertApproveHeld(mock, "unresolved work is unknown");
});
