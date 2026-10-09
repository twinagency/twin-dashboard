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
const moxyDestinations = [
  ["Invite creator", "/agency/creator-invites"],
  ["Earnings", "/revenue"],
  ["Creators", "/clones"],
  ["Creator onboarding", "/agency/creators"],
  ["Content", `/clones/${clone}?tab=ppvs`],
  ["Telegram Stories", "/business"],
  ["Flows", "/flows"],
  ["Creator settings", `/clones/${clone}?tab=identity`],
  ["Connection details", "/info"],
  ["Activity logs", "/logs"],
];
const renderedLinks = (html: string) => Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), ([, attributes, content]) => ({
  label: content.replace(/<[^>]*>/g, "").trim(),
  href: attributes.match(/\bhref="([^"]*)"/)?.[1],
  attributes,
}));
function checkMoxyLayout(html: string) {
  const links = renderedLinks(html).filter(link => link.label);
  assert.deepEqual(links.map(({ label, href }) => [label, href]), moxyDestinations, "Keep all ten Moxy destinations in the approved shared order");
  assert.equal((html.match(/href="\/agency\/creator-invites"/g) || []).length, 1, "Invite creator appears once, as the prominent top action");
  assert.match(links[0].attributes, /class="[^"]*\bmoxy-invite-button\b/);
  assert.match(html, /<h2[^>]*>Workspace<\/h2>/, "Workspace is an always-visible heading");
  assert.match(html, /<h2[^>]*>Creator tools<\/h2>/, "Creator tools is an always-visible heading");
  assert.ok(html.indexOf("moxy-invite-button") < html.indexOf(">Workspace</h2>"), "The invite action sits above Workspace");
  assert.ok(html.indexOf(">Workspace</h2>") < html.indexOf(">Creator onboarding<"));
  assert.ok(html.indexOf(">Creator onboarding<") < html.indexOf(">Creator tools</h2>"));
  assert.ok(html.indexOf(">Creator tools</h2>") < html.indexOf(">Content<"));
  assert.doesNotMatch(html, /aria-expanded|<details\b/, "Moxy navigation has no dropdown groups");
  assert.deepEqual(links.filter(link => /aria-current="page"/.test(link.attributes)).map(link => link.label), ["Earnings"], "Exactly the current page is marked active");
}
for (const mobile of [false, true]) {
  const moxy = render("Moxy", false, clone, mobile);
  checkMoxyLayout(moxy);
  assert.match(moxy, /Moxy · Read only/, "Existing Moxy reader labels stay unchanged");
  assert.doesNotMatch(moxy, /Moxy · Owner/);
  assert.doesNotMatch(moxy, /Not available|aria-disabled|AI Intelligence Core|>CRM</, "Hide unavailable sections, including the empty CRM group and core");
  assert.doesNotMatch(moxy, /aria-expanded/, "Keep available secondary links expanded");
  assert.doesNotMatch(moxy, /Sales Health|href="\/sales-health"/, "Sales Health is hidden from Moxy reader navigation");
  assert.doesNotMatch(moxy, /Video sequences|href="\/sequences"/, "Video sequences is hidden from Moxy reader navigation");
  assert.doesNotMatch(moxy, /Live Telegram Chat|href="\/users"/, "Live Telegram Chat is absent from the Moxy reader sidebar");
  for (const href of ["/revenue", "/clones", "/business", "/flows", "/info", "/logs", "/agency/creators", "/agency/creator-invites", `/clones/${clone}?tab=ppvs`, `/clones/${clone}?tab=identity`]) {
    assert.ok(moxy.includes(`href="${href}"`), `Keep accessible Moxy link ${href}`);
  }
  for (const label of ["Storage", "Catalogue funnel", "Mini App rollout", "MTProto Campaign", "Tracker", "API", "Settings", "Inbox", "Fan CRM", "Campaigns", "Team", "Platforms"]) {
    assert.ok(!moxy.includes(`>${label}<`), `Hide unavailable Moxy section ${label}`);
  }
  if (mobile) assert.match(moxy, /aria-label="Close navigation"/);
}
for (const mobile of [false, true]) {
  const owner = render("Moxy", true, clone, mobile);
  checkMoxyLayout(owner);
  assert.match(owner, /Moxy · Owner/, "The verified management grant is visible on desktop and mobile");
  assert.doesNotMatch(owner, /Moxy · Read only/);
  assert.doesNotMatch(owner, />CRM<|href="\/crm\//, "Moxy owners cannot see CRM on desktop or mobile");
  assert.doesNotMatch(owner, /Sales Health|href="\/sales-health"/, "Sales Health is hidden from Moxy owner navigation");
  assert.doesNotMatch(owner, /Video sequences|href="\/sequences"/, "Video sequences is hidden from Moxy owner navigation");
  assert.doesNotMatch(owner, /Live Telegram Chat|href="\/users"/, "Live Telegram Chat is absent from the Moxy owner sidebar");
  for (const href of ["/revenue", "/clones", `/clones/${clone}?tab=ppvs`]) {
    assert.ok(owner.includes(`href="${href}"`), `Keep owner operating link ${href}`);
  }
  for (const href of ["/agency-admin", "/api-access", "/clones/new", "/settings"]) {
    assert.ok(!owner.includes(`href="${href}"`), `Scoped owner has no master navigation ${href}`);
  }
  if (mobile) assert.match(owner, /aria-label="Close navigation"/);
}
for (const mobile of [false, true]) {
  for (const manage of [false, true]) {
    const noClone = render("Moxy", manage, null, mobile);
    const links = renderedLinks(noClone);
    for (const label of ["Content", "Telegram Stories", "Flows", "Creator settings"]) {
      assert.ok(!links.some(link => link.label === label), `${label} still requires selecting a creator`);
      const button = Array.from(noClone.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)).find(([, , content]) => content.replace(/<[^>]*>/g, "").trim() === label);
      assert.ok(button, `${label} remains available as a creator-picker button`);
      assert.match(button[1], /title="Pick a creator first"/);
    }
    for (const [label, href] of moxyDestinations.filter(([label]) => !["Content", "Telegram Stories", "Flows", "Creator settings"].includes(label))) {
      assert.ok(links.some(link => link.label === label && link.href === href), `Keep ${label} available without a selected creator`);
    }
    for (const [route, search, expectedLabel] of [
      ["/agency/creator-invites", "", "Invite creator"],
      [`/clones/${clone}`, "tab=ppvs", "Content"],
      [`/clones/${clone}`, "tab=identity", "Creator settings"],
    ]) {
      pathname = route; query = new URLSearchParams(search);
      const current = renderedLinks(render("Moxy", manage, clone, mobile)).filter(link => /aria-current="page"/.test(link.attributes));
      assert.deepEqual(current.map(link => link.label), [expectedLabel], `Only ${expectedLabel} is active for ${route}?${search}`);
    }
  }
}
pathname = "/revenue"; query = new URLSearchParams();
const lynqNavigation = render("LYNQ", true);
assert.match(lynqNavigation, /href="\/sales-health"/);
assert.match(lynqNavigation, />CRM</);
assert.match(lynqNavigation, /aria-expanded="false"/);
assert.doesNotMatch(lynqNavigation, /AI Intelligence Core|href="\/info"/);
for (const mobile of [false, true]) {
  const admin = render(undefined, false, clone, mobile);
  assert.doesNotMatch(admin, />CRM<|href="\/crm\//, "Internal admin navigation has no CRM group");
  assert.doesNotMatch(admin, /aria-expanded|>More</, "Internal admin tools are always visible");
  for (const href of ["/sales-health", "/tsocial", "/jarvis", "/flows", "/sequences", "/catalogue-funnel", "/miniapp-rollout", "/mtproto-campaign", "/tracker", "/info", "/logs", "/sim", "/agency-admin", "/agency-admin/creator-codes", "/agency/creators", "/agency/creator-invites", "/api-access", "/settings"]) {
    assert.ok(admin.includes(`href="${href}"`), `Keep admin tool ${href} visible without expanding a group`);
  }
  for (const tab of ["ppvs", "identity"]) assert.ok(admin.includes(`href="/clones/${clone}?tab=${tab}"`));
  assert.doesNotMatch(admin, /AI Intelligence Core/);
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
    assert.ok(lynq.includes('href="/revenue"'));
    assert.ok(lynq.includes('href="/users"'));
  }
}
for (const name of [undefined, "Moxy", portals.JESS_KATE_PORTAL.name]) {
  assert.doesNotMatch(render(name), /data-lynq-core|lynq-light|--lynq-orange/, "LYNQ branding never leaks into another portal");
}
assert.match(readFileSync("app/layout.tsx", "utf8"), /data-brand-theme=\{isLynq\(agency\?\.name\) \? "lynq-light"/, "Verified LYNQ branding is applied during server render");
assert.match(render(undefined), /href="\/clones\/new"/);
assert.match(render(portals.JESS_KATE_PORTAL.name, true, null), /Pick a creator first/);
pathname = `/clones/${clone}`; query = new URLSearchParams("tab=identity");
assert.match(render(portals.JESS_KATE_PORTAL.name, true), /href="[^\"]+tab=identity"[^>]*bg-white\/12/);
assert.match(readFileSync("components/MobileMenu.tsx", "utf8"), /<SidebarContent/);
console.log("Sidebar: Moxy grouped navigation, prominent invite, ten destinations, creator gates and single active page verified for owners/readers on desktop/mobile; other portals preserved");
