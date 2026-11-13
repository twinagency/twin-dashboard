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
 * G26 r1 adds: the RPC also deletes every OTHER creator's link to the TARGET clone (creator-platforms.sql:80), and a
 * clone can be shared by several agencies, so linking onto a clone another agency's creator holds is refused (RPC not
 * called); onto one held by this agency's own creator it is allowed; an unreadable target or assignment refuses.
 * The fake now answers creator_clone_links and creator_agency_assignments by their eq/neq/in filters (it used to
 * return one fixed row for any query); the earlier assertions are unchanged.
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
const PEER = "eeeeeeee-4444-4444-8444-444444444444"; // another creator already on the target clone
const OTHER_AGENCY = "bbbbbbbb-1111-4111-8111-111111111111";
const access = { id: AGENCY, name: "Test Agency", cloneIds: [OWN_CLONE, OWN_CLONE_2], canManage: true, creatorScope: "all" as const };

let pg!: Awaited<ReturnType<typeof startFakePostgrest>>;
test.before(async () => { pg = await startFakePostgrest(); });
test.after(() => pg.close());

type Seed = { assigned: boolean; current?: string | null; linkStatus?: number; peerAgency?: string | null; peerClone?: string; assignStatus?: number };
/** PostgREST filter value for `col` (eq./neq./in.(...)), or null when the query does not filter on it. */
const filter = (q: URLSearchParams, col: string) => q.get(col);
const matches = (q: URLSearchParams, col: string, value: string) => {
  const f = filter(q, col);
  if (f == null) return true;
  if (f.startsWith("eq.")) return f.slice(3) === value;
  if (f.startsWith("neq.")) return f.slice(4) !== value;
  if (f.startsWith("in.(")) return f.slice(4, -1).split(",").map((v) => v.replace(/"/g, "")).includes(value);
  throw new Error(`fake: unmodelled filter ${col}=${f}`);
};
function seed(assignedOrSeed: boolean | Seed, current: string | null = FOREIGN_CLONE, linkStatus = 200) {
  const o: Seed = typeof assignedOrSeed === "boolean" ? { assigned: assignedOrSeed, current, linkStatus } : { current: FOREIGN_CLONE, ...assignedOrSeed };
  const links = [
    ...(o.current ? [{ creator_account_id: CREATOR, clone_id: o.current, twin_slug: "other" }] : []),
    ...(o.peerClone ? [{ creator_account_id: PEER, clone_id: o.peerClone, twin_slug: "peer" }] : []),
  ];
  const assignments = [
    ...(o.assigned ? [{ creator_account_id: CREATOR, agency_id: AGENCY }] : []),
    ...(o.peerClone && o.peerAgency ? [{ creator_account_id: PEER, agency_id: o.peerAgency }] : []),
  ];
  pg.reset();
  pg.respond((c) => {
    if (c.path.endsWith("/creator_agency_assignments")) {
      if (o.assignStatus && filter(c.query, "creator_account_id")?.startsWith("in.")) return { status: o.assignStatus, body: { message: "boom" } };
      return { body: assignments.filter((r) => matches(c.query, "creator_account_id", r.creator_account_id) && matches(c.query, "agency_id", r.agency_id)) };
    }
    if (c.path.endsWith("/creator_clone_links")) {
      if ((o.linkStatus ?? 200) !== 200) return { status: o.linkStatus, body: { message: "boom" } };
      return { body: links.filter((r) => matches(c.query, "creator_account_id", r.creator_account_id) && matches(c.query, "clone_id", r.clone_id)) };
    }
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

test("G26 r1: linking onto a clone another agency's creator holds is refused (the RPC would delete their link)", async () => {
  seed({ assigned: true, current: null, peerClone: OWN_CLONE, peerAgency: OTHER_AGENCY });
  await post(OWN_CLONE);
  assert.deepEqual(rpcCalls().map((c) => c.body), [], "route let the RPC unlink another agency's creator from a shared clone");
  seed({ assigned: true, current: null, peerClone: OWN_CLONE, peerAgency: null });
  await post(OWN_CLONE);
  assert.deepEqual(rpcCalls().map((c) => c.body), [], "route let the RPC unlink an unassigned creator from the target clone");
});

test("G26 r1 control: onto a clone held by this agency's own creator it is allowed", async () => {
  seed({ assigned: true, current: null, peerClone: OWN_CLONE, peerAgency: AGENCY });
  await post(OWN_CLONE);
  assert.deepEqual(rpcCalls().map((c) => c.body), [{ p_account_id: CREATOR, p_clone_id: OWN_CLONE }]);
});

test("G26 r1: an unreadable assignment check for the target's creators refuses", async () => {
  seed({ assigned: true, current: null, peerClone: OWN_CLONE, peerAgency: AGENCY, assignStatus: 500 });
  await post(OWN_CLONE);
  assert.deepEqual(rpcCalls().map((c) => c.body), [], "route linked without knowing who holds the target clone");
});
