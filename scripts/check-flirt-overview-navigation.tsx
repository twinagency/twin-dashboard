import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const native = createRequire(import.meta.url);
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const creators = ids.map((id, index) => ({ id, name: index ? 'Fixture Creator' : 'Mrs Callace', color: '#cc0055' }));
let access: any = { id: 'agency:fixture', name: 'FLIRT', cloneIds: ids };
let audience = { isAgency: true, isCreator: false, agencyName: 'FLIRT' };
let savedId: string | null = ids[0];
let url = new URL('https://example.test/revenue');
let requestHeaders = new Headers({ 'x-pathname': '/revenue' });
const pushes: string[] = [];
const selections: (string | null)[] = [];
let refreshes = 0;
let denySwitch = false;
const router = { push: (next: string) => { pushes.push(next); url = new URL(next, url); }, refresh: () => { refreshes++; } };
const presentation = (id: string) => ({ id, name: creators.find(c => c.id === id)!.name, avatar: null, hero: null, library: [] });
const agency = { creators: creators.map(c => ({ ...c, totalFans: 10, portrait: null, cardPhoto: null, heroPhoto: null })), audience: { total: 20 } };
const css = new Proxy({}, { get: (_, key) => String(key) });
const dialogOpen = React.createContext(false);
const modules = new Map<string, any>();
function compile(path: string): any {
  path = resolve(path);
  if (modules.has(path)) return modules.get(path);
  const source = readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} as any };
  modules.set(path, mod.exports);
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: css };
    if (name === 'next/headers') return { cookies: async () => ({ get: () => savedId ? { value: savedId } : undefined }), headers: async () => requestHeaders };
    if (name.endsWith('dashboard-access')) return { getDashboardAccess: async () => access };
    if (name.endsWith('query-cache')) return { cloneExists: async (id: string) => ids.includes(id), getFleetClones: async () => creators };
    if (name.endsWith('creator-overview')) return { getCreatorOverview: async (id: string) => presentation(id), getOverviewAudience: async () => ({ total: 10 }) };
    if (name.endsWith('agency-overview')) return { getAgencyOverview: async () => agency };
    if (name === 'next/navigation') return { usePathname: () => url.pathname, useSearchParams: () => url.searchParams, useRouter: () => router };
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }: any) => <a {...props}>{children}</a> };
    if (name.endsWith('DashboardAccessProvider')) return { useDashboardAccess: () => audience };
    if (name.endsWith('CurrencyProvider')) return { useCurrency: () => ({ currency: 'AUD', rate: 1, setCurrency: () => undefined }) };
    if (name.endsWith('BlurToggle')) return { __esModule: true, default: () => <button>Blur</button> };
    if (name.endsWith('CurrencyToggle')) return { __esModule: true, default: () => <button>AUD</button> };
    if (name.endsWith('RevenueDashboard') || name.endsWith('RevenueTooltipFix')) return { __esModule: true, default: () => <div>Legacy revenue</div> };
    if (name.endsWith('RankingPanel')) return { __esModule: true, default: () => <div>Rankings</div> };
    if (name.endsWith('PlatformMark')) return { __esModule: true, default: () => <svg /> };
    if (name.endsWith('clone-switcher-bus')) return { onOpenCloneSwitcher: () => () => undefined };
    if (name === '@/app/actions/clone-scope') return { setCloneScope: async (id: string | null) => { savedId = id; selections.push(id); } };
    if (name === '@/app/login/actions') return { logout: () => undefined };
    if (name === '@/lib/colors') return { initials: (value: string) => value.split(' ').map(x => x[0]).join('') };
    if (name === '@/lib/money') return { fmtMoney: (value: number) => `A$${value.toFixed(2)}`, starsToMoneyRate: (value: number) => value };
    if (name === '@/lib/revenue-trend') return { intraPeriodTrendPct: () => null };
    if (name === '@/lib/page-meta') return { getPageMeta: (_: string, clones: any[], id: string | null) => ({ scopeLabel: clones.find(c => c.id === id)?.name || 'All creators', scopeIsCreator: !!id, pageLabel: 'Overview' }) };
    if (name === '@/lib/creator-dashboard-policy') return { CREATOR_DASHBOARD_NAV: [] };
    if (name === '@/components/ui/dialog') return {
      Dialog: ({ open, children }: any) => <dialogOpen.Provider value={open}>{children}</dialogOpen.Provider>,
      DialogContent: ({ children }: any) => React.useContext(dialogOpen) ? <div role="dialog">{children}</div> : null,
      DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    };
    if (name === '@/components/ui/input') return { Input: React.forwardRef<HTMLInputElement, any>((props, ref) => <input {...props} ref={ref} />) };
    if (!name.startsWith('.') && !name.startsWith('@/')) return native(name);
    const base = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(path), name);
    const dependency = [base, base + '.tsx', base + '.ts'].find(existsSync);
    if (!dependency) throw new Error(`Missing navigation dependency: ${name}`);
    return compile(dependency);
  }, mod, mod.exports);
  return mod.exports;
}

