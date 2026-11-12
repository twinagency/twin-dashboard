// KNOWN RED (W8 ui-twinassistant-plus8, findings F1 + F2, security/high): the internal admin's Team & access page
// (/agency-admin, components/TwinTeamAccess.tsx) must neither misreport nor silently change a member's authority.
// F1: for a fixed-management agency (LYNQ, Jess and Kate AI, Tether: lib/agency-management-policy.ts agencyCanManage
// without canManage) every active member is labelled "Manager" (:18) but the Access select offers only "read"
// ("Existing agency permissions", :19,45), so the only save button posts access=read and
// app/agency-admin/provision/route.ts:25 writes can_manage:false. middleware.ts:265 gates OnlyFans management on
// identity.canManage (ofManage), so one "Save access" / "Restore access" click removes connections, sign-in and the
// launch POSTs (incl. automation emergency-stop) while the table still says "Manager".
// F2: agency_memberships.can_chat (migration 20261028125157, set by agency owners via /agency/team) is not selected by
// app/agency-admin/page.tsx:15, so a chatter is labelled "Read-only", and saving "Read-only" leaves can_chat true
// (the parser accepts only read|manage, the route update never touches can_chat).
// Condition: a signed-in internal admin on /agency-admin selects such a member and presses the form's save button.
// Fixed: fixed-management saves leave can_manage unchanged (or offer a real choice); can_chat is loaded, shown and
// explicitly settable; "Read-only" really removes chat.
// Run: nice -n 10 node --import tsx --test tests/known-red/W8-ui-twinassistant-plus8-team-access.test.tsx
// Not wired into npm scripts. Offline: jsdom renders the real component; its member form is serialised and POSTed to
// the real provision route with stubbed modules (CJS Module._load): @/lib/internal-admin (admin true),
// @/lib/form-origin (trusted), @/lib/supabase-service (records the update payload, no network),
// @/components/NavigationLink (next/link needs the app router).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/agency-admin" });
const win = dom.window;
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Element: win.Element, Node: win.Node, Event: win.Event, MouseEvent: win.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
function fakeDb() {
  return {
    from(table: string) {
      let op = "select", payload: unknown;
      const chain: Record<string, unknown> = {};
      const record = () => calls.push({ table, op, payload });
      for (const m of ["eq", "order", "limit", "in"]) chain[m] = () => chain;
      chain.select = () => { if (op === "update") { record(); return Promise.resolve({ data: [{ user_id: "u" }], error: null }); } return chain; };
      chain.update = (p: unknown) => { op = "update"; payload = p; return chain; };
      chain.insert = (p: unknown) => { op = "insert"; payload = p; record(); return Promise.resolve({ error: null }); };
      chain.maybeSingle = () => Promise.resolve({ data: { id: "agency" }, error: null });
      return chain;
    },
    auth: { admin: { createUser: async () => ({ data: { user: { id: "new" } }, error: null }), deleteUser: async () => ({}) } },
  };
}
const Module = requireNative("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Module._load;
Module._load = (request, ...rest) => {
  if (request === "@/lib/internal-admin") return { hasInternalAdminAccess: async () => true };
  if (request === "@/lib/form-origin") return { trustedFormOrigin: () => true, dashboardOrigin: () => "https://fixture.invalid" };
  if (request === "@/lib/supabase-service") return { serviceClient: fakeDb };
  if (request === "@/components/NavigationLink") return { __esModule: true, default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> };
  return load(request, ...rest);
};

let createRoot: typeof import("react-dom/client").createRoot;
let TwinTeamAccess: typeof import("../../components/TwinTeamAccess").default;
let POST: typeof import("../../app/agency-admin/provision/route").POST;
let NextRequest: typeof import("next/server").NextRequest;
let policy: typeof import("../../lib/agency-management-policy");
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: TwinTeamAccess } = await import("../../components/TwinTeamAccess"));
  ({ POST } = await import("../../app/agency-admin/provision/route"));
  ({ NextRequest } = await import("next/server"));
  policy = await import("../../lib/agency-management-policy");
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

