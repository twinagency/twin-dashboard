/**
 * Known red (W6 app-creator-management-plus8 F1, security): "Mark as reviewing" restores dashboard access to a
 * paused or archived creator. app/creator-management/[id]/page.tsx:141 posts the hard-coded pair
 * account_status=applicant + application_status=reviewing; app/creator-management/actions.ts:16-47
 * (updateCreatorReviewStatus) writes account_status without reading the current account, and `applicant` is an
 * access status (lib/creator-dashboard-identity.ts:28 CREATOR_ACCESS_STATUSES, :34 creatorAccountStatusAllowsAccess).
 * Condition: internal admin submits that form for a creator with an application whose account is paused/archived.
 * Server actions are POST-callable, so hiding the button is not a fix; the test drives the action, not the page.
 * Control (holds today): a submitted applicant -> reviewing ends with account applicant + application reviewing.
 * Red: for a paused and for an archived creator, no access status may land on creator_accounts (the action may
 * throw/refuse, or leave the account status unchanged). Asserted on the fake's table state after the wire writes.
 * Turns green when the action applies a from->to rule that never moves a paused/archived account to an access
 * status on a review action. Coupling: a fix has to read the current creator_accounts row; the fake serves it
 * (GET filtered by id). A fix that moves the write into an RPC is invisible to the fake table store, so the red
 * would pass vacuously and the control would fail: replace both with a SQL-level test (TEST-CHANGE line).
 */
import "./W6-app-creator-management-plus8-harness";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { adminCookieHeader, attempt, blockedFetches, form, startFakePostgrest } from "./W6-app-creator-management-plus8-harness";
import { updateCreatorReviewStatus } from "../../app/creator-management/actions";
import { creatorAccountStatusAllowsAccess } from "../../lib/creator-dashboard-identity";

const CREATOR = "11111111-1111-4111-8111-111111111111";
const APPLICATION = "22222222-2222-4222-8222-222222222222";

let fake: Awaited<ReturnType<typeof startFakePostgrest>>;
let cookie = "";
before(async () => { fake = await startFakePostgrest(); cookie = await adminCookieHeader(); });
after(async () => { await fake.close(); });

function seed(accountStatus: string, applicationStatus: string) {
  fake.seed({
    creator_accounts: [{ id: CREATOR, account_status: accountStatus, source: "signup", display_name: "Fake Creator", email: "fake@example.test" }],
    creator_applications: [{ id: APPLICATION, creator_account_id: CREATOR, status: applicationStatus, submitted_at: "2026-11-01T00:00:00.000Z" }],
  });
}

// Exactly the hidden fields of the "Mark as reviewing" form, page.tsx:141.
const markAsReviewing = () => form({ creator_account_id: CREATOR, application_id: APPLICATION, account_status: "applicant", application_status: "reviewing" });

test("control: a submitted applicant marked as reviewing ends applicant + reviewing on the wire", async () => {
  seed("applicant", "submitted");
  const outcome = await attempt(cookie, () => updateCreatorReviewStatus(markAsReviewing()));
  assert.equal(outcome.threw, null, `action threw: ${outcome.threw?.message}`);
  assert.equal(fake.rows("creator_accounts")[0].account_status, "applicant");
  assert.equal(fake.rows("creator_applications")[0].status, "reviewing");
  assert.ok(fake.writes("creator_applications").some((c) => c.method === "PATCH"), "no application PATCH reached the wire");
  assert.ok(outcome.revalidated.length > 0, "revalidatePath never ran");
  assert.deepEqual(blockedFetches, []);
});

test("control: without an admin session the action is refused before any write", async () => {
  seed("applicant", "submitted");
  const outcome = await attempt("", () => updateCreatorReviewStatus(markAsReviewing()));
  assert.match(outcome.threw?.message ?? "", /Administrator access required/);
  assert.deepEqual(fake.calls.filter((c) => c.method !== "GET"), []);
});

for (const [from, applicationStatus] of [["paused", "approved"], ["archived", "submitted"]] as const) {
  test(`marking a ${from} creator as reviewing does not give dashboard access back`, async () => {
    seed(from, applicationStatus);
    const outcome = await attempt(cookie, () => updateCreatorReviewStatus(markAsReviewing()));
    const status = fake.rows("creator_accounts")[0].account_status;
    const accountWrites = fake.writes("creator_accounts").map((c) => `${c.method} ${JSON.stringify(c.body)}`);
    assert.equal(creatorAccountStatusAllowsAccess(status), false,
      `${from} account now "${String(status)}" (an access status); threw=${outcome.threw?.message ?? "no"}; writes=${accountWrites.join(" | ")}`);
    assert.deepEqual(blockedFetches, []);
  });
}