async function main() {
  const { getCloneScope } = compile('lib/clone-scope.ts');
  const RevenuePage = compile('app/revenue/page.tsx').default;
  const header = compile('lib/flirt-overview-routing.ts').FLIRT_OVERVIEW_SCOPE_HEADER;
  assert.equal(await getCloneScope(), null, 'A saved creator cookie must not replace the FLIRT homepage');
  assert.match(renderToStaticMarkup(await RevenuePage()), /data-creator-overview="all"/);
  requestHeaders.set(header, ids[1]);
  assert.equal(await getCloneScope(), ids[1], 'An explicit Overview selection wins over an old creator cookie');
  assert.match(renderToStaticMarkup(await RevenuePage()), new RegExp(`data-creator-overview="${ids[1]}"`));
  requestHeaders.set(header, '33333333-3333-4333-8333-333333333333');
  assert.equal(await getCloneScope(), null, 'An unassigned Overview selection cannot read another creator');
  requestHeaders.delete(header);
  access = { ...access, cloneIds: [ids[0]] };
  assert.equal(await getCloneScope(), null, 'All creators remains the homepage even with one assigned creator');
  access = { ...access, id: 'creator:fixture' };
  assert.equal(await getCloneScope(), ids[0], 'Creator accounts keep their fixed private scope');
  access = { id: 'agency:fixture', name: 'Moxy', cloneIds: ids };
  assert.equal(await getCloneScope(), ids[0], 'Other agencies retain existing selection behavior');
  access = { ...access, name: 'FLIRT' };
  requestHeaders.set('x-pathname', '/flows');
  assert.equal(await getCloneScope(), ids[0], 'Other operator pages retain their workspace selection');
  requestHeaders.set('x-pathname', '/revenue');

  const { JSDOM } = native('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: url.href, pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  globalThis.fetch = async (input, options) => {
    if (String(input) === '/agency/clone-scope') {
      if (denySwitch) return new Response('{}', { status: 403 });
      savedId = JSON.parse(String(options?.body)).clone;
      selections.push(savedId);
      return new Response('{}');
    }
    if (!String(input).startsWith('/api/dashboard?')) throw new Error(`Unexpected network request: ${input}`);
    return new Response(JSON.stringify({ totals: { stars: 0, sales: 0 }, perClone: Object.fromEntries(ids.map(id => [id, { stars: 0, sales: 0 }])), series: [], recent: [], bucketLabels: [] }));
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const Overview = compile('components/overview/CreatorOverview.tsx').default;
  const TopBar = compile('components/TopBar.tsx').default;
  await act(async () => root.render(<Overview initialPresentation={presentation(ids[0])} initialAudience={{ total: 10 }} creators={creators} />));
  const back = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'All creators overview')!;
  assert.ok(back, 'Every individual Overview exposes a visible return to All creators');
  await act(async () => back.click());
  assert.equal(selections.at(-1), null);
  assert.equal(pushes.at(-1), '/revenue');
  assert.equal(back.disabled, false, 'The return button recovers after switching');
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Overview creator"]')!;
    select.value = ids[1]; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(pushes.at(-1), '/revenue?clone=' + ids[1]);
  const beforeDenied = pushes.length;
  denySwitch = true;
  await act(async () => back.click());
  assert.equal(pushes.length, beforeDenied, 'A rejected switch does not navigate');
  assert.match(document.querySelector('[role="alert"]')!.textContent!, /Could not switch creator/);
  assert.equal(back.disabled, false);
  denySwitch = false;
  await act(async () => root.render(null));
  url = new URL('https://example.test/revenue');
  const beforeRefresh = refreshes;
  await act(async () => root.render(<TopBar clones={creators} activeCloneId={ids[0]} allTimeStars={999} />));
  assert.equal(document.querySelector('button[aria-label="Switch creator"]')!.textContent!.replace(/\s/g, ''), 'ALLAllcreators');
  assert.doesNotMatch(document.body.textContent!, /A\$999/);
  assert.ok(refreshes > beforeRefresh, 'Returning home refreshes a retained layout and its stale totals');
  await act(async () => (document.querySelector('button[aria-label="Switch creator"]') as HTMLButtonElement).click());
  const card = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(button => button.textContent?.includes('Mrs Callace'))!;
  await act(async () => card.click());
  assert.equal(selections.at(-1), ids[0]);
  assert.equal(pushes.at(-1), '/revenue?clone=' + ids[0], 'The shared header selector opens the explicit individual Overview');
  await act(async () => root.render(<TopBar clones={creators} activeCloneId={ids[0]} allTimeStars={999} />));
  assert.match(document.querySelector('button[aria-label="Switch creator"]')!.textContent!, /Mrs Callace/);
  assert.match(document.body.textContent!, /A\$999/);
  await act(async () => (document.querySelector('button[aria-label="Switch creator"]') as HTMLButtonElement).click());
  const all = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(button => button.textContent?.endsWith('All creators'))!;
  await act(async () => all.click());
  assert.equal(pushes.at(-1), '/revenue');
  assert.equal(selections.at(-1), null);
  await act(async () => root.render(null));
  audience = { isAgency: false, isCreator: true, agencyName: 'FLIRT' };
  await act(async () => root.render(<TopBar clones={creators} activeCloneId={ids[0]} allTimeStars={999} />));
  assert.equal(document.querySelector('button[aria-label="Switch creator"]'), null, 'Creator accounts cannot open the fleet picker');
  await act(async () => root.unmount());
  dom.window.close();
  console.log('PASS: default All creators with a stale cookie, explicit assigned Overviews, both selectors, return navigation, denied switches, retained layouts/totals and private creator scope.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
