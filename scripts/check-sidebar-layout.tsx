import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Access, * as accessModule from "../components/DashboardAccessProvider";
import * as agencyPolicy from "../lib/agency-policy";
import * as agencyBrand from "../lib/agency-brand";
import * as portals from "../lib/partner-portals";
import * as creatorPolicy from "../lib/creator-dashboard-policy";
import * as dashboardCreatorRoute from "../lib/dashboard-creator-route";

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
  "@/lib/dashboard-creator-route": dashboardCreatorRoute,
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
for (const route of ["tab=advanced", "tab=identity&sub=advanced"]) {
 pathname = "/clones/0328e7b3-a1e5-465a-9a30-c9cf6519cba1"; query = new URLSearchParams(route);
 assert.match(render(), /studio-brand-row/, "Brianna Advanced uses the approved Dashboard shell");
 assert.doesNotMatch(render("Moxy",true), /studio-brand-row/, "Partner branding is unchanged");
}
pathname = `/clones/${clone}`; query = new URLSearchParams("tab=advanced");
assert.doesNotMatch(render(), /studio-brand-row/, "Other creators keep their existing shell");
pathname = "/revenue"; query = new URLSearchParams();
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
    pathname = "/revenue"; query = new URLSearchParams();
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
  assert.match(admin, /data-admin-navigation="grouped"/);
  assert.match(admin, /data-nav-group="More"/);
  assert.match(admin, /aria-expanded="false"[^>]*aria-controls="admin-more-/);
  assert.match(admin, /id="admin-more-(desktop|mobile)" hidden=""/);
  assert.match(admin, /Show full navigation/);
  for (const href of ["/sales-health", "/tsocial", "/jarvis", "/flows", "/sequences", "/catalogue-funnel", "/miniapp-rollout", "/mtproto-campaign", "/tracker", "/info", "/logs", "/sim", "/agency-admin", "/agency-admin/creator-codes", "/agency/creators", "/agency/creator-invites", "/api-access", "/settings"]) {
    assert.ok(admin.includes(`href="${href}"`), `Keep admin tool ${href} visible without expanding a group`);
  }
  for (const tab of ["ppvs", "identity"]) assert.ok(admin.includes(`href="/clones/${clone}?tab=${tab}"`));
  assert.doesNotMatch(admin, /AI Intelligence Core/);
  assert.ok(admin.includes('href="/fans"'), "Admin fan workspace is reachable on desktop and mobile");
  assert.match(admin, /Fan Profiles/);
  const nav = admin.slice(admin.indexOf('<nav aria-label="Main navigation"'));
  const orderedLabels = ["Dashboard", "Creators", "Fan Profiles", "Inbox", "Content Library", "Campaigns", "Automations", "Performance", "Agency Access", "Core Intelligence", "Settings", "More"];
  assert.deepEqual(Array.from(nav.matchAll(/data-nav-group="([^"]+)"/g), match => match[1]), orderedLabels);
  const { JSDOM } = nativeRequire("jsdom");
  const document = new JSDOM(admin).window.document;
  const group = (name: string) => document.querySelector(`[data-nav-group="${name}"]`)!;
  for (const [name, hrefs] of Object.entries({
    Creators: [`/clones/${clone}?tab=identity`, "/agency-admin/creator-codes", "/agency/creator-invites", "/clones/new"],
    "Inbox": ["/inbox", "/users"],
    "Content Library": ["/content-library", `/clones/${clone}?tab=ppvs`, "/business"],
    Automations: ["/flows", "/sequences"],
    Performance: ["/revenue", "/sales-health", "/catalogue-funnel"],
    "Agency Access": ["/agency-admin", "/agency/creators"],
    "Core Intelligence": ["/jarvis", "/ai-models"],
    Settings: ["/settings", "/admin/earnings-split"],
    More: ["/storage", "/logs", "/api-access", "/sim", "/bot-v2", "/miniapp-rollout", "/mtproto-campaign", "/tracker", "/info", "/tsocial", "/admin/view-as"],
  })) for (const href of hrefs) assert.ok(Array.from(group(name).querySelectorAll("a")).some((a: any) => a.getAttribute("href") === href), `${href} belongs to ${name}`);
  const hrefs = Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] a')).map((a: any) => a.getAttribute("href"));
  assert.equal(new Set(hrefs).size, hrefs.length, "Each destination appears once");
  assert.deepEqual(renderedLinks(admin).filter(link => /aria-current="page"/.test(link.attributes)).map(link => link.label), ["Earnings"]);
  assert.ok(admin.includes('href="/dashboard"'), "Dashboard stays separate from the existing earnings page");

}
for (const agencyName of ["Moxy", "LYNQ", portals.JESS_KATE_PORTAL.name, portals.TETHER_PORTAL.name]) {
  assert.ok(!render(agencyName, true).includes('href="/dashboard"') && !render(agencyName, true).includes('href="/content-library"') && !render(agencyName, true).includes('href="/inbox"'), "The new internal Dashboard does not widen partner navigation");
}
pathname = "/dashboard";
assert.deepEqual(renderedLinks(render()).filter(link => /aria-current="page"/.test(link.attributes)).map(link => link.label), ["Dashboard"]);
for (const mobile of [false, true]) {
  for (const scope of [null, clone]) {
    for (const selected of [null, "briana", "riley", "kyla"]) {
      query = new URLSearchParams(selected ? `creator=${selected}` : "");
      const configuration = renderedLinks(render(undefined, false, scope, mobile)).find(link => link.label === "Creator Configuration");
      assert.ok(configuration, "Configuration is a working link even without the unmounted global creator picker");
      assert.equal(configuration.href, selected === "riley" || selected === "kyla" ? "/clones" : "/clones/0328e7b3-a1e5-465a-9a30-c9cf6519cba1?tab=identity", "Dashboard selection wins over empty or unrelated live scope");
    }
  }
}
query = new URLSearchParams();
// Opening a profile must not send configuration/PPV links back to a stale
// global scope, on either the desktop or mobile navigation.
const brianna = "0328e7b3-a1e5-465a-9a30-c9cf6519cba1";
pathname = `/clones/${brianna}`;
query = new URLSearchParams("tab=advanced");
for (const mobile of [false, true]) {
  for (const scope of [null, clone]) {
    const links = renderedLinks(render(undefined, false, scope, mobile));
    const configuration = links.find(link => link.label === "Creator Configuration")!;
    assert.equal(configuration.href, `/clones/${brianna}?tab=identity`);
    assert.match(configuration.attributes, /aria-current="page"/);
    assert.ok(links.some(link => link.href === `/clones/${brianna}?tab=ppvs`));
    assert.ok(!links.some(link => link.href?.startsWith(`/clones/${clone}?`)), "Current profile wins over unrelated scope");
  }
}
pathname = "/clones/new";
query = new URLSearchParams();
assert.equal(renderedLinks(render(undefined, false, clone)).find(link => link.label === "Creator Configuration")!.href, `/clones/${clone}?tab=identity`, "Create-new is not a creator ID");
pathname = "/revenue";
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
console.log("Sidebar: grouped admin navigation, collapsed More, destination coverage and uniqueness; agency/creator layouts preserved on desktop and mobile");



