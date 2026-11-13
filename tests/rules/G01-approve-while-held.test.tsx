// RULE G01 (REVIEW.md inv 7 "Holds and STOP"): holds never offer approve. An unknown send for the same conversation holds that
// fan's approve, and unresolved work that cannot be read holds every approve (fails closed).
// Offline: 7a-harness (jsdom, the typed Plan C mock behind the real client and proxy); the unresolved read answers 503 at the
// backend wire. No network.
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
