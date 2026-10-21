import PlatformMark from "../components/fans/PlatformMark";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { dashboardCreatorHref } from "../lib/dashboard-creator-route";
import * as intelligenceModel from "../components/clone/intelligence/model";
import * as intelligenceSections from "../components/clone/intelligence/sections";

const nativeRequire = createRequire(import.meta.url);

function compile(path: string, imports: Record<string, unknown>) {
  const source = readFileSync(path, "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const result = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", javascript)((name: string) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if(name === "../../fans/PlatformMark") return { __esModule: true, default: PlatformMark };
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return nativeRequire(name);
    throw new Error(`Unexpected configuration navigation dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}

async function main() {
  const { JSDOM } = nativeRequire("jsdom");
  const dom = new JSDOM("<!doctype html><div id='root'></div>", {
    url: "https://dashboard.example.test/dashboard?creator=briana",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Event", "MouseEvent", "Node", "File", "FormData", "requestAnimationFrame", "cancelAnimationFrame"]) {
    Object.defineProperty(globalThis, key, { value: typeof win[key] === "function" && key.endsWith("AnimationFrame") ? win[key].bind(win) : win[key], configurable: true });
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });

  // Next's app router patches native history calls and exposes the resulting
  // location through its navigation hooks. Reproduce that subscription here
  // while keeping JSDOM's actual history stack for Back/Forward coverage.
  const navigationEvent = "fixture-navigation";
  for (const method of ["pushState", "replaceState"] as const) {
    const original = win.history[method].bind(win.history);
    win.history[method] = (...args: Parameters<History[typeof method]>) => {
      original(...args);
      win.dispatchEvent(new win.Event(navigationEvent));
    };
  }
  const subscribe = (listener: () => void) => {
    win.addEventListener(navigationEvent, listener);
    win.addEventListener("popstate", listener);
    return () => {
      win.removeEventListener(navigationEvent, listener);
      win.removeEventListener("popstate", listener);
    };
  };
  const useLocation = () => React.useSyncExternalStore(subscribe, () => win.location.href);
  const router = {
    push: (href: string) => win.history.pushState(null, "", href),
    replace: (href: string) => win.history.replaceState(null, "", href),
    refresh: () => { throw new Error("Navigation must not refresh or submit creator configuration"); },
  };
  const navigation = {
    useRouter: () => router,
    usePathname: () => new URL(useLocation()).pathname,
    useSearchParams: () => new URLSearchParams(new URL(useLocation()).search),
  };

  let audience = "admin";
  let productionActions = 0;
  let unexpectedRequests = 0;
  Object.defineProperty(globalThis, "fetch", {
    value: async (url: string) => {
      if (url !== "/api/models") { unexpectedRequests++; throw new Error(`Unexpected production request: ${url}`); }
      return { json: async () => [] };
    },
    configurable: true,
  });
  const access = {
    useDashboardAccess: () => ({ audience, isAgency: audience === "agency", isCreator: audience === "creator", readOnly: audience !== "admin", agencyName: "", canManage: audience === "admin" }),
    AdminOnly: ({ children }: { children: React.ReactNode }) => audience === "admin" ? children : null,
    ManagerOnly: ({ children }: { children: React.ReactNode }) => audience === "admin" ? children : null,
    ReadOnlyEditor: ({ children }: { children: React.ReactNode }) => children,
  };
  const noOp = () => null;
  const fields = {
    FieldLabel: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
    Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    Modal: noOp,
  };
  const cfg = { aiMode: "smart", smartSplit: false, memoryWindow: 30, priceGuardMode: "block", strictMinorGate: true, photosEnabled: true, videosEnabled: true, bundlesEnabled: true, timezone: "Australia/Brisbane" };
  // Operational field components are isolated from database/model actions.
  // The mounted uncontrolled draft demonstrates that changing section keeps
  // the actual creator form's submitted shape and unsaved values intact.
  const OperationalFields = ({ tab }: { tab: string }) => <>
    <div className={tab === "identity" ? "" : "hidden"}><input name="fixture_note" defaultValue="Loaded note" /></div>
    <div data-operational-advanced className={tab === "advanced" ? "" : "hidden"}>Operational Advanced</div>
  </>;
  const shell = compile("components/clone/CreatorControlPlaneShell.tsx", {});
  const css = new Proxy({}, { get: (_, key) => String(key) });
  const IntelligenceControls = compile("components/clone/intelligence/IntelligenceControls.tsx", {
    "./model": intelligenceModel,
    "./sections": intelligenceSections,
    "./IntelligenceControls.module.css": { __esModule: true, default: css },
  }).default;
  const studio = compile("components/clone/CreatorStudio.tsx", { "./CreatorStudio.module.css": { __esModule: true, default: css } });
  const Component = compile("components/CloneForm.tsx", {
    "./DashboardAccessProvider": access,
    "@/lib/twin-agency-refresh": compile("lib/twin-agency-refresh.ts", {}),
    "@/components/NavigationLink": { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> },
    "./CreatorAvatar": { __esModule: true, default: ({ name }: { name: string }) => <span>{name}</span> },
    "./clone/CreatorStudio": studio,
    "./clone/CreatorStudio.module.css": { __esModule: true, default: css },
    "./clone/intelligence/model": intelligenceModel,
    "./clone/intelligence/sections": intelligenceSections,
    "./clone/intelligence/IntelligenceControls.module.css": { __esModule: true, default: css },
    "./BlurToggle": { __esModule: true, default: noOp },
    "@/lib/agency-brand": { isMoxy: () => false },
    "next/navigation": navigation,
    "./IntakeFields": { __esModule: true, default: noOp },
    "@/lib/intake": { INTAKE_FIELD_KEYS: [], INTAKE_SECTIONS: [], proseValue: (value: unknown) => String(value ?? "") },
    "./clone/PersonaFactsFields": { __esModule: true, default: noOp },
    "./clone/CloneAppearanceEditor": { __esModule: true, default: noOp },
    "@/app/media/MediaManager": { __esModule: true, default: noOp },
    "./flow/FlowGraph": { __esModule: true, default: noOp },
    "./clone/ConfigSections": { __esModule: true, default: OperationalFields },
    "./clone/intelligence/IntelligenceControls": { __esModule: true, default: IntelligenceControls },
    "./clone/fields": fields,
    "./clone/useCloneConfig": { useCloneConfig: () => [cfg, () => {}] },
    "@/app/clones/actions": {
      updateClone: async () => { productionActions++; throw new Error("Unexpected creator save"); },
      deleteClone: async () => { productionActions++; throw new Error("Unexpected creator delete"); },
    },
    "./ui/button": { Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> },
    "./clone/CreatorControlPlaneShell": shell,
  }).default;

  const clone = { id: intelligenceModel.BRIANNA_CONTROL_ID, name: "Brianna Redd", slug: "brianna", status: "active", updated_at: "2026-10-10T00:00:00Z", text_model: "fixture/text", routing_model: "fixture/router" };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const render = async (id = clone.id) => {
    await act(async () => root.render(<Component clone={{ ...clone, id }} promptPreview={{ mode: "smart", smartSplit: false, blocks: [] }} photos={[]} videos={[]} bundles={[]} catalogueBundles={[]} appearanceColor="#0080ff" />));
  };
  const follow = async (href: string) => { await act(async () => win.history.pushState(null, "", href)); };
  const navButton = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("nav[aria-label='Control Panel sections'] button")).find(button => button.textContent?.trim() === label)!;
  const clickTab = async (label: string) => { const button = navButton(label); assert.ok(button, `Section ${label} exists`); await act(async () => button.click()); };
  const visibleAdvancedIds = () => Array.from(document.querySelectorAll<HTMLElement>("[data-intelligence-control]")).map(card => Number(card.dataset.intelligenceControl));
  const assertExtendedAdvanced = () => {
    assert.equal(navButton("Advanced").getAttribute("aria-current"), "page");
    assert.deepEqual(visibleAdvancedIds(), [], "No browser-only demonstration controls");
    assert.equal((document.getElementById("creator-control-plane-form") as HTMLFormElement).hidden, false);
    assert.equal(document.querySelector("[data-operational-advanced]")?.className, "");
  };
  const traverseHistory = async (direction: "back" | "forward") => {
    await act(async () => {
      const popped = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`History ${direction} timed out`)), 1000);
        win.addEventListener("popstate", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      win.history[direction]();
      await popped;
    });
  };

  const snapshots: number[][] = [];
  for (const entry of ["View profile", "Creator Configuration"]) {
    await act(async () => root.render(null));
    await follow(dashboardCreatorHref("briana"));
    await render();
    assert.equal(navButton("Identity").getAttribute("aria-current"), "page", `${entry} begins on Identity`);
    await clickTab("Advanced");
    assert.equal(win.location.pathname, `/clones/${clone.id}`);
    assert.equal(new URLSearchParams(win.location.search).get("tab"), "advanced", `${entry} writes selected section to URL`);
    assertExtendedAdvanced();
    snapshots.push(visibleAdvancedIds());
  }
  assert.deepEqual(snapshots[0], snapshots[1], "Both dashboard entry routes expose the same real Advanced form");

  await follow(`${dashboardCreatorHref("briana")}&sub=persona&filter=retained`);
  assert.equal(navButton("Identity").getAttribute("aria-current"), "page");
  const draft = document.querySelector<HTMLInputElement>("input[name='fixture_note']")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
    setter.call(draft, "Unsaved creator note");
    draft.dispatchEvent(new win.Event("input", { bubbles: true }));
    draft.dispatchEvent(new win.Event("change", { bubbles: true }));
  });
  const payload = Array.from(new win.FormData(document.getElementById("creator-control-plane-form") as HTMLFormElement).entries());
  await clickTab("Advanced");
  assertExtendedAdvanced();
  const canonical = new URLSearchParams(win.location.search);
  assert.equal(canonical.get("tab"), "advanced");
  assert.equal(canonical.has("sub"), false, "Flat tab navigation discards retired sub routes");
  assert.equal(canonical.get("filter"), "retained", "Unrelated query state survives");
  assert.equal(document.querySelector("input[name='fixture_note']"), draft, "Section navigation does not remount uncontrolled creator fields");
  assert.deepEqual(Array.from(new win.FormData(document.getElementById("creator-control-plane-form") as HTMLFormElement).entries()), payload);
  const liveForm = document.getElementById("creator-control-plane-form") as HTMLFormElement;
  assert.equal(liveForm.hidden, false, "Operational Advanced is visible without opening a demo section");
  for (const section of ["memory", "rules", "creator", "live"]) {
    await follow(`/clones/${clone.id}?tab=advanced&section=${section}`);
    assertExtendedAdvanced();
    assert.equal(liveForm.querySelector("input[name='fixture_note']"), draft);
    assert.deepEqual(Array.from(new win.FormData(liveForm).entries()), payload, "Retired demo bookmarks preserve the full live form payload");
  }
  await clickTab("Configuration");
  assert.equal(visibleAdvancedIds().length, 0);
  await traverseHistory("back");
  assertExtendedAdvanced();
  await traverseHistory("forward");
  assert.equal(navButton("Configuration").getAttribute("aria-current"), "page");
  assert.equal(visibleAdvancedIds().length, 0);
  assert.equal(draft.value, "Unsaved creator note");

  await follow(`/clones/${clone.id}?tab=identity&sub=advanced`);
  assertExtendedAdvanced();
  await follow(dashboardCreatorHref("briana"));
  assert.equal(navButton("Identity").getAttribute("aria-current"), "page", "Reentering Creator Configuration resets visible section to its URL");
  await clickTab("Advanced");
  assertExtendedAdvanced();

  for (const restrictedAudience of ["agency", "creator"]) {
    audience = restrictedAudience;
    await render();
    assert.equal(document.querySelector("[data-intelligence-workspace]"), null, `${restrictedAudience} does not gain admin policies`);
    assert.equal(document.querySelector("[data-brianna-advanced]"), null);
    assert.equal(visibleAdvancedIds().length, 0);
  }
  audience = "admin";
  await render("unrelated-creator");
  assert.equal(document.querySelector("[data-intelligence-workspace]"), null, "Extended controls do not leak to another creator");
  assert.equal(document.querySelector("[data-brianna-advanced]"), null);
  await render();
  assertExtendedAdvanced();
  assert.equal(productionActions, 0, "Navigation never saves or deletes creator configuration");
  assert.equal(unexpectedRequests, 0, "No production configuration, message, payment, or model requests occur");
  await act(async () => root.unmount());
  dom.window.close();
  console.log("PASS: real Advanced, removed demo controls, canonical tab URLs, retired sub cleanup, Back/Forward, reentry, preserved drafts, audience/creator isolation, and zero creator writes.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
