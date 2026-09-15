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
import * as creatorPolicy from "../lib/creator-dashboard-policy";

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
const wordmark = compile("components/TwinWordmark.tsx", {
  "@/lib/agency-brand": agencyBrand,
  "@/lib/partner-portals": portals,
  "@/components/IntelligenceCoreIcon": core,
});
const components = compile("components/Sidebar.tsx", {
  "./DashboardAccessProvider": accessModule,
  "@/lib/agency-policy": agencyPolicy,
  "@/lib/agency-brand": agencyBrand,
  "@/lib/partner-portals": portals,
  "@/lib/creator-dashboard-policy": creatorPolicy,
  "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
  "next/navigation": { usePathname: () => pathname, useSearchParams: () => query },
  "@/lib/clone-switcher-bus": { openCloneSwitcher: () => undefined },
  "@/components/TwinAssistant": { __esModule: true, default: () => null },
  "@/components/TwinWordmark": wordmark,
  "@/components/IntelligenceCoreIcon": core,
});
const Content = components.SidebarContent as React.ComponentType<{ activeCloneId: string | null; headerAction?: React.ReactNode; showAssistant?: boolean }>;
const render = (agencyName?: string, canManage = false, activeCloneId: string | null = clone, mobile = false) =>
  renderToStaticMarkup(<Access agencyName={agencyName} canManage={canManage}><Content activeCloneId={activeCloneId} showAssistant={false} headerAction={mobile ? <button aria-label="Close navigation">Close</button> : undefined} /></Access>);

for (const mobile of [false, true]) {
  const kate = render(portals.JESS_KATE_PORTAL.name, true, clone, mobile);
  for (const label of ["Dashboard", "Operate", "Inbox", "Fans", "Mass messages", "Automations", "Content", "Vault", "Publishing", "Measure", "Analytics", "Manage", "Creators", "Team", "Settings"]) assert.match(kate, new RegExp(`>${label}<`));
  for (const href of ["/crm", "/crm/inbox", "/crm/fans", "/crm/mass-messages", "/crm/automations", "/crm/vault", "/crm/publishing", "/crm/analytics", "/clones", "/crm/team", "/crm/settings"]) assert.ok(kate.includes(`href="${href}"`), `Keep accessible CRM link ${href}`);
  assert.match(kate, /aria-expanded="false"/);
  assert.doesNotMatch(kate, /Not available|Read only|Creator management|AI Intelligence Core/);
  for (const href of ["/settings", "/agency-admin", "/api-access", "/jarvis", "/clones/new"]) assert.ok(!kate.includes(`href="${href}"`), `Do not widen access to ${href}`);
  if (mobile) assert.match(kate, /aria-label="Close navigation"/);
}
const moxy = render("Moxy");
assert.match(moxy, />CRM</); assert.match(moxy, /AI Intelligence Core/); assert.match(moxy, /Not available/);
assert.doesNotMatch(moxy, /aria-expanded/);
assert.equal((moxy.match(/<canvas/g) || []).length, 1, "Moxy keeps its unavailable intelligence-core treatment");
for (const [name, manage] of [["LYNQ", true], [undefined, false]] as const) {
  const html = render(name, manage);
  assert.match(html, />Dashboard</); assert.match(html, />Operate</); assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /AI Intelligence Core|href="\/info"/);
}
const palette = readFileSync("app/lynq-theme.css", "utf8");
assert.match(palette, /html\[data-brand-theme="lynq-light"\]/);
assert.match(palette, /color-scheme: light/);
assert.match(palette, /--color-panel: #ffffff/);
assert.match(palette, /--lynq-orange: #ff8b35/);
assert.match(palette, /--lynq-pink: #e94b9c/);
assert.match(palette, /--lynq-blue: #293bea/);
assert.doesNotMatch(palette, /html:has\(|content:\s*"AI Intelligence Core"|conic-gradient|lynq-orb-float|#090b12|#0f1320/, "Delete the competing dark stylesheet and generated sphere, not the real canvas");
assert.doesNotMatch(palette, /--color-good:/, "Financial status colours remain unchanged");
assert.doesNotMatch(readFileSync("components/DashboardAccessProvider.tsx", "utf8"), /const LYNQ_CSS|<style/, "Exactly one stylesheet owns the palette");
for (const mobile of [false, true]) {
  for (const manage of [false, true]) {
    const lynq = render("LYNQ", manage, clone, mobile);
    assert.match(lynq, /aria-label="LYNQ"/);
    assert.match(lynq, /data-lynq-core="particles"/);
    assert.equal((lynq.match(/<canvas/g) || []).length, 1, "Keep one original compact particle canvas in the wordmark");
    assert.match(lynq, /style="width:48px;height:48px"/);
    assert.doesNotMatch(lynq, /AI Intelligence Core|lynq-cyan/, "No separate large sphere hero");
    if (manage) {
      assert.ok(lynq.includes('href="/crm"'));
      assert.ok(lynq.includes('href="/crm/inbox"'));
    } else {
      assert.ok(lynq.includes('href="/revenue"'));
      assert.ok(lynq.includes('href="/users"'));
    }
  }
}
for (const name of [undefined, "Moxy", portals.JESS_KATE_PORTAL.name]) {
  assert.doesNotMatch(render(name), /data-lynq-core|lynq-light|--lynq-orange/, "LYNQ branding never leaks into another portal");
}
assert.match(readFileSync("app/layout.tsx", "utf8"), /data-brand-theme=\{isLynq\(agency\?\.name\) \? "lynq-light"/, "Verified LYNQ branding is applied during server render");
assert.match(render(undefined), /href="\/clones\/new"/);
pathname = "/crm/fans"; query = new URLSearchParams();
assert.match(render(portals.JESS_KATE_PORTAL.name, true), /href="\/crm\/fans"[^>]*bg-white\/12/);
assert.match(readFileSync("components/MobileMenu.tsx", "utf8"), /<SidebarContent/);
console.log("Sidebar: original LYNQ particle core retained, fake sphere and dark overrides removed, mobile/desktop and other portals preserved");
