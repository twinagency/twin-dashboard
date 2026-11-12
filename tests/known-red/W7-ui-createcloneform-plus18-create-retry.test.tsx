// KNOWN RED (W7 ui-createcloneform-plus18 F1-F4): the Create creator task runner's failure paths duplicate or lose work.
// F2 retryFailed (CreateCloneForm.tsx:201-207) reads the render's stale `tasks`, so a fully successful retry never
// navigates (:204), and when step 0 failed every later step stays `pending` forever (only `error` indices rerun, :202).
// F1 the submit button re-enables on failure (:346) and handleCreate nulls cloneIdRef (:193), creating a second clone row.
// F3 a bundle step reruns createBundle (:135) on retry, creating a second bundle row. F4 tasks are positional (:109-111),
// so removing a staged photo after a failure makes Retry upload the wrong photo and mark the removed one done.
// Team's Claude owns the fix. Not wired into npm scripts. Offline: jsdom, server actions faked at the module boundary
// (W7-ui-createcloneform-plus18-fakes/hooks.mjs), router via AppRouterContext, global fetch stubbed.
import "./W7-ui-createcloneform-plus18-fakes/hooks.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before, beforeEach } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/clones/new" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
  FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
const realObjectURL = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
URL.createObjectURL = () => "blob:fixture"; URL.revokeObjectURL = () => {};
globalThis.fetch = (async () => Response.json([])) as typeof fetch; // GET /api/models
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
let CreateCloneForm: typeof import("../../components/CreateCloneForm").default;
let AppRouterContext: typeof import("next/dist/shared/lib/app-router-context.shared-runtime").AppRouterContext;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime"));
  ({ default: CreateCloneForm } = await import("../../components/CreateCloneForm"));
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); URL.createObjectURL = realObjectURL.create; URL.revokeObjectURL = realObjectURL.revoke; });

type Call = { name: string; args: unknown[] };
type Fakes = { calls: Call[]; impl: Record<string, (...args: any[]) => Promise<unknown>> };
const fakes: Fakes = ((globalThis as any).__w7fakes ??= { calls: [], impl: {} });
const pushes: string[] = [];
const CLONE = "clone-fake-1";
const calls = (name: string) => fakes.calls.filter(c => c.name === name);
const uploadedNames = () => calls("uploadPhoto").map(c => ((c.args[1] as FormData).get("file") as File).name);
beforeEach(() => { fakes.calls.length = 0; fakes.impl = {}; pushes.length = 0; });

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const click = async (el: Element | null | undefined) => { assert.ok(el, "element exists"); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(); };
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => label.test(b.textContent ?? ""));
const setValue = async (el: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
const file = (name: string) => new dom.window.File(["x"], name, { type: "image/jpeg" }) as File;
async function pick(picker: RegExp, names: string[]) {
  const input = button(picker)?.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input, `file picker ${picker}`);
  Object.defineProperty(input, "files", { value: names.map(file), configurable: true });
  await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
}

