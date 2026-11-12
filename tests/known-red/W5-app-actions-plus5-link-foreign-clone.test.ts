/**
 * Known red (W5 app-actions-plus5 F2, isolation/data-risk): POST /agency/creators/link checks only the NEW clone
 * against the agency's grants (app/agency/creators/link/route.ts:34) and never reads the creator's CURRENT link.
 * An empty clone_id goes to link_creator_platform_profile(p_clone_id null), which deletes the link outright
 * (deployment/creator-platforms.sql:69); a granted clone_id moves the creator off the foreign clone (:79-81).
 * So an agency can unlink or move a creator off a clone it was never granted. The page preselects "Not linked"
 * for such a row (creators/page.tsx:117 options hold only the agency's own clones), so one Save does it.
 * Control: an unassigned creator never reaches the RPC (holds). Turns green when the route refuses a creator whose
 * current link points at a clone outside access.cloneIds. Coupling: the fake serves the current link only from
 * `creator_clone_links` (the table the page and SQL use); a fix reading it elsewhere needs the fake extended.
 */
import { startFakePostgrest, formPost } from "./W5-app-actions-plus5-harness";
import assert from "node:assert/strict";
import test from "node:test";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { POST } from "../../app/agency/creators/link/route";

const AGENCY = "aaaaaaaa-1111-4111-8111-111111111111";
const OWN_CLONE = "cccccccc-1111-4111-8111-111111111111";
const FOREIGN_CLONE = "dddddddd-2222-4222-8222-222222222222";
const CREATOR = "eeeeeeee-3333-4333-8333-333333333333";
const access = { id: AGENCY, name: "Test Agency", cloneIds: [OWN_CLONE], canManage: true, creatorScope: "all" as const };

let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

function seed(assigned: boolean) {
  pg.reset();
  pg.respond((c) => {
    if (c.path.endsWith("/creator_agency_assignments")) return { body: assigned ? [{ creator_account_id: CREATOR }] : [] };
    if (c.path.endsWith("/creator_clone_links")) return { body: [{ creator_account_id: CREATOR, clone_id: FOREIGN_CLONE, twin_slug: "other" }] };
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
