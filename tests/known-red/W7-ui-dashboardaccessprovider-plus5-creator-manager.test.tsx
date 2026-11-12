// KNOWN RED (W7 ui-dashboardaccessprovider-plus5, finding F1, security/high): a creator must never get manager
// authority in the UI. Commit a3d41459 "shell: simplify access check" changed DashboardAccessProvider.tsx:50-51 to
// `resolvedCanManage = !isAgency || canManage; readOnly = !resolvedCanManage`, so audience="creator" (as
// CreatorWorkspaceShell.tsx:58 passes it, no canManage) resolves canManage:true, readOnly:false. ManagerOnly then renders,
// ReadOnlyFields stops disabling its fieldset and MutationForm renders for every signed-in creator on /creator/*.
// Condition: any creator page. Fixed: `resolvedCanManage = audience === "admin" || (isAgency && canManage)`.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-dashboardaccessprovider-plus5-creator-manager.test.tsx
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, real provider, no network.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/creator/business" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, React, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.fetch = (async () => { throw new Error("network is not allowed in this test"); }) as typeof fetch;

let createRoot: typeof import("react-dom/client").createRoot;
let Access: typeof import("../../components/DashboardAccessProvider");
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  Access = await import("../../components/DashboardAccessProvider");
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

type Props = { audience?: "admin" | "agency" | "creator"; agencyName?: string; canManage?: boolean };
type Seen = { audience: string; canManage: boolean; readOnly: boolean };

async function render(props: Props) {
  const { default: DashboardAccessProvider, useDashboardAccess, ReadOnlyFields, ManagerOnly, MutationForm } = Access;
  let seen: Seen | undefined;
  function Probe() {
    const access = useDashboardAccess();
    seen = { audience: access.audience, canManage: access.canManage, readOnly: access.readOnly };
    return null;
  }
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root!.render(
      <DashboardAccessProvider {...props}>
        <Probe />
        <ReadOnlyFields><input id="field" /></ReadOnlyFields>
        <ManagerOnly><button id="manager-only">Save</button></ManagerOnly>
        <MutationForm id="mutation-form" method="post"><button>Submit</button></MutationForm>
      </DashboardAccessProvider>,
    );
  });
  assert.ok(seen, "probe rendered");
  return {
    ...seen,
    managerOnlyShown: document.getElementById("manager-only") !== null,
    fieldsetDisabled: document.querySelector("fieldset")?.disabled ?? null,
    mutationFormShown: document.getElementById("mutation-form") !== null,
  };
}

const MANAGER = { canManage: true, readOnly: false, managerOnlyShown: true, fieldsetDisabled: false, mutationFormShown: true };
const READ_ONLY = { canManage: false, readOnly: true, managerOnlyShown: false, fieldsetDisabled: true, mutationFormShown: false };
const pick = (r: Awaited<ReturnType<typeof render>>) => ({ canManage: r.canManage, readOnly: r.readOnly, managerOnlyShown: r.managerOnlyShown, fieldsetDisabled: r.fieldsetDisabled, mutationFormShown: r.mutationFormShown });

test("control: admin and managing agency can manage; a non-managing agency is read-only", async () => {
  const admin = await render({});
  assert.equal(admin.audience, "admin");
  assert.deepEqual(pick(admin), MANAGER, "internal admin (no props) manages");
  const agency = await render({ audience: "agency", agencyName: "Fixture Agency", canManage: true });
  assert.deepEqual(pick(agency), MANAGER, "agency with canManage manages");
  const viewer = await render({ audience: "agency", agencyName: "Fixture Agency", canManage: false });
  assert.deepEqual(pick(viewer), READ_ONLY, "agency without canManage is read-only");
});

test("F1: a creator (audience=creator, as CreatorWorkspaceShell passes it) is read-only", async () => {
  const creator = await render({ audience: "creator" });
  assert.equal(creator.audience, "creator");
  assert.deepEqual(pick(creator), READ_ONLY, "creator must not get manager authority: canManage false, readOnly true, ManagerOnly hidden, fieldset disabled, MutationForm absent");
});
