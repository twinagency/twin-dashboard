// KNOWN RED (migration 087 stable step id; W6-app-flows finding, HIGH).
// FlowsForm keeps the onboarding list in useState(initial.onboardingSteps) (app/flows/FlowsForm.tsx:185), page.tsx:465
// renders it with no `key`, and after `await saveCampaign(...)` the form only calls router.refresh() (FlowsForm.tsx:314-318).
// A step added this session keeps `id: null` in client state, so a SECOND save without a reload posts it id-less again
// and the server mints a second id; a fan who got the step under the first id gets it again.
// Condition: operator adds an onboarding step, saves, edits anything, saves again on the same page load.
// Harness: the real FlowsForm, transpiled with a fake require (precedent scripts/check-sidebar-layout.tsx), rendered in
// jsdom with react-dom/client + act (precedent tests/components/engine-ui.test.tsx). Fakes: next/navigation (useRouter
// counts refresh), ./actions (saveCampaign captures the FormData and returns nothing, like today), MediaPicker (null).
// router.refresh() is simulated by re-rendering the SAME root with `initial` as page.tsx:515-531 would rebuild it from the
// saved row. If the team fixes this by keying FlowsForm in page.tsx instead, this rerender must apply the same key.
// Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-flows-new-step-second-save.test.tsx
// Team's Claude owns the fixes. Not wired into npm scripts; init.sh reports them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import ts from "typescript";
import React, { act } from "react";
import * as access from "../../components/DashboardAccessProvider";
import * as fields from "../../components/clone/fields";
const nativeRequire = createRequire(import.meta.url);
const { JSDOM } = nativeRequire("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/flows" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, MutationObserver: dom.window.MutationObserver, React, IS_REACT_ACT_ENVIRONMENT: true });

type PostedStep = { id?: string; type: string; after_messages: number };
const posts: PostedStep[][] = [];
let refreshes = 0;
const path = "app/flows/FlowsForm.tsx";
const js = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} as Record<string, any> };
new Function("require", "module", "exports", js)((name: string) => {
  if (["react", "react/jsx-runtime"].includes(name)) return nativeRequire(name);
  if (name === "@/components/DashboardAccessProvider") return access;
  if (name === "@/components/clone/fields") return fields;
  if (name === "@/components/clone/MediaPicker") return { MediaPicker: () => null };
  if (name === "next/navigation") return { useRouter: () => ({ refresh: () => { refreshes++; } }) };
  if (name === "./actions") return { saveCampaign: async (_id: string, fd: FormData) => { posts.push(JSON.parse(String(fd.get("onboarding_steps")))); } };
  throw new Error("Unexpected FlowsForm import: " + name);
}, mod, mod.exports);
const FlowsForm = mod.exports.default as React.ComponentType<any>;

type InitialStep = { id: string | null; type: string; afterMessages: number; mediaId: null; free: false; collectField: string | null;
  instruction: null; condition: "none"; conditionWithinMessages: null; conditionLapse: "send" };
const step = (id: string | null, type: string, afterMessages: number, collectField: string | null = null): InitialStep =>
  ({ id, type, afterMessages, mediaId: null, free: false, collectField, instruction: null, condition: "none", conditionWithinMessages: null, conditionLapse: "send" });
const initial = (onboardingSteps: InitialStep[]) => ({ enabled: false, campaignCaptionsOff: false, onboardingCaptionsOff: false, steps: [],
  welcomeInstruction: null, blockUsFansEnabled: false, freePreviewEnabled: false, freePreviewAfterMinutes: null, freePreviewAfterMessages: null,
  freePreviewMediaId: null, freePreviewInstruction: null, followupAfterMinutes: 0, winbackLapseDays: 7, onboardingSteps, funnelPolicy: "legacy",
  intentNaturalTriggers: true, intentDirectPurchaseOverride: true, intentFallbackOfferAfterMessages: 8, intentMaxIgnoredOffers: 2,
  intentRejectionCooldownMessages: 8, intentPostPurchaseCooldownMinutes: 45 });
const props = { cloneId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", photosEnabled: true, videosEnabled: true, bundlesEnabled: true, photos: [], videos: [], bundles: [] };

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const render = async (init: ReturnType<typeof initial>) => act(async () => { root!.render(<FlowsForm {...props} initial={init} />); });
const mount = async (init: ReturnType<typeof initial>) => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await render(init);
};
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));
const click = async (element: Element | null | undefined) => {
  assert.ok(element, "element exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
};
const submit = async (): Promise<PostedStep[]> => {
  const before = posts.length;
  const form = document.querySelector("form");
  assert.ok(form, "the Flows form renders");
  await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.equal(posts.length, before + 1, "one saveCampaign call per submit");
  return posts.at(-1)!;
};

test("control: the first submit posts every existing step's stable id unchanged", async () => {
  await mount(initial([step("step-a", "location_gate", 1), step("step-b", "collect", 2, "name")]));
  const saved = await submit();
  assert.deepEqual(saved.map(item => item.id), ["step-a", "step-b"]);
  assert.ok(refreshes >= 1, "a save refreshes the route");
});

test("HIGH: a step added this session carries its server-minted id on the second save (no reload)", async () => {
  const existing = [step("step-a", "location_gate", 1), step("step-b", "collect", 2, "name")];
  await mount(initial(existing));
  await click(button(/\+ Add step/));
  const first = await submit();
  assert.equal(first.length, 3);
  assert.equal(first[2].id, undefined, "a brand-new step is posted without an id, the server mints one");
  // router.refresh(): the server re-renders the page with the saved row, now carrying the minted id.
  const MINTED = "minted-step-c";
  await render(initial([...existing, step(MINTED, first[2].type, first[2].after_messages)]));
  const second = await submit();
  assert.deepEqual(second.map(item => item.id), ["step-a", "step-b", MINTED], "a second save must not mint a second id for the same step");
});