async function checkAdminInteractions() {
  const { JSDOM } = nativeRequire("jsdom");
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://dashboard.example.test" });
  const win = dom.window;
  for (const key of ["window", "document", "HTMLElement", "Event", "MouseEvent", "Node"]) Object.defineProperty(globalThis, key, { value: win[key], configurable: true });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  pathname = "/dashboard"; query = new URLSearchParams();
  const mount = async (key = "first") => { await act(async () => root.render(<Access key={key}><Content activeCloneId={clone} showAssistant={false}/></Access>)); };
  const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(el => el.textContent?.trim() === text)!;
  const click = async (el: HTMLElement) => { assert.ok(el); await act(async () => el.click()); };
  await mount();
  const more = document.getElementById("admin-more-desktop")!;
  assert.equal(more.hidden, true);
  await click(button("More")); assert.equal(more.hidden, false);
  await click(button("More")); assert.equal(more.hidden, true);
  await click(document.querySelector<HTMLButtonElement>("button[aria-label='Expand Creators']")!);
  assert.equal(document.getElementById("admin-nav-creators-desktop")!.hidden, false);
  await click(button("More")); await click(button("Show full navigation"));
  assert.equal(document.querySelector("[data-admin-navigation='grouped']"), null);
  assert.equal(win.localStorage.getItem("twin:admin-full-navigation:v1"), "true");
  await mount("remount");
  assert.equal(document.querySelector("[data-admin-navigation='grouped']"), null, "Layout choice survives remount");
  await click(button("Use grouped navigation"));
  assert.ok(document.querySelector("[data-admin-navigation='grouped']"));
  assert.equal(document.getElementById("admin-more-desktop")!.hidden, true);
  pathname = `/clones/${clone}`; query = new URLSearchParams("tab=advanced");
  await mount("advanced");
  assert.equal(document.getElementById("admin-nav-creators-desktop")!.hidden, false);
  assert.deepEqual(Array.from(document.querySelectorAll("a[aria-current='page']")).map(a => a.textContent?.trim()), ["Creator Configuration"]);
  pathname = "/agency-admin/creator-codes"; query = new URLSearchParams(); await mount("invites");
  assert.deepEqual(Array.from(document.querySelectorAll("a[aria-current='page']")).map(a => a.textContent?.trim()), ["Invitations"]);
  await act(async () => root.unmount()); dom.window.close();
  console.log("Sidebar interactions: More and creator groups, full-layout restore and persistence, active configuration/invitation links passed");
}
checkAdminInteractions().catch(error => { console.error(error); process.exitCode = 1; });
