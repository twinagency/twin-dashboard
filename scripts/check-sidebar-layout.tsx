import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Access, * as accessModule from "../components/DashboardAccessProvider";
import * as agencyPolicy from "../lib/agency-policy";
import * as agencyBrand from "../lib/agency-brand";
import * as portals from "../lib/partner-portals";

// Render the actual shared desktop/mobile content with isolated navigation.
// No credentials, database calls or messages are used by these fixtures.
const nativeRequire = createRequire(import.meta.url);
const clone = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
let pathname = "/revenue";
let query = new URLSearchParams();
function compile(path: string, imports: Record<string, unknown> = {}) {
  const source = readFileSync(path, "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const result = { exports: {} as Record<string, any> };
  const requireFixture = (name: string) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (["react", "react/jsx-runtime"].includes(name)) return nativeRequire(name);
    throw new Error(`Unexpected sidebar dependency ${name}`);
  };
  new Function("require", "module", "exports", javascript)(requireFixture, result, result.exports);
  return result.exports;
}
const core = compile("components/IntelligenceCoreIcon.tsx");
const components = compile("components/Sidebar.tsx", {
  "./DashboardAccessProvider": accessModule,
  "@/lib/agency-policy": agencyPolicy,
  "@/lib/agency-brand": agencyBrand,
  "@/lib/partner-portals": portals,
  "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
  "next/navigation": { usePathname: () => pathname, useSearchParams: () => query },
  "@/lib/clone-switcher-bus": { openCloneSwitcher: () => undefined },
  "@/components/TwinAssistant": { __esModule: true, default: () => null },
  "@/components/TwinWordmark": { __esModule: true, default: ({ agencyName }: { agencyName?: string }) => React.createElement("span", null, agencyName || "Twin") },
  "@/components/IntelligenceCoreIcon": core,
});
const Content = components.SidebarContent as React.ComponentType<{ activeCloneId: string | null; headerAction?: React.ReactNode; showAssistant?: boolean }>;
const render = (agencyName?: string, canManage = false, activeCloneId: string | null = clone, mobile = false) =>
  renderToStaticMarkup(<Access agencyName={agencyName} canManage={canManage}><Content activeCloneId={activeCloneId} showAssistant={false} headerAction={mobile ? <button aria-label="Close navigation">Close</button> : undefined} /></Access>);

for (const mobile of [false, true]) {
  const kate = render(portals.JESS_KATE_PORTAL.name, true, clone, mobile);
  assert.doesNotMatch(kate, /CRM|\/crm\//, "Remove the whole CRM group, not just its heading");
  assert.match(kate, /<h2[^>]*>More<\/h2>/, "More is an always-visible heading");
  assert.doesNotMatch(kate, /aria-expanded|Not available|Read only|Creator management/);
  for (const href of ["/revenue", "/clones", "/users", "/business", "/flows", "/info", "/logs", `/clones/${clone}?tab=ppvs`, `/clones/${clone}?tab=identity`]) {
    assert.ok(kate.includes(`href="${href}"`), `Keep accessible link ${href}`);
  }
  for (const href of ["/settings", "/agency-admin", "/api-access", "/jarvis", "/clones/new"]) assert.ok(!kate.includes(`href="${href}"`), `Do not widen access to ${href}`);
  assert.equal((kate.match(/AI Intelligence Core/g) || []).length, 1);
  assert.equal((kate.match(/<canvas/g) || []).length, 1);
  assert.ok(kate.indexOf("<canvas") < kate.indexOf("<nav"), "Animated core above nav");
  assert.match(kate, /<canvas[^>]*width="128"[^>]*height="128"[^>]*style="width:64px;height:64px"/);
  if (mobile) assert.match(kate, /aria-label="Close navigation"/);
}
const moxy = render("Moxy");
assert.match(moxy, />CRM</); assert.match(moxy, /AI Intelligence Core/); assert.match(moxy, /Not available/);
assert.doesNotMatch(moxy, /aria-expanded/);
assert.equal(moxy.match(/<canvas[^>]*><\/canvas>/)?.[0], render(portals.JESS_KATE_PORTAL.name, true).match(/<canvas[^>]*><\/canvas>/)?.[0], "Reuse Moxy's exact animated globe component and size");
for (const [name, manage] of [["LYNQ", true], [undefined, false]] as const) {
  const html = render(name, manage);
  assert.match(html, />CRM</); assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /AI Intelligence Core|href="\/info"/);
}
assert.match(render(undefined), /href="\/clones\/new"/);
assert.match(render(portals.JESS_KATE_PORTAL.name, true, null), /Pick a creator first/);
pathname = `/clones/${clone}`; query = new URLSearchParams("tab=identity");
assert.match(render(portals.JESS_KATE_PORTAL.name, true), /href="[^\"]+tab=identity"[^>]*bg-white\/12/);
assert.match(readFileSync("components/MobileMenu.tsx", "utf8"), /<SidebarContent/);
console.log("Sidebar: Kate CRM removed, More always visible, Moxy animated core reused, desktop/mobile parity and other portals preserved");
