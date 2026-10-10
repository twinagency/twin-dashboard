import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import { creators, fans as sharedFans } from "../components/fans/data";
// Keep the authored Ben/Oliver and existing creators' regression cases stable.
import * as ledger from "../components/fans/brianna-ledger";
const fans = sharedFans.filter(f => !f.id.startsWith("briana-ledger-"));
import * as dashboardModel from "../components/dashboard/model";
import * as fanModel from "../components/fans/model";
import * as money from "../lib/money";
import "./check-dashboard-portrait";
import * as portraits from "../components/dashboard/portraits";
import * as campaignModel from "../components/campaigns/model";
import * as libraryModel from "../components/content-library/model";
import * as inboxModel from "../components/inbox/model";

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
  const sharedSnapshot = JSON.stringify(sharedFans);
  const fullFilters = dashboardModel.parseFilters(new URLSearchParams(), creators);
  const full = dashboardModel.buildDashboard(sharedFans, fullFilters);
  assert.deepEqual(dashboardModel.platformOrder, ["onlyfans","telegram"]);
  assert.equal(dashboardModel.parseFilters(new URLSearchParams("platform=fanvue"),creators).platform,"onlyfans");
  assert.equal(full.metrics.revenueCents, 4_618_600);
  assert.equal(full.metrics.payingFans, 386);
  assert.equal(full.metrics.purchases, 924);
  assert.equal(full.metrics.repeatBuyers, 252);
  assert.equal(full.metrics.linkedFans, 233);
  assert.equal(full.metrics.accounts, 747);
  assert.equal(full.metrics.activeFans, 498);
  const sixMonths = dashboardModel.buildDashboard(sharedFans, { ...fullFilters, window: "6m" });
  assert.equal(sixMonths.range.from, "2026-04-10");
  assert.equal(sixMonths.metrics.revenueCents, 27_500_356);
  assert.equal(sixMonths.metrics.purchases, 5446);
  assert.equal(sixMonths.metrics.payingFans, 501);
  assert.equal(JSON.stringify(ledger.withBriannaLedger(fans)), sharedSnapshot, "Seed reconstruction must reproduce identical IDs, amounts, conversations and memory");
  for (const period of ledger.briannaPeriods) {
    const monthly = dashboardModel.buildDashboard(sharedFans, { ...fullFilters, window: "custom", from: period.from, to: period.to });
    assert.equal(monthly.metrics.revenueCents, period.revenueCents);
    assert.ok(Math.abs(period.revenueCents - 4_618_600) <= 1_000_000);
    for (const currency of ["USD", "AUD"] as const) {
      const total = dashboardModel.buildDashboard(sharedFans, { ...fullFilters, window: "custom", from: period.from, to: period.to, currency }, 1.4);
      for (const parts of [total.chart, total.platforms, total.content, total.relationships]) assert.equal(parts.reduce((s, x) => s + x.cents, 0), total.metrics.revenueCents);
      for (const platform of dashboardModel.platformOrder) {
        const scoped = dashboardModel.buildDashboard(sharedFans, { ...fullFilters, window: "custom", from: period.from, to: period.to, currency, platform }, 1.4);
        assert.equal(scoped.metrics.revenueCents, total.platforms.find(p => p.platform === platform)!.cents);
        assert.equal(scoped.chart.reduce((s, x) => s + x.cents, 0), scoped.metrics.revenueCents);
      }
    }
  }
  const generated = sharedFans.filter(f => f.id.startsWith("briana-ledger-"));
  assert.equal(generated.length, 512);
  for (let index=0;index<generated.length;index++) {
    const formerPrimary=index%20>=10&&index%20<15?"telegram":"onlyfans";
    assert.equal(generated[index].accounts[0].platform,formerPrimary,"Telegram-primary relationships stay on Telegram; USD channels consolidate into OnlyFans");
  }
  assert.equal(new Set(generated.map(f => f.name)).size, 512);
  const ids = generated.flatMap(f => [...f.messages, ...f.memories, ...f.purchases, ...f.history!, ...f.notes!].map(x => x.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const fan of generated) {
    assert.ok(fan.memories.length >= 20);
    assert.equal(new Set(fan.memories.map(m => m.category)).size, 6);
    assert.equal(new Set(fan.purchases.map(p => p.title)).size, fan.purchases.length, "No duplicate owned content across platforms");
    const sourceById = new Map(fan.messages.map(m => [m.id, m]));
    for (const message of fan.messages) {
      const account = fan.accounts.find(a => a.platform === message.platform)!;
      assert.ok(account && message.at >= account.linkedAt && account.linkedAt >= fan.firstSeen);
      assert.ok(message.at <= "2026-10-09T09:00:00Z");
    }
    for (const item of [...fan.memories, ...fan.purchases, ...fan.history!]) {
      const source = sourceById.get(item.sourceMessageId!);
      assert.ok(source, `${item.id}: source belongs to this fan`);
      assert.equal(source.platform, "source" in item ? item.source : item.platform);
      assert.equal(source.at, "updatedAt" in item ? item.updatedAt : item.at);
      if ("amount" in item) {
        assert.ok(item.amount > 0);
        assert.ok(source.text.includes(item.title));
        const amount = item.amount.toLocaleString("en-US", item.currency === "USD" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);
        assert.ok(source.text.includes(amount), `${item.id}: amount agrees with the source`);
        assert.equal(item.currency, item.platform === "telegram" ? "Stars" : "USD");
      }
    }
    for (const account of fan.accounts) assert.ok(fan.suggestedReplies?.[account.platform]);
  }
  const originalFans = JSON.stringify(fans);
  const filters = dashboardModel.parseFilters(new URLSearchParams(), creators);
  assert.equal(filters.creatorId, "briana");
  const all = dashboardModel.buildDashboard(fans, { ...filters, window: "all" });
  assert.equal(all.metrics.usd, 739);
  assert.equal(all.metrics.stars, 5400);
  assert.equal(all.metrics.revenueCents, 80920);
  assert.equal(all.metrics.purchases, 20);
  assert.equal(all.metrics.payingFans, 2, "Ben's two accounts count as one fan");
  assert.equal(all.metrics.accounts, 3);
  assert.equal(all.metrics.linkedFans, 1, "Oliver has only OnlyFans");
  assert.deepEqual(all.relationships.find(r => r.fan.name === "Oliver")!.accounts.map(a => a.platform), ["onlyfans"]);
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
    "@/components/fans/data": { creators, fans, authoredFans: fans },
  }).default;
  const route = (search: Record<string, string | string[]> = {}) => Page({ searchParams: Promise.resolve(search) });
  await assert.rejects(route(), /redirect:\/twin/);
  admin = true;
  for (const targetType of ["agency", "creator"]) { viewAs = { targetType }; await assert.rejects(route(), /redirect:\/revenue/); }
  viewAs = null;
  assert.equal((await route()).props.initialFilters.creatorId, "briana");
  assert.equal((await route({ platform: "telegram", window: "all" })).props.initialFilters.platform, "telegram");
  assert.equal((await route({ creator: ["kyla", "briana"] })).props.initialFilters.creatorId, "briana");

  let headerPath = "/users", headerParams = new URLSearchParams("relationship=briana-ledger-1");
  const headerAudience = { isAgency: false, isCreator: false, agencyName: "" };
  const Header = compile("components/TopBar.tsx", {
    "./DashboardAccessProvider": { useDashboardAccess: () => headerAudience },
    "next/navigation": { usePathname: () => headerPath, useSearchParams: () => headerParams },
    "@/components/CloneSwitcher": { __esModule: true, default: () => <span>Live creator selector</span> },
    "@/components/CurrencyToggle": { __esModule: true, default: () => <span>Live currency selector</span> },
    "@/components/CurrencyProvider": { useCurrency: () => ({ currency: "USD", rate: 1.4, usdPerStar: .013 }) },
    "@/components/BlurToggle": { __esModule: true, default: () => <span>Blur media</span> },
    "@/app/login/actions": { logout: async () => {} },
    "@/lib/money": { fmtMoney: () => "LIVE_BALANCE", starsToMoneyRate: () => 1 },
    "@/lib/page-meta": { getPageMeta: () => ({ scopeLabel: "Brianna Redd", pageLabel: "Earnings", scopeIsCreator: true }) },
    "@/lib/creator-dashboard-policy": { CREATOR_DASHBOARD_NAV: [] },
  }).default;
  const { renderToStaticMarkup } = nativeRequire("react-dom/server");
  const header = () => renderToStaticMarkup(<Header clones={[]} activeCloneId={null} allTimeStars={100} />);
  assert.match(header(), /Live Telegram Window/);
  assert.doesNotMatch(header(), /LIVE_BALANCE|Live creator selector|Live currency selector/);
  headerParams = new URLSearchParams(); assert.match(header(), /LIVE_BALANCE/);
  headerPath = "/revenue"; assert.match(header(), /LIVE_BALANCE/);
  headerPath = "/users"; headerParams = new URLSearchParams("relationship=briana-ledger-1");
  headerAudience.isAgency = true; assert.match(header(), /LIVE_BALANCE/);
  headerAudience.isAgency = false; headerAudience.isCreator = true; assert.match(header(), /LIVE_BALANCE/);

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
  const Campaign = compile("components/dashboard/DashboardCampaign.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> },
    "../content-library/model": libraryModel, "../inbox/model": inboxModel, "../campaigns/model": campaignModel,
    "../fans/model": fanModel, "./portraits": portraits,
    "./CreatorDashboard.module.css": { __esModule: true, default: css },
  }).default;
  const Component = compile("components/dashboard/CreatorDashboard.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> },
    "../fans/brianna-ledger": ledger,
    "../BlurToggle": { __esModule: true, default: () => <button aria-label="Blur all media">Blur</button> },
    "./DashboardCampaign": { __esModule: true, default: Campaign }, "./portraits": portraits,
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
  assert.equal(document.querySelectorAll('.summaryCard').length, 4);
  assert.equal(find('.heroPhoto').getAttribute('src'), '/api/dashboard/portrait?image=outdoor');
  assert.equal(document.querySelectorAll('.libraryTile').length, 3);
  assert.ok(find('.campaignButton').getAttribute('href')!.includes('briana-weekend-release'));
  assert.equal(localStorage.getItem(campaignModel.CAMPAIGN_STORAGE), null, 'Dashboard cannot start or update a campaign');
  assert.equal(find('[data-creator-dashboard]').getAttribute("data-creator"), "briana");
  assert.equal(document.querySelectorAll(".dayBar").length, 30);
  assert.equal(find('[aria-label="Open Ben\'s fan profile"]').getAttribute("href"), fanModel.profileHref(fans.find(f => f.id === "briana-ben")!));
  assert.equal(find('[aria-label="Open Oliver\'s conversation"]').getAttribute("href"), "/users?relationship=briana-oliver&creator=briana&platform=onlyfans");
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
  await click('[aria-label="Dashboard platform"] button[aria-label="All platforms"]');
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
  await click('[aria-label="Filter dashboard by OnlyFans"]');
  const saved = window.location.search;
  await act(async () => { root.unmount(); });
  window.history.replaceState(null, "", "/dashboard");
  root = createRoot(document.getElementById("root")!); await render();
  assert.equal(window.location.search, saved, "Returning through the sidebar restores the Dashboard filter state");
  assert.equal(find('[data-creator-dashboard]').getAttribute("data-platform"), "onlyfans");
  assert.equal(JSON.stringify(fans), originalFans, "All existing profile data remains unchanged");
  assert.equal(localStorage.getItem(fanModel.STORAGE_KEY), null, "Dashboard never overwrites relationship memory or messages");
  assert.equal(requests, 0);
  await act(async () => { root.unmount(); });
  window.history.replaceState(null, "", "/dashboard"); localStorage.removeItem(dashboardModel.FILTER_STORAGE_KEY);
  root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<Component creators={creators} fans={fans} includeBriannaLedger initialFilters={filters} />));
  assert.equal(metric("revenue"), "US$46,186.00");
  assert.equal(metric("purchases"), "924");
  assert.equal(document.querySelectorAll('.relationshipTable tbody tr').length, 12);
  await textButton("Show more fans"); assert.equal(document.querySelectorAll('.relationshipTable tbody tr').length, 24);
  await input('[aria-label="Search dashboard fans"]', "Ben");
  assert.ok(document.querySelector('[data-fan="briana-ben"]'));
  await input('[aria-label="Search dashboard fans"]', "ben_coast_tg");
  assert.equal(document.querySelectorAll('.relationshipTable tbody tr').length, 1);
  await textButton("6 months", '[aria-label="Dashboard reporting period"]');
  assert.equal(metric("revenue"), "US$275,003.56");
  assert.equal(document.querySelectorAll('.dayBar').length, 183);
  await input('[aria-label="Search dashboard purchases"]', generated[0].name);
  const purchase = generated[0].purchases.at(-1)!;
  await input('[aria-label="Search dashboard purchases"]', `${purchase.title} ${generated[0].name}`);
  await click(`[aria-label="Inspect ${purchase.title} purchase by ${generated[0].name}"]`);
  assert.ok(find('[role="dialog"] a[href*="relationship="]').getAttribute("href")!.includes(purchase.sourceMessageId!));
  await click('[aria-label="Close details"]');
  assert.equal(JSON.stringify(sharedFans), sharedSnapshot, "Expanded records remain read-only");
  assert.equal(requests, 0);
  await act(async () => { root.unmount(); });
  globalThis.fetch = fetchBefore; dom.window.close();
  console.log("Creator Dashboard passed: isolated admin route; Brianna default; Brisbane date boundaries; deduplicated fans; reconciled charts, platforms and content; independent currency; period/platform/creator/search filters; chart-day inspection; purchase ownership and source links; dialogs; returning filter state; no production calls or changes to profile data.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
