// KNOWN RED (REVIEW.md inv 7 "Holds and STOP: a STOP is never harder to trigger than a go"; W3 api-onlyfans-plus7 finding A-C1).
// Drives the real POST app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route.ts (tests/helpers/
// W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers, server-only, supabase-service mocked; the harness's requireOnlyFansRead keeps
// route.ts's capability arithmetic verbatim, drift-checked). Identity: an agency chatter (grant canChat true, canManage false). The real
// configuredControlBackend runs over the REAL agency transport (agencyScopedFetch, incl. its chatBackendPath rule for a non-manager write)
// on the fake wire at https://backend.invalid: one preflight, then the command on /onlyfans/agency/v1/control/v1/...; the control
// answer is 409 (the answer is not under test). No extra module mocks.
// Trace: :55 `if (!ctx.canManage && !["manual_message", "request_takeover", "release_takeover"].includes(action)) return refuse(403, ...)`.
// A chatter may send a manual message, take over and RELEASE (go), but may not pause automation or mark a fan no-contact (holds). The
// middleware (agency-scope.ts agencyOnlyFansRequest canChat branch) and the chat transport (chatBackendPath, exercised here for real)
// already admit the POST; only this line refuses it. The release half is RISKS D6 (owner decision, not tested here); the stop half is not in RISKS.
// Fixed looks like pause_automation and mark_no_contact accepted for any identity that may send (relayed once upstream), while
// resume_automation (a go) stays manager-only.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Runs with plain commands:
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-controls-chat-stop.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-controls-chat-stop.test.ts   (red, ERR_ASSERTION)
// Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { BACKEND, PREFLIGHT, call, calls, ensureModuleMocks, reset, state, upstream } from "../helpers/W3-api-onlyfans-plus7-harness";

const ROUTE = "onlyfans-controls/accounts/[accountId]/conversations/[conversationId]";
const AGENCY = "11111111-1111-4111-8111-111111111111", CREATOR = "33333333-3333-4333-8333-333333333333";
const chatter = { creatorIds: [CREATOR], actor: `agency-user:${AGENCY}:22222222-2222-4222-8222-222222222222`, canManage: false, canChat: true };
const send = (body: Record<string, unknown>) => call(ROUTE, { accountId: "of-a", conversationId: "of-a:900000000001" }, { body });
const URL_ = `${BACKEND}/onlyfans/agency/v1/control/v1/accounts/of-a/conversations/of-a%3A900000000001`;
/** Wire calls other than the agency transport's preflight. */
const sent = () => calls.filter(c => c.path !== PREFLIGHT);
const preflights = () => calls.filter(c => c.path === PREFLIGHT).length;

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 2 })) {
  beforeEach(() => { reset(); upstream(() => Response.json({ ok: false }, { status: 409 })); });

  test("control: a chatter's manual message reaches upstream once, as the chatter", async () => {
    state.identity = { grant: chatter };
    const response = await send({ action: "manual_message", expectedRevision: 4, body: "synthetic hello", requestKey: "0a1b2c3d-1111-4222-8333-444455556661" });
    assert.notEqual(response.status, 403);
    assert.equal(preflights(), 1, "one agency preflight");
    assert.equal(sent().length, 1);
    assert.equal(sent()[0].url, URL_);
    assert.equal((sent()[0].body as { actor: string }).actor, chatter.actor);
  });

  test("control: a manager's pause_automation reaches upstream once", async () => {
    state.identity = { grant: { ...chatter, canManage: true } };
    const response = await send({ action: "pause_automation", expectedRevision: 4 });
    assert.notEqual(response.status, 403);
    assert.equal(sent().length, 1);
    assert.equal(sent()[0].url, URL_);
    assert.equal((sent()[0].body as { action: string }).action, "pause_automation");
  });

  for (const action of ["pause_automation", "mark_no_contact"]) {
    test(`A-C1: a chatter who may send a manual message may also ${action} (STOP never harder than go)`, async () => {
      state.identity = { grant: chatter };
      const response = await send({ action, expectedRevision: 4 });
      assert.notEqual(response.status, 403, `${action} refused 403 for a chatter whose manual_message is accepted`);
      assert.equal(sent().length, 1, `${action} never reached upstream`);
      assert.equal(sent()[0].url, URL_, `${action} did not take the agency-scoped control path`);
    });
  }
}
