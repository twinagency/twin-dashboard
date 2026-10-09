import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { creators, fans } from "../components/fans/data";
import * as dashboardModel from "../components/dashboard/model";
import * as fanModel from "../components/fans/model";
import * as money from "../lib/money";

const nativeRequire = createRequire(import.meta.url);
function compile(path: string, imports: Record<string, unknown>) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const result = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", js)((name: string) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (["react", "react/jsx-runtime", "lucide-react"].includes(name)) return nativeRequire(name);
    throw new Error(`Unexpected Dashboard dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}
async function main() {
  const originalFans = JSON.stringify(fans);
  const filters = dashboardModel.parseFilters(new URLSearchParams(), creators);
  assert.equal(filters.creatorId, "briana");
  const all = dashboardModel.buildDashboard(fans, { ...filters, window: "all" });
  assert.equal(all.metrics.usd, 739);
  assert.equal(all.metrics.stars, 5400);
  assert.equal(all.metrics.revenueCents, 80920);
  assert.equal(all.metrics.purchases, 20);
  assert.equal(all.metrics.payingFans, 2, "Ben's four accounts count as one fan");
  assert.equal(all.metrics.accounts, 5);
  assert.equal(all.metrics.linkedFans, 1, "Oliver has only Fanvue");
  assert.deepEqual(all.relationships.find(r => r.fan.name === "Oliver")!.accounts.map(a => a.platform), ["fanvue"]);
  assert.equal(all.platforms.reduce((sum, p) => sum + p.cents, 0), all.metrics.revenueCents);
  assert.equal(all.chart.reduce((sum, p) => sum + p.cents, 0), all.metrics.revenueCents);
  assert.equal(all.content.reduce((sum, p) => sum + p.cents, 0), all.metrics.revenueCents);
  const thirty = dashboardModel.buildDashboard(fans, filters);
  assert.equal(thirty.metrics.revenueCents, 50400);
  assert.equal(thirty.metrics.purchases, 12);
  const week = dashboardModel.buildDashboard(fans, { ...filters, window: "7d" });
  assert.equal(week.metrics.revenueCents, 15330);
  assert.equal(week.metrics.purchases, 4);
  assert.equal(dashboardModel.dayAt("2026-10-02T20:00:00Z"), "2026-10-03", "Report boundaries use Brisbane, not UTC");
  for (const platform of dashboardModel.platformOrder) {
    const d = dashboardModel.buildDashboard(fans, { ...filters, window: "all", platform });
    assert.ok(d.entries.every(p => p.platform === platform && p.fan.creatorId === "briana"));
    assert.equal(d.metrics.revenueCents, all.platforms.find(p => p.platform === platform)!.cents);
    assert.equal(d.chart.reduce((sum, p) => sum + p.cents, 0), d.metrics.revenueCents);
  }
  const invalid = dashboardModel.parseFilters(new URLSearchParams("creator=unknown&platform=unknown&window=custom&from=2026-02-31&to=2029-01-01&day=no&currency=BTC"), creators);
  assert.deepEqual(invalid, filters);
  const oldPeriod = dashboardModel.buildDashboard(fans, { ...filters, window: "custom", from: "2026-08-01", to: "2026-08-04" });
  assert.equal(oldPeriod.metrics.linkedFans, 0, "Future account links cannot appear in an earlier reporting period");
  assert.equal(oldPeriod.metrics.purchases, 1);
  assert.equal(dashboardModel.buildDashboard(fans, { ...filters, window: "all", currency: "AUD" }, 1.4).metrics.revenueCents, 113288);
  for (const creatorId of ["kyla", "riley"]) assert.ok(dashboardModel.buildDashboard(fans, { ...filters, creatorId }).entries.every(p => p.fan.creatorId === creatorId));

  let admin = false, viewAs: unknown = null;
  const Page = compile("app/dashboard/page.tsx", {
    "next/headers": { cookies: async () => ({}) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/internal-admin": { hasInternalAdminAccess: async () => admin },
    "@/lib/view-as": { activeViewAs: async () => viewAs },
    "@/components/dashboard/CreatorDashboard": { __esModule: true, default: () => null },
    "@/components/dashboard/model": dashboardModel,
    "@/components/fans/data": { creators, fans },
  }).default;
  const route = (search: Record<string, string | string[]> = {}) => Page({ searchParams: Promise.resolve(search) });
  await assert.rejects(route(), /redirect:\/twin/);
  admin = true;
  for (const targetType of ["agency", "creator"]) { viewAs = { targetType }; await assert.rejects(route(), /redirect:\/revenue/); }
  viewAs = null;
  assert.equal((await route()).props.initialFilters.creatorId, "briana");
  assert.equal((await route({ platform: "telegram", window: "all" })).props.initialFilters.platform, "telegram");
  assert.equal((await route({ creator: ["kyla", "briana"] })).props.initialFilters.creatorId, "briana");

  // Execute the real component with the existing shell's currency context
  // isolated. Any new network request or global currency mutation is a failure.
  const { JSDOM } = nativeRequire("jsdom");
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://dashboard.test/dashboard" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const fetchBefore = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Dashboard must not call production services"); };
  const css = new Proxy({}, { get: (_, key) => String(key) });
  const Component = compile("components/dashboard/CreatorDashboard.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> },
    "../CurrencyProvider": { useCurrency: () => ({ rate: 1.4, currency: "AUD", setCurrency: () => { throw new Error("The ordinary Overview's currency must stay unchanged"); } }) },
    "../../lib/money": money, "../fans/model": fanModel, "./model": dashboardModel,
    "./CreatorDashboard.module.css": { __esModule: true, default: css },
  }).default;
  const { createRoot } = nativeRequire("react-dom/client");
  let root = createRoot(document.getElementById("root")!);
  const render = async () => act(async () => { root.render(<Component creators={creators} fans={fans} initialFilters={filters} />); });
  const find = (selector: string) => { const element = document.querySelector<HTMLElement>(selector); assert.ok(element, selector); return element; };
  const click = async (selector: string) => act(async () => { find(selector).click(); });
  const textButton = async (text: string, scope = "body") => act(async () => { const button = Array.from(document.querySelectorAll<HTMLButtonElement>(`${scope} button`)).find(b => b.textContent?.trim() === text); assert.ok(button, `Button: ${text}`); button.click(); });
  const input = async (selector: string, value: string) => act(async () => {
    const element = find(selector) as HTMLInputElement;
    const proto = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  const metric = (name: string) => find(`[data-metric="${name}"]`).textContent;
  await render();
  assert.equal(metric("revenue"), "US$504.00");
  assert.equal(metric("purchases"), "12");
  assert.equal(find('[data-creator-dashboard]').getAttribute("data-creator"), "briana");
  assert.equal(document.querySelectorAll(".dayBar").length, 30);
  assert.equal(find('[aria-label="Open Ben\'s fan profile"]').getAttribute("href"), fanModel.profileHref(fans.find(f => f.id === "briana-ben")!));
  assert.equal(find('[aria-label="Open Oliver\'s conversation"]').getAttribute("href"), "/users?relationship=briana-oliver&creator=briana&platform=fanvue");
  await textButton("All time", '[aria-label="Dashboard reporting period"]');
  assert.equal(metric("revenue"), "US$809.20"); assert.equal(metric("purchases"), "20");
  await textButton("Telegram", '[aria-label="Dashboard platform"]');
  assert.equal(metric("revenue"), "US$70.20"); assert.equal(metric("paying"), "1"); assert.equal(metric("purchases"), "3");
  assert.equal(document.querySelector('[data-fan="briana-oliver"]'), null);
  await click('[aria-label="Inspect Coffee break diary purchase by Ben"]');
  assert.match(find('[role="dialog"]').textContent || "", /2,100 Stars/);
  assert.match(find('[role="dialog"]').textContent || "", /US\$27.30/);
  assert.equal(find('[role="dialog"] a[href*="source="]').getAttribute("href"), "/users?relationship=briana-ben&creator=briana&platform=telegram&source=ben-quick-note-0");
  await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await input('[aria-label="Dashboard currency"]', "AUD"); assert.equal(metric("revenue"), "A$98.28");
  assert.equal(localStorage.getItem("currency"), null, "The new page does not write the old Overview's currency preference");
  await textButton("All platforms", '[aria-label="Dashboard platform"]');
  await input('[aria-label="Dashboard currency"]', "USD");
  await click('[aria-label="Inspect linked fans"]');
  assert.equal(document.querySelectorAll('.relationshipTable tbody tr').length, 1);
  assert.ok(document.querySelector('[data-fan="briana-ben"]'));
  await textButton("Custom", '[aria-label="Dashboard reporting period"]');
  await input('[aria-label="Dashboard start date"]', "2026-10-02");
  await input('[aria-label="Dashboard end date"]', "2026-10-02");
  await textButton("Apply dates");
  assert.equal(metric("revenue"), "US$79.00"); assert.equal(metric("purchases"), "1"); assert.equal(metric("repeat"), "0%");
  await click('[aria-label="Inspect repeat buyers"]'); assert.equal(document.querySelectorAll('.relationshipTable tbody tr').length, 0);
  await input('[aria-label="Dashboard start date"]', "2026-10-09"); await input('[aria-label="Dashboard end date"]', "2026-10-01");
  await textButton("Apply dates"); assert.ok(document.querySelector('[role="alert"]')); assert.equal(metric("revenue"), "US$79.00");
  await textButton("30 days", '[aria-label="Dashboard reporting period"]');
  await click('.dayBar[aria-label^="2 Oct 2026:"]');
  assert.equal(new URLSearchParams(window.location.search).get("day"), "2026-10-02");
  assert.equal(document.querySelectorAll('.purchaseTable tbody tr').length, 1);
  assert.match(find('.purchaseTable').textContent || "", /October journal/);
  await textButton("Show full period");
  await input('[aria-label="Search dashboard purchases"]', "Oliver");
  assert.equal(document.querySelectorAll('.purchaseTable tbody tr').length, 5);
  await input('[aria-label="Purchase content type"]', "Photo");
  assert.equal(document.querySelectorAll('.purchaseTable tbody tr').length, 3);
  await input('[aria-label="Search dashboard purchases"]', "does-not-exist");
  assert.match(find('#dashboard-purchases').textContent || "", /No purchases match/);
  await textButton("Clear purchase filters");
  assert.equal(document.querySelectorAll('.purchaseTable tbody tr').length, 8);
  await textButton("Show more purchases"); assert.equal(document.querySelectorAll('.purchaseTable tbody tr').length, 12);
  await click('[aria-label="Inspect October journal content performance"]');
  assert.match(find('[role="dialog"]').textContent || "", /Ben/);
  await click('[aria-label="Open Ben\'s October journal purchase details"]');
  assert.match(find('[role="dialog"]').textContent || "", /Payment statusCompleted/);
  await click('[aria-label="Close details"]');
  await click('[aria-label="Inspect revenue valuation"]');
  assert.match(find('[role="dialog"]').textContent || "", /4,000 Stars/);
  assert.match(find('[role="dialog"]').textContent || "", /US\$452.00/);
  await click('[aria-label="Close details"]');
  await input('[aria-label="Dashboard creator"]', "kyla");
  assert.doesNotMatch(find('[data-creator-dashboard]').textContent || "", /Oliver|Ben|October journal/);
  await input('[aria-label="Dashboard creator"]', "briana");
  await click('[aria-label="Filter dashboard by Fanvue"]');
  const saved = window.location.search;
  await act(async () => { root.unmount(); });
  window.history.replaceState(null, "", "/dashboard");
  root = createRoot(document.getElementById("root")!); await render();
  assert.equal(window.location.search, saved, "Returning through the sidebar restores the Dashboard filter state");
  assert.equal(find('[data-creator-dashboard]').getAttribute("data-platform"), "fanvue");
  assert.equal(JSON.stringify(fans), originalFans, "All existing profile data remains unchanged");
  assert.equal(localStorage.getItem(fanModel.STORAGE_KEY), null, "Dashboard never overwrites relationship memory or messages");
  assert.equal(requests, 0);
  await act(async () => { root.unmount(); });
  globalThis.fetch = fetchBefore; dom.window.close();
  console.log("Creator Dashboard passed: isolated admin route; Brianna default; Brisbane date boundaries; deduplicated fans; reconciled charts, platforms and content; independent currency; period/platform/creator/search filters; chart-day inspection; purchase ownership and source links; dialogs; returning filter state; no production calls or changes to profile data.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