const MANAGED = "bc670215-110b-4ea0-8f5c-af3dfe21d253"; // Moxy: management depends on the member's can_manage
const USER = "11111111-1111-4111-8111-111111111111";
type MemberIn = { can_manage: boolean; can_chat?: boolean };
async function render(agencyId: string, m: MemberIn) {
  // Same two flags app/agency-admin/page.tsx:20-21 computes.
  const fixedManagement = policy.agencyCanManage({ id: agencyId, canManage: false });
  const managementAvailable = policy.agencyCanManage({ id: agencyId, canManage: true });
  const member = { user_id: USER, email: "staff@fixture.invalid", active: true, creator_scope: "all" as const, creator_ids: [], creator_access_revision: "rev-1", ...m };
  if (root) await act(async () => root!.unmount());
  root = createRoot(document.getElementById("root")!);
  await act(async () => root!.render(<TwinTeamAccess agencies={[{ id: agencyId, name: "Agency", slug: "agency" }]} agency={{ id: agencyId, name: "Agency", slug: "agency" }}
    members={[member]} error={false} status={null} fixedManagement={fixedManagement} managementAvailable={managementAvailable} truncated={false}
    creators={[]} ownerIds={[]} ownersUnavailable={false} />));
  const label = document.querySelector("tr[data-agency-member] td:nth-child(2)")?.textContent ?? "";
  return { label };
}
// Press the member form's primary button exactly as a browser would submit it (form fields + submitter name/value).
async function saveAccess(access?: string) {
  const form = document.querySelector<HTMLFormElement>("form[data-agency-member-form]");
  assert.ok(form, "member form rendered");
  if (access) { const select = form.querySelector<HTMLSelectElement>("select[name=access]")!; assert.ok([...select.options].some(o => o.value === access), `option ${access} offered`); select.value = access; }
  const fd = new FormData();
  for (const [k, v] of new win.FormData(form) as Iterable<[string, string]>) fd.append(k, v);
  const submit = form.querySelector<HTMLButtonElement>("button.twin-primary-link")!;
  fd.append(submit.name, submit.value);
  calls.length = 0;
  const res = await POST(new NextRequest("https://fixture.invalid/agency-admin/provision", { method: "POST", body: fd }));
  const update = calls.find(c => c.table === "agency_memberships" && c.op === "update");
  return { location: res.headers.get("location") ?? "", update: update?.payload as Record<string, unknown> | undefined };
}

test("control: a managed agency's manager and read-only member are labelled and saved as what they are", async () => {
  assert.equal((await render(MANAGED, { can_manage: true })).label, "Manager");
  const keep = await saveAccess();
  assert.match(keep.location, /result=updated/);
  assert.equal(keep.update?.can_manage, true, "saving a manager unchanged keeps can_manage");
  assert.equal((await render(MANAGED, { can_manage: false })).label, "Read-only");
  const read = await saveAccess();
  assert.equal(read.update?.can_manage, false);
});

test("F1 red: saving a fixed-management (LYNQ) manager unchanged must not strip can_manage", async () => {
  const { label } = await render(policy.LYNQ_MANAGEMENT_AGENCY_ID, { can_manage: true });
  assert.equal(label, "Manager", "page labels the member Manager");
  const saved = await saveAccess();
  assert.match(saved.location, /result=updated/, "page reports Team access updated");
  assert.notEqual(saved.update?.can_manage, false, "member labelled Manager loses can_manage (OnlyFans manage + emergency-stop POST, middleware.ts:265)");
});

test("F2 red: a chatter must not be labelled Read-only", async () => {
  const { label } = await render(MANAGED, { can_manage: false, can_chat: true });
  assert.notEqual(label, "Read-only", "can_chat member shown as Read-only");
});

test("F2 red: saving a chatter as Read-only must remove chat", async () => {
  await render(MANAGED, { can_manage: false, can_chat: true });
  const saved = await saveAccess("read");
  assert.match(saved.location, /result=updated/, "page reports Team access updated");
  assert.equal(saved.update?.can_chat, false, "update payload leaves can_chat untouched, so chat survives a Read-only save");
});
