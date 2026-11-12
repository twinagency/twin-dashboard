/**
 * Known red (W6 app-creator-management-plus8 F2, bug): "Twin Direct" locks an agency-invited creator out.
 * app/creator-management/[id]/page.tsx:168 posts agency_id "" for "Twin Direct"; app/creator-management/actions.ts:71-78
 * (assignCreatorAgency) then upserts {agency_id: null, assignment_source: "direct"} without reading
 * creator_accounts.source. lib/creator-dashboard-identity.ts:59 denies a creator whose source is "agency_invite"
 * and who has no agency (the link RPC refuses it too, deployment/creator-platforms.sql:22). Save reports success.
 * Condition: internal admin selects "Twin Direct" and saves for a creator whose source is agency_invite.
 * Control (holds today): for a creator with source "signup" the direct upsert (agency_id null) reaches the wire.
 * Red: for an agency_invite creator the action must not leave {source agency_invite, agency_id null}. It passes if
 * the action throws/refuses without upserting agency_id null, or if it also moves source away from agency_invite
 * through a creator_accounts PATCH. Asserted on the fake's table state after the wire writes.
 * Turns green when assignCreatorAgency refuses that transition, or changes source and assignment together.
 * Coupling: a fix has to read creator_accounts (the fake serves it, GET filtered by id). An RPC that carries the
 * creator id is counted as the atomic source+assignment path without inspecting its SQL (the fake cannot run it);
 * such a fix needs its SQL reviewed by hand or a SQL-level test (TEST-CHANGE line), and the control then changes too.
 */
import "./W6-app-creator-management-plus8-harness";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { adminCookieHeader, attempt, blockedFetches, form, startFakePostgrest } from "./W6-app-creator-management-plus8-harness";
import { assignCreatorAgency } from "../../app/creator-management/actions";

const CREATOR = "33333333-3333-4333-8333-333333333333";
const AGENCY = "44444444-4444-4444-8444-444444444444";

let fake: Awaited<ReturnType<typeof startFakePostgrest>>;
let cookie = "";
before(async () => { fake = await startFakePostgrest(); cookie = await adminCookieHeader(); });
after(async () => { await fake.close(); });

function seed(source: string) {
  fake.seed({
    creator_accounts: [{ id: CREATOR, account_status: "approved", source, display_name: "Fake Creator", email: "fake@example.test" }],
    partner_agencies: [{ id: AGENCY, name: "Fake Agency", active: true }],
    creator_agency_assignments: [{ creator_account_id: CREATOR, agency_id: AGENCY, assignment_source: "invite", assigned_at: "2026-11-01T00:00:00.000Z" }],
  });
}

// The "Twin Direct" option of the agency select, page.tsx:166-168.
const twinDirect = () => form({ creator_account_id: CREATOR, agency_id: "" });

test("control: Twin Direct for a signup creator upserts agency_id null on the wire", async () => {
  seed("signup");
  const outcome = await attempt(cookie, () => assignCreatorAgency(twinDirect()));
  assert.equal(outcome.threw, null, `action threw: ${outcome.threw?.message}`);
  const upserts = fake.writes("creator_agency_assignments").filter((c) => c.method === "POST");
  assert.ok(upserts.some((c) => c.body?.creator_account_id === CREATOR && c.body?.agency_id === null), "no direct upsert reached the wire");
  assert.equal(fake.rows("creator_agency_assignments")[0].agency_id, null);
  assert.ok(outcome.revalidated.length > 0, "revalidatePath never ran");
  assert.deepEqual(blockedFetches, []);
});

test("control: without an admin session the action is refused before any write", async () => {
  seed("signup");
  const outcome = await attempt("", () => assignCreatorAgency(twinDirect()));
  assert.match(outcome.threw?.message ?? "", /Administrator access required/);
  assert.deepEqual(fake.calls.filter((c) => c.method !== "GET"), []);
});

test("Twin Direct for an agency_invite creator does not leave them agency_invite with no agency", async () => {
  seed("agency_invite");
  const outcome = await attempt(cookie, () => assignCreatorAgency(twinDirect()));
  const source = fake.rows("creator_accounts")[0].source;
  const agencyId = fake.rows("creator_agency_assignments")[0]?.agency_id ?? null;
  const atomicRpc = fake.rpcs().some((c) => JSON.stringify(c.body ?? "").includes(CREATOR));
  const writes = fake.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path} ${JSON.stringify(c.body)}`);
  assert.ok(atomicRpc || !(source === "agency_invite" && agencyId === null),
    `left source=${String(source)} agency_id=${String(agencyId)} (identity :59 denies); threw=${outcome.threw?.message ?? "no"}; writes=${writes.join(" | ")}`);
  assert.deepEqual(blockedFetches, []);
});
