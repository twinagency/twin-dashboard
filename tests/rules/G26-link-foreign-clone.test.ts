/**
 * G26: promoted from tests/known-red/W5-app-actions-plus5-link-foreign-clone.test.ts (rwl/W5-app-actions-plus5) as a
 * regression guard; harness is the shared tests/rules/G27-harness.ts. Original header below.
 * Known red (W5 app-actions-plus5 F2, isolation/data-risk): POST /agency/creators/link checks only the NEW clone
 * against the agency's grants (app/agency/creators/link/route.ts:34) and never reads the creator's CURRENT link.
 * An empty clone_id goes to link_creator_platform_profile(p_clone_id null), which deletes the link outright
 * (deployment/creator-platforms.sql:69); a granted clone_id moves the creator off the foreign clone (:79-81).
 * So an agency can unlink or move a creator off a clone it was never granted. The page preselects "Not linked"
 * for such a row (creators/page.tsx:117 options hold only the agency's own clones), so one Save does it.
 * Control: an unassigned creator never reaches the RPC (holds). Turns green when the route refuses a creator whose
 * current link points at a clone outside access.cloneIds. Coupling: the fake serves the current link only from
 * `creator_clone_links` (the table the page and SQL use); a fix reading it elsewhere needs the fake extended.
 * G26 adds: a creator linked to the agency's OWN clone can still be moved and unlinked (the fix must not just refuse
 * everything), and a failed read of the current link refuses (fail closed).
 */
import { startFakePostgrest, formPost } from "./G27-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { POST } from "../../app/agency/creators/link/route";

const AGENCY = "aaaaaaaa-1111-4111-8111-111111111111";
const OWN_CLONE = "cccccccc-1111-4111-8111-111111111111";
const OWN_CLONE_2 = "cccccccc-2222-4222-8222-222222222222";
const FOREIGN_CLONE = "dddddddd-2222-4222-8222-222222222222";
const CREATOR = "eeeeeeee-3333-4333-8333-333333333333";
const access = { id: AGENCY, name: "Test Agency", cloneIds: [OWN_CLONE, OWN_CLONE_2], canManage: true, creatorScope: "all" as const };

let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

function seed(assigned: boolean, current: string | null = FOREIGN_CLONE, linkStatus = 200) {
  pg.reset();
  pg.respond((c) => {
    if (c.path.endsWith("/creator_agency_assignments")) return { body: assigned ? [{ creator_account_id: CREATOR }] : [] };
    if (c.path.endsWith("/creator_clone_links")) return linkStatus === 200
      ? { body: current ? [{ creator_account_id: CREATOR, clone_id: current, twin_slug: "other" }] : [] }
      : { status: linkStatus, body: { message: "boom" } };
    if (c.path.endsWith("/rpc/link_creator_platform_profile")) return { body: null };
    return undefined;
  });
}
const rpcCalls = () => pg.calls.filter((c) => c.path.endsWith("/rpc/link_creator_platform_profile"));
const post = (cloneId: string) =>
  withDashboardAccess(access, () => POST(formPost("/agency/creators/link", { creator_account_id: CREATOR, clone_id: cloneId }) as any));

test("control: a creator not assigned to this agency never reaches the link RPC", async () => {
  seed(false);
  const res = await post("");
  assert.equal(res.status, 303);
  assert.equal(rpcCalls().length, 0);
});

test("unlink: empty clone_id must not delete a link to a clone the agency was never granted", async () => {
  seed(true);
  await post("");
  assert.deepEqual(rpcCalls().map((c) => c.body), [], "route called link_creator_platform_profile(p_clone_id null) for a foreign-clone link");
});

test("move: a granted clone_id must not move the creator off a clone the agency was never granted", async () => {
  seed(true);
  await post(OWN_CLONE);
  assert.deepEqual(rpcCalls().map((c) => c.body), [], "route relinked a creator currently on a foreign clone");
});

test("G26 control: an unlinked creator, or one on the agency's own clone, can still be linked, moved and unlinked", async () => {
  seed(true, null);
  await post(OWN_CLONE);
  assert.deepEqual(rpcCalls().map((c) => c.body), [{ p_account_id: CREATOR, p_clone_id: OWN_CLONE }]);
  seed(true, OWN_CLONE);
  await post(OWN_CLONE_2);
  assert.deepEqual(rpcCalls().map((c) => c.body), [{ p_account_id: CREATOR, p_clone_id: OWN_CLONE_2 }]);
  seed(true, OWN_CLONE);
  await post("");
  assert.deepEqual(rpcCalls().map((c) => c.body), [{ p_account_id: CREATOR, p_clone_id: null }]);
});

test("G26: a failed read of the creator's current link refuses instead of linking blind", async () => {
  seed(true, OWN_CLONE, 500);
  await post(OWN_CLONE_2);
  assert.deepEqual(rpcCalls().map((c) => c.body), [], "route linked without knowing the creator's current clone");
});