// Renders the real form, fills its required fields, stages media, submits. Returns once the first run settled.
async function create(stage: { photos?: string[]; bundle?: string[] }) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  const router = { push: (href: string) => { pushes.push(href); }, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  await act(async () => { root!.render(<AppRouterContext.Provider value={router as any}><CreateCloneForm /></AppRouterContext.Provider>); });
  await settle();
  await setValue(document.querySelector<HTMLInputElement>('input[name="name"]')!, "Sophie");
  await setValue(document.querySelector<HTMLInputElement>('input[name="bot_token"]')!, "1234:ABC");
  if (stage.photos) await pick(/^📁Add photos \(any format/, stage.photos);
  if (stage.bundle) { await click(button(/^\+ New bundle$/)); await pick(/^📁Add photos to bundle/, stage.bundle); }
  const form = document.querySelector("form")!;
  // jsdom gap: its range value sanitization (jsdom helpers/form-controls.js "range") clamps but does not step-align, so
  // the unnamed slider (fields.tsx:1031-1036, value posts via a hidden input) reports stepMismatch. A browser rounds a
  // range value to its step, so a range never blocks submit there. Mirror that; nothing submitted changes.
  for (const range of form.querySelectorAll<HTMLInputElement>('input[type="range"]')) range.step = "any";
  const invalid = [...form.querySelectorAll<HTMLInputElement>("input,select,textarea")].filter(el => !el.checkValidity()).map(el => el.name || el.outerHTML.slice(0, 80));
  assert.deepEqual(invalid, [], "form is valid before submit");
  await submit();
}
async function submit() {
  const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  assert.ok(btn && !btn.disabled, "submit button enabled");
  await click(btn);
}
const failOnce = (name: string, when: (...args: any[]) => boolean, failure: (...args: any[]) => Promise<unknown>, ok: (...args: any[]) => Promise<unknown>) => {
  let failed = false;
  fakes.impl[name] = async (...args) => { if (!failed && when(...args)) { failed = true; return failure(...args); } return ok(...args); };
};
const photoOk = async () => ({ ok: true });
const photoFail = async () => ({ ok: false, error: "upload failed" });
const nameOf = (_id: string, fd: FormData) => (fd.get("file") as File).name;

test("control: all steps succeed, every staged item is created once and the operator lands on the new creator", async () => {
  await create({ photos: ["a.jpg"], bundle: ["x.jpg", "y.jpg"] });
  assert.equal(calls("createCloneRow").length, 1);
  assert.deepEqual(uploadedNames(), ["a.jpg"]);
  assert.deepEqual(calls("uploadPhoto").map(c => c.args[0]), [CLONE]);
  assert.equal(calls("createBundle").length, 1);
  assert.deepEqual(calls("addBundleItem").map(c => ((c.args[2] as FormData).get("file") as File).name), ["x.jpg", "y.jpg"]);
  assert.deepEqual(calls("compileCloneAction").map(c => c.args[0]), [CLONE]);
  assert.deepEqual(pushes, [`/clones/${CLONE}`]);
});

test("control: a failed step shows its error, offers Retry, and does not navigate", async () => {
  fakes.impl.uploadPhoto = photoFail;
  await create({ photos: ["a.jpg"] });
  assert.match(document.body.textContent ?? "", /✗ upload failed/);
  assert.ok(button(/^Retry failed steps$/), "retry offered");
  assert.deepEqual(pushes, []);
});

test("F2: a retry that fixes the only failed step navigates to the new creator", async () => {
  failOnce("uploadPhoto", () => true, photoFail, photoOk);
  await create({ photos: ["a.jpg"] });
  assert.deepEqual(pushes, [], "first run failed, stays");
  await click(button(/^Retry failed steps$/));
  assert.equal(calls("uploadPhoto").length, 2, "the failed photo was retried");
  assert.doesNotMatch(document.body.textContent ?? "", /✗/, "no step is failed any more");
  assert.deepEqual(pushes, [`/clones/${CLONE}`], "all steps done after retry, must navigate (retryFailed reads stale tasks, :204)");
});

test("F2: when Create creator fails once, Retry also runs the steps that never started", async () => {
  failOnce("createCloneRow", () => true, async () => { throw new Error("db down"); }, async () => CLONE);
  await create({ photos: ["a.jpg"] });
  assert.equal(calls("uploadPhoto").length, 0, "nothing ran after step 0 failed");
  await click(button(/^Retry failed steps$/));
  assert.equal(calls("createCloneRow").length, 2, "step 0 retried");
  assert.deepEqual(uploadedNames(), ["a.jpg"], "staged photo must be uploaded after a successful retry (left `pending`, :202)");
  assert.equal(calls("compileCloneAction").length, 1, "compile must run after a successful retry");
});

test("F1: resubmitting after a failed media step does not create a second clone row", async () => {
  failOnce("uploadPhoto", () => true, photoFail, photoOk);
  await create({ photos: ["a.jpg"] });
  assert.equal(calls("createCloneRow").length, 1);
  // Either fix is valid: a disabled submit makes a re-create impossible; an enabled one must not re-create.
  const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  assert.ok(btn, "submit button exists");
  if (!btn.disabled) await click(btn);
  assert.equal(calls("createCloneRow").length, 1, "submit re-enabled on failure (:346), handleCreate nulls cloneIdRef (:193) and creates the clone again");
});

test("F3: retrying a bundle whose item upload failed does not create a second bundle row", async () => {
  let bundles = 0;
  fakes.impl.createBundle = async () => `bundle-fake-${++bundles}`;
  failOnce("addBundleItem", () => true, async () => { throw new Error("item failed"); }, async () => undefined);
  await create({ bundle: ["x.jpg", "y.jpg"] });
  assert.match(document.body.textContent ?? "", /✗ item failed/);
  const failed = calls("addBundleItem")[0].args, failedName = ((failed[2] as FormData).get("file") as File).name;
  assert.equal(failed[0], "bundle-fake-1", "the failed item belonged to the first bundle");
  await click(button(/^Retry failed steps$/));
  assert.equal(calls("createBundle").length, 1, "retry reruns createBundle (:135), duplicating the bundle");
  const readded = calls("addBundleItem").slice(1).filter(c => c.args[0] === "bundle-fake-1" && ((c.args[2] as FormData).get("file") as File).name === failedName);
  assert.equal(readded.length, 1, `retry must re-add ${failedName} to the SAME bundle (bundle-fake-1)`);
});

test("F4: removing a staged photo after its upload failed does not make Retry re-upload a different photo", async () => {
  failOnce("uploadPhoto", (...args: any[]) => nameOf(args[0], args[1]) === "a.jpg", photoFail, photoOk);
  await create({ photos: ["a.jpg", "b.jpg"] });
  assert.deepEqual(uploadedNames().sort(), ["a.jpg", "b.jpg"]);
  const card = [...document.querySelectorAll("span")].find(s => s.textContent === "a.jpg")?.parentElement;
  await click(card?.querySelector("button"));
  await click(button(/^Retry failed steps$/));
  assert.equal(uploadedNames().filter(n => n === "b.jpg").length, 1, "b.jpg already uploaded; positional retry (:109-111) uploads it again under 'Photo: a'");
  // Honest outcome for the failed task: either a.jpg really got uploaded, or "Photo: a" is not shown as done.
  const aUploaded = uploadedNames().filter(n => n === "a.jpg").length > 1;
  const row = [...document.querySelectorAll("span")].find(s => s.textContent === "Photo: a")?.nextElementSibling?.textContent ?? "(removed)";
  assert.ok(aUploaded || row !== "✓", `'Photo: a' shows "${row}" but a.jpg was never uploaded successfully`);
});
