// KNOWN RED (W7 ui-agencyjoin-plus17 finding F3, HIGH after the confirmation pass): "Save paused" can turn the bot live.
// CloneForm's save bar derives `isPaused` from the SAVED row (components/CloneForm.tsx:278 `clone.status !== "active"`) and
// shows "Save paused" + "Saving keeps this creator paused unless you choose go live." (:448,:461). The submitted status is the
// hidden input driven by the editable Status toggle (components/clone/ConfigSections.tsx:645
// `<input type="hidden" name="status" value={cfg.active ? "active" : "paused"} />`), and save(false) posts it unchanged (:250).
// Condition: internal admin or agency manager (status is agency-writable, lib/agency-columns.ts:17) turns Status to Active
// on a paused creator and presses "Save paused": updateClone writes status=active and the bot answers real fans.
// Harness: the real CloneForm + real useCloneConfig + real clone/fields, transpiled with a fake require (precedent W6-app-flows
// known-reds). ConfigSections is replaced by a stub that renders exactly the two Status lines quoted above (:645-646);
// every other child is a null stub. updateClone is captured at the action boundary. jsdom, no network.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-agencyjoin-plus17-save-paused-goes-live.test.tsx
// Team's Claude owns the fix. Not wired into npm scripts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import ts from "typescript";
import React, { act } from "react";
import * as fields from "../../components/clone/fields";
import * as cloneConfig from "../../components/clone/useCloneConfig";
const nativeRequire = createRequire(import.meta.url);
const { JSDOM } = nativeRequire("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/clones/c1?tab=config" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, MutationObserver: dom.window.MutationObserver, React, IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0), cancelAnimationFrame: (id: number) => clearTimeout(id),
  fetch: async () => new Response("[]") });

const posted: string[] = [];
const Null = () => null;
const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
// ConfigSections.tsx:645-646, verbatim semantics: hidden status follows cfg.active; the Toggle flips it.
const ConfigSectionsStatusOnly = ({ cfg, set }: { cfg: { active: boolean }; set: (k: string, v: boolean) => void }) => <div>
  <input type="hidden" name="status" value={cfg.active ? "active" : "paused"} />
  <button type="button" data-status-toggle onClick={() => set("active", !cfg.active)}>{cfg.active ? "Active" : "Paused"}</button>
</div>;
const path = "components/CloneForm.tsx";
const js = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} as Record<string, any> };
new Function("require", "module", "exports", js)((name: string) => {
  if (["react", "react/jsx-runtime"].includes(name)) return nativeRequire(name);
  if (name === "./clone/fields") return fields;
  if (name === "./clone/useCloneConfig") return cloneConfig;
  if (name === "./clone/ConfigSections") return { __esModule: true, default: ConfigSectionsStatusOnly };
  if (name === "@/app/clones/actions") return { updateClone: async (_id: string, fd: FormData) => { posted.push(String(fd.get("status"))); }, deleteClone: async () => {} };
  if (name === "./DashboardAccessProvider") return { AdminOnly: Pass, ManagerOnly: Pass, ReadOnlyEditor: Pass,
    useDashboardAccess: () => ({ agencyName: null, readOnly: false, audience: "admin" }) };
  if (name === "next/navigation") return { usePathname: () => "/clones/c1", useRouter: () => ({ push: () => {}, refresh: () => {} }),
    useSearchParams: () => new URLSearchParams("tab=config") };
  if (name === "./ui/button") return { Button: ({ variant: _v, ...p }: Record<string, unknown>) => <button {...p} /> };
  if (name === "./clone/CreatorStudio") return { STUDIO_PAGES: {}, StudioNavigation: Null, isStudioTab: () => false, resolveStudioPanel: () => "overview" };
  if (name === "./clone/CreatorControlPlaneShell") return { ControlPlaneNavigation: Null, CreatorStudioStatus: Null, ReadOnlyControlPlaneNotice: Null };
  if (name === "@/lib/agency-brand") return { isMoxy: () => false };
  if (name === "@/lib/twin-agency-refresh") return { usesTwinAgencyRefresh: () => false };
  if (name === "@/lib/intake") return { INTAKE_FIELD_KEYS: [], INTAKE_SECTIONS: [], proseValue: () => "" };
  if (name === "lucide-react") return { LoaderCircle: Null };
  if (name.endsWith(".module.css")) return {};
  if (["@/components/NavigationLink", "./CreatorAvatar", "./IntakeFields", "./clone/PersonaFactsFields", "./clone/CloneAppearanceEditor",
    "@/app/media/MediaManager", "./flow/FlowGraph", "./BlurToggle"].includes(name)) return { __esModule: true, default: Null };
  throw new Error("Unexpected CloneForm import: " + name);
}, mod, mod.exports);
const CloneForm = mod.exports.default as React.ComponentType<any>;

const clone = { id: "c1", name: "Creator", slug: "creator", status: "paused" };
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const mount = async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<CloneForm clone={clone} promptPreview={{ blocks: [] }} photos={[]} videos={[]} bundles={[]} catalogueBundles={[]} appearanceColor="#000" />); });
};
const saveButton = () => [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].at(0);
const submit = async () => {
  const before = posted.length;
  await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 20)); });
  assert.equal(posted.length, before + 1, "one updateClone call per submit");
  return posted.at(-1);
};

test("control: an untouched paused creator shows 'Save paused' and saves status=paused", async () => {
  await mount();
  assert.equal(saveButton()?.textContent, "Save paused");
  assert.equal(await submit(), "paused");
});

test("HIGH: a save labelled 'Save paused' never writes status=active", async () => {
  await mount();
  await act(async () => { document.querySelector("[data-status-toggle]")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  const label = saveButton()?.textContent;
  const promise = document.body.textContent?.includes("Saving keeps this creator paused") ?? false;
  const status = await submit();
  assert.ok(!(status === "active" && (label === "Save paused" || promise)),
    `button "${label}"${promise ? ' + "Saving keeps this creator paused unless you choose go live."' : ""} but updateClone got status=${status}`);
});
