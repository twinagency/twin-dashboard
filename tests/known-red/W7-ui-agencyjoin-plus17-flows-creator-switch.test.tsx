// KNOWN RED (W7 ui-agencyjoin-plus17 finding F1, HIGH, data-risk): creator switch on /flows saves creator A's funnel onto B.
// CloneSwitcher.cloneRouteFor (components/CloneSwitcher.tsx:68-86) returns null for every cookie-scoped page and its
// comment claims "a refresh alone already switches the data underneath you". On /flows it does not: page.tsx:465 renders
// <FlowsForm cloneId=…> with no `key`, and FlowsForm seeds every control from useState(initial.*) / defaultValue
// (app/flows/FlowsForm.tsx:173-187, :341). The scope switch (setCloneScope revalidate, or router.refresh for agency) re-renders
// the same tree position with B's props, so React keeps A's state; Save then calls saveCampaign(B, A's values).
// Condition: internal admin or agency manager on /flows scoped to A switches to B in the header (no full reload) and presses Save.
// Same pattern as the filed W6 app-media-1 blocker (/media); this is the /flows instance, not filed before.
// Harness: precedent tests/known-red W6-app-flows (branch rwl/W6-app-flows): the real FlowsForm transpiled with a fake require,
// rendered in jsdom. The scope switch is simulated by re-rendering the SAME root with B's cloneId + initial, exactly what the
// server re-render does. If the fix keys FlowsForm (or the layout children) on the scope id, apply the same key here.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-agencyjoin-plus17-flows-creator-switch.test.tsx
// Team's Claude owns the fix. Not wired into npm scripts.
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

type Saved = { cloneId: string; funnelPolicy: string; blockUs: string; welcome: string; stepIds: (string | undefined)[] };
const saves: Saved[] = [];
const path = "app/flows/FlowsForm.tsx";
const js = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} as Record<string, any> };
new Function("require", "module", "exports", js)((name: string) => {
  if (["react", "react/jsx-runtime"].includes(name)) return nativeRequire(name);
  if (name === "@/components/DashboardAccessProvider") return access;
  if (name === "@/components/clone/fields") return fields;
  if (name === "@/components/clone/MediaPicker") return { MediaPicker: () => null };
  if (name === "next/navigation") return { useRouter: () => ({ refresh: () => {} }) };
  if (name === "./actions") return { saveCampaign: async (cloneId: string, fd: FormData) => { saves.push({ cloneId,
    funnelPolicy: String(fd.get("funnel_policy")), blockUs: String(fd.get("block_us_fans_enabled")), welcome: String(fd.get("welcome_instruction")),
    stepIds: (JSON.parse(String(fd.get("onboarding_steps"))) as { id?: string }[]).map(s => s.id) }); } };
  throw new Error("Unexpected FlowsForm import: " + name);
}, mod, mod.exports);
const FlowsForm = mod.exports.default as React.ComponentType<any>;

const step = (id: string) => ({ id, type: "collect", afterMessages: 2, mediaId: null, free: false, collectField: "name", instruction: null,
  condition: "none", conditionWithinMessages: null, conditionLapse: "send" });
const creator = (who: "A" | "B") => ({
  cloneId: who === "A" ? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  photosEnabled: true, videosEnabled: true, bundlesEnabled: true, photos: [], videos: [], bundles: [],
  initial: { enabled: false, campaignCaptionsOff: false, onboardingCaptionsOff: false, steps: [],
    welcomeInstruction: who === "A" ? "A greeting" : "B greeting", blockUsFansEnabled: who === "A",
    freePreviewEnabled: false, freePreviewAfterMinutes: null, freePreviewAfterMessages: null, freePreviewMediaId: null,
    freePreviewInstruction: null, followupAfterMinutes: 0, winbackLapseDays: 7, onboardingSteps: [step(`step-${who}`)],
    funnelPolicy: who === "A" ? "intent_v1" : "legacy", intentNaturalTriggers: true, intentDirectPurchaseOverride: true,
    intentFallbackOfferAfterMessages: 8, intentMaxIgnoredOffers: 2, intentRejectionCooldownMessages: 8, intentPostPurchaseCooldownMinutes: 45 },
});
const B_SAVED: Saved = { cloneId: creator("B").cloneId, funnelPolicy: "legacy", blockUs: "false", welcome: "B greeting", stepIds: ["step-B"] };

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const render = async (who: "A" | "B") => act(async () => { root!.render(<FlowsForm {...creator(who)} />); });
const mount = async (who: "A" | "B") => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await render(who);
};
const submit = async (): Promise<Saved> => {
  const before = saves.length;
  const form = document.querySelector("form");
  assert.ok(form, "the Flows form renders");
  await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 20)); });
  assert.equal(saves.length, before + 1, "one saveCampaign call per submit");
  return saves.at(-1)!;
};

test("control: /flows freshly loaded for creator B saves B's own funnel", async () => {
  await mount("B");
  assert.deepEqual(await submit(), B_SAVED);
});

test("HIGH: after switching A -> B in the header (no reload), Save writes B's own funnel, not A's", async () => {
  await mount("A");
  await render("B"); // setCloneScope revalidate / router.refresh: same tree position, B's props
  assert.deepEqual(await submit(), B_SAVED, "saveCampaign(B, …) must carry B's funnel_policy, US-block, greeting and steps");
});
