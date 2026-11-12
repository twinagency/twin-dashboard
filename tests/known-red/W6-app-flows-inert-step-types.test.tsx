// KNOWN RED (rule 2 "configured but inert", CLAUDE.md "The half-wired toggle"; W6-app-flows finding, HIGH).
// The onboarding step builder (app/flows/FlowsForm.tsx:56-70 type list, :254 new-step default "text", :366 copy) offers
// text/voice/photo/video/bundle/tease steps that "fire", and saveCampaign stores them (actions.ts:64). The bot runtime
// only delivers location_gate in-turn (twin-bot src/handler.ts:2899-2907, `dueOnboardingStep(..., "location_gate")`)
// and collect only as a reply nudge (src/flows/text.ts:266, src/flows/smart.ts:261). Worse, dueOnboardingStep without
// `only` picks the first undelivered step (src/onboarding.ts:191-217), so a retired send step listed before a collect
// step blocks that collect step forever. RUNTIME_DELIVERED below is hardcoded from those bot citations (CI has no bot
// checkout); update it with the bot if the runtime starts delivering another type.
// Condition: operator adds a new onboarding step and picks (or keeps the default) any type outside RUNTIME_DELIVERED.
// Harness: the real FlowsForm in jsdom (same harness as W6-app-flows-new-step-second-save.test.tsx); an offered type is
// whatever a NEW step posts to saveCampaign, untouched (the default) and after clicking each type chip.
// Run: nice -n 10 node --import tsx --test tests/known-red/W6-app-flows-inert-step-types.test.tsx
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

const RUNTIME_DELIVERED = ["location_gate", "collect"];

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/flows" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, MutationObserver: dom.window.MutationObserver, React, IS_REACT_ACT_ENVIRONMENT: true });

type PostedStep = { id?: string; type: string; after_messages: number };
const posts: PostedStep[][] = [];
const path = "app/flows/FlowsForm.tsx";
const js = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} as Record<string, any> };
new Function("require", "module", "exports", js)((name: string) => {
  if (["react", "react/jsx-runtime"].includes(name)) return nativeRequire(name);
  if (name === "@/components/DashboardAccessProvider") return access;
  if (name === "@/components/clone/fields") return fields;
  if (name === "@/components/clone/MediaPicker") return { MediaPicker: () => null };
  if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
  if (name === "./actions") return { saveCampaign: async (_id: string, fd: FormData) => { posts.push(JSON.parse(String(fd.get("onboarding_steps")))); } };
  throw new Error("Unexpected FlowsForm import: " + name);
}, mod, mod.exports);
const FlowsForm = mod.exports.default as React.ComponentType<any>;
const initial = { enabled: false, campaignCaptionsOff: false, onboardingCaptionsOff: false, steps: [], welcomeInstruction: null, blockUsFansEnabled: false,
  freePreviewEnabled: false, freePreviewAfterMinutes: null, freePreviewAfterMessages: null, freePreviewMediaId: null, freePreviewInstruction: null,
  followupAfterMinutes: 0, winbackLapseDays: 7, onboardingSteps: [], funnelPolicy: "legacy", intentNaturalTriggers: true, intentDirectPurchaseOverride: true,
  intentFallbackOfferAfterMessages: 8, intentMaxIgnoredOffers: 2, intentRejectionCooldownMessages: 8, intentPostPurchaseCooldownMinutes: 45 };
const props = { cloneId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", photosEnabled: true, videosEnabled: true, bundlesEnabled: true, photos: [], videos: [], bundles: [] };

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
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

// Every type a brand-new onboarding step can be saved as: its default, then each type chip in its row.
async function offeredTypes(): Promise<string[]> {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<FlowsForm {...props} initial={initial} />); });
  await click([...document.querySelectorAll("button")].find(item => /\+ Add step/.test(item.textContent ?? "")));
  const offered = new Set<string>();
  const posted = async () => { const saved = await submit(); assert.equal(saved.length, 1, "the one new step is posted"); offered.add(saved[0].type); };
  await posted();
  const chips = () => {
    const number = [...document.querySelectorAll("form span")].find(item => item.textContent === "1");
    const row = number?.parentElement;
    assert.ok(row, "the new step row renders");
    return [...row.querySelectorAll<HTMLButtonElement>(":scope > div.flex.min-w-0.flex-wrap > button")];
  };
  const count = chips().length;
  assert.ok(count > 0, "the new step row offers type chips");
  for (let index = 0; index < count; index++) { await click(chips()[index]); await posted(); }
  return [...offered];
}

test("control: the builder offers the two types the runtime delivers (location_gate, collect)", async () => {
  const offered = await offeredTypes();
  for (const type of RUNTIME_DELIVERED) assert.ok(offered.includes(type), `builder offers ${type}`);
});

test("HIGH: every step type the builder offers for a NEW step is one the bot runtime delivers", async () => {
  const offered = await offeredTypes();
  assert.deepEqual(offered.filter(type => !RUNTIME_DELIVERED.includes(type)), [], "these types save, show as firing, and never fire (configured but inert)");
});
