// Real shared dashboard components with synthetic, local-only API responses.
// No production sessions, accounts, data or authentication bypass are created.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'test-results/creator-workspace');
mkdirSync(out, { recursive: true });

const own = '33333333-3333-4333-8333-333333333333';
const creator = { id: own, name: 'Fixture Creator', color: '#148c6b' };
const expectedNavigation = [
  { label: 'Earnings', href: '/creator' },
  { label: 'Pay Per View', href: '/creator/ppvs' },
  { label: 'Business', href: '/creator/business' },
  { label: 'Info', href: '/creator/info' },
  { label: 'Logs', href: '/creator/logs' },
  { label: 'Edit', href: '/creator/edit' },
];
const stats = { stars: 22000, grossPaymentStars: 22000, sales: 6, newFans: 18, activeUsers: 15, totalFans: 18, reachable24h: 8, messages: 120, buyers: 3, repeatPct: 1 / 3, costUsd: 0, aiCalls: 50, aiErrors: 0 };
const funnel = { fans: 18, buyers: 3, repeat: 1, oneTime: 2, threePlus: 1, nonBuyers: 15, totalPurchases: 6, buyerPct: 1 / 6, repeatPct: 1 / 3, oneTimePct: 2 / 3, avgPurchasesPerBuyer: 2, avgStarsPerBuyer: 22000 / 3, medianStarsPerBuyer: 7000, repeatRevenueShare: .3 };
const source = readFileSync('components/RevenueDashboard.tsx', 'utf8');
const signals = Object.fromEntries([...source.matchAll(/\bf\.([A-Za-z0-9_]+)/g)].map(match => [match[1], 0]));
const byFeature = [
  ['credits', 'Paid messages', 4000, 2],
  ['photo', 'Paid photo', 10000, 2],
  ['video', 'Paid video', 5000, 1],
  ['bundle', 'Bundle', 3000, 1],
  ['tip', 'Tips', 0, 0],
  ['subscription', 'VIP subscription', 0, 0],
  ['media', 'Media (untagged)', 0, 0],
  ['other', 'Other', 0, 0],
].map(([key, label, stars, sales]) => ({ key, label, stars, sales, avgStars: sales ? stars / sales : 0, share: stars / 22000 }));
// Production rollups always include hourly and weekday buckets. Empty arrays
// with positive revenue are an invalid fixture, not a rendering contract.
const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${hour}:00`, stars: hour === 21 ? 22000 : 0, sales: hour === 21 ? 6 : 0 }));
const byDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, dow) => ({ dow, label, stars: dow === 4 ? 22000 : 0, sales: dow === 4 ? 6 : 0 }));
const payload = {
  period: '1M',
  clones: [{ ...creator, slug: 'fixture', stars: 22000 }],
  bucketLabels: ['Sep 8', 'Sep 9', 'Sep 10'],
  series: [{ bucket: 'Sep 8', [own]: 12000 }, { bucket: 'Sep 9', [own]: 6000 }, { bucket: 'Sep 10', [own]: 4000 }],
  recent: [],
  totals: stats,
  perClone: { [own]: stats },
  // A missing wallet balance exposes the contextual Info link. The test checks
  // that a creator stays inside /creator rather than being sent to admin /info.
  balance: null,
  cachedAt: Date.now(),
  ageSeconds: 0,
  stale: false,
  analytics: {
    period: '1M',
    costIncluded: false,
    totals: { revenueStars: 22000, costUsd: 0, profitUsd: 0, sales: 6, fans: 18, buyers: 3 },
    clones: [{ ...creator, revenueStars: 22000, costUsd: 0, profitUsd: 0, sales: 6, margin: 0 }],
    byKind: [],
    byFeature,
    paywallFunnel: { collecting: true, messaged: 15, paywalled: 0, purchased: 0, paidMessageBuyers: 2, paidMessagePurchases: 2, paidMessageStars: 4000, paywallViews: 0, abandoned: 0, paywallPct: 0, purchasePct: 0, overallPct: 0, avgViewsPerFan: 0 },
    buyerConversion: { lifetimeFanProfiles: 18, lifetimeBuyerProfiles: 3, lifetimeBuyerRate: 1 / 6, activeChatters: 15, activeChatBuyers: 3, activeChatBuyerRate: .2, activeBuyerProfiles7d: 3, activeBuyerEngagement7d: 1, purchaseMix: [] },
    conversationFunnel: { ...signals, collecting: true },
    byFlow: [],
    byDay: [],
    byHour,
    byDow,
    byTier: [],
    whaleFans: [],
    topWeeklySpenders: [],
    weeklySpenderSummary: { buyers: 0, stars: 0, purchases: 0, avgStars: 0 },
    funnel,
  },
};

const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {usePathname} from 'next/navigation';
import Shell from './components/CreatorWorkspaceShell';
import Access from './components/DashboardAccessProvider';
import {SidebarContent} from './components/Sidebar';
import Revenue from './components/RevenueDashboard';
import Fix from './components/RevenueTooltipFix';
import Identity from './components/CreatorIdentityEditor';
import Media from './components/CreatorMediaLibrary';
const params=new URLSearchParams(location.search);
const agencyName=params.get('brand')==='LYNQ'?'LYNQ':'Tether';
const creator={id:'${own}',name:'Fixture Creator',color:'#148c6b'};
const labels={'/creator/business':'Business','/creator/info':'Info','/creator/logs':'Logs'};
document.documentElement.dataset.creatorWorkspace='true';
if(agencyName==='LYNQ'){document.documentElement.dataset.brandTheme='lynq-light';document.documentElement.dataset.agency='lynq'}
function AgencyReference(){return <Access agencyName="Tether" canManage={true}><aside data-tether-agency-reference="true" className="dashboard-sidebar flex h-screen w-64 flex-col"><SidebarContent activeCloneId={creator.id} showAssistant={false}/></aside></Access>}
function App(){const p=usePathname();return <Shell agencyName={agencyName} creatorName="Fixture Creator" clones={[creator]} activeCloneId={creator.id} connected={true} allTimeStars={22000}><p className="mb-3 text-xs text-muted">Interface verification · synthetic test data</p>{p==='/creator/edit'?<Identity clone={{name:'Fixture Creator',intake:{fields:{},answers:''}}} revision="fixture-revision"/>:p==='/creator/ppvs'?<Media items={[]}/>:p==='/creator'?<><Fix/><Revenue cloneId={creator.id}/></>:<h2>{labels[p]||'Creator route'}</h2>}</Shell>}
createRoot(document.getElementById('root')).render(params.get('mode')==='agency-reference'?<AgencyReference/>:<App/>);
`;

const navigationMock = `
import {useSyncExternalStore} from 'react';
const subscribe=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};
const snapshot=()=>location.pathname+location.search;
const useLocation=()=>useSyncExternalStore(subscribe,snapshot,snapshot);
export const usePathname=()=>useLocation().split('?')[0];
export const useSearchParams=()=>new URLSearchParams(useLocation().split('?')[1]||'');
const router={refresh(){},push(p){history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'))},replace(p){history.replaceState({},'',p);dispatchEvent(new PopStateEvent('popstate'))}};
export const useRouter=()=>router;
`;
const linkMock = `import React from 'react';export default function Link({children,href,onClick,...props}){const target=String(href);return <a {...props} href={target} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey){e.preventDefault();history.pushState({},'',target);dispatchEvent(new PopStateEvent('popstate'));}}}>{children}</a>}`;
const cloneScopeMock = `export async function setCloneScope(){}`;
const logoutMock = `export async function logout(){}`;
const assistantMock = `import React from 'react';export default function Assistant({variant}){return <div data-testid="twin-assistant" data-variant={variant||''}>AI Assistant</div>}`;

const bundle = await build({
  stdin: { contents: fixture, resolveDir: root, sourcefile: 'creator-ui-fixture.tsx', loader: 'tsx' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  alias: { '@': root },
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'var process={env:{NODE_ENV:"production",NEXT_PUBLIC_REPORT_TIMEZONE:"Australia/Sydney"},browser:true};' },
  plugins: [{
    name: 'local-navigation',
    setup(b) {
      b.onResolve({ filter: /^(next\/link|next\/navigation|@\/app\/actions\/clone-scope|@\/app\/login\/actions)$|(?:^|[\\/])TwinAssistant(?:\.tsx)?$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        loader: 'jsx',
        resolveDir: root,
        contents: args.path.includes('TwinAssistant') ? assistantMock
          : args.path === 'next/link' ? linkMock
          : args.path === 'next/navigation' ? navigationMock
          : args.path.includes('clone-scope') ? cloneScopeMock
          : logoutMock,
      }));
    },
  }],
});
const css = await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";\n@import "./app/creator-workspace.css";', { from: path.join(root, 'creator-verification.css') });
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const requests = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/styles.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css.css); }
  if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].text); }
  if (url.pathname.startsWith('/api/') || url.pathname === '/creator-auth/identity') {
    res.setHeader('Content-Type', 'application/json');
    requests.push({ path: url.pathname, search: url.search, method: req.method });
    if (url.pathname === '/api/dashboard') return res.end(JSON.stringify({ ...payload, period: url.searchParams.get('period') || 'CUSTOM' }));
    if (url.pathname === '/api/fx') return res.end(JSON.stringify({ usd_to_aud: 1.4 }));
    if (url.pathname === '/creator-auth/identity') { req.resume(); return res.end(JSON.stringify({ ok: true })); }
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'No live service in local UI test' }));
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const localBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(localBrowser ? { executablePath: localBrowser } : {}) });
const evidence = [];

async function coreContract(row) {
  await row.waitFor();
  return row.evaluate(element => {
    const canvas = element.querySelector('canvas');
    if (!canvas) throw new Error('Shared core canvas missing');
    const rect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      tagName: element.tagName,
      className: element.className,
      outerHTML: element.outerHTML,
      width: rect.width,
      height: rect.height,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
    };
  });
}

let tetherAgencyCore;
try {
  const reference = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await reference.goto(origin + '/revenue?mode=agency-reference', { waitUntil: 'networkidle' });
  const agencyCoreRow = reference.getByText('AI Intelligence Core', { exact: true }).locator('xpath=../..');
  tetherAgencyCore = await coreContract(agencyCoreRow);
  assert.ok(Math.abs(tetherAgencyCore.canvasWidth - 85.76) < 0.1, 'Tether agency uses the shared 64px × 1.34 rendered core');
  assert.ok(Math.abs(tetherAgencyCore.canvasHeight - 85.76) < 0.1, 'Tether agency core keeps its exact square size');
  await reference.screenshot({ path: path.join(out, 'tether-agency-core-reference.png'), fullPage: true });
  await reference.close();

  for (const brand of ['Tether', 'LYNQ']) for (const width of [390, 1440]) {
    const viewport = width < 1024 ? 'mobile' : 'desktop';
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser runtime error:', error.stack); });
    const prefix = `${brand.toLowerCase()}-creator-${viewport}`;
    try {
      await page.goto(origin + '/creator?brand=' + brand, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: /^Earnings overview/ }).waitFor();
      await page.locator('.recharts-wrapper').first().waitFor();
      await page.locator('[data-creator-workspace-shell="true"]').waitFor();
      await page.locator('.dashboard-topbar').waitFor();
      await page.locator('.dashboard-main').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal document overflow');
      if (brand === 'LYNQ') {
        assert.equal(await page.locator('html').getAttribute('data-brand-theme'), 'lynq-light');
        assert.ok(await page.getByText('LYNQ', { exact: true }).count(), 'Verified LYNQ identity brands the shared creator shell');
        assert.doesNotMatch(await page.locator('body').innerText(), /Twin Technologies/i, 'LYNQ creator workspace does not visibly expose Twin');
        assert.ok(await page.locator('[data-lynq-core="particles"] canvas').count(), 'LYNQ keeps the original particle wordmark');
      }

      const creatorChip = page.getByLabel('Creator account: Fixture Creator', { exact: true });
      assert.equal(await creatorChip.count(), 1, 'Creator identity appears once in the shared top bar');
      assert.equal(await creatorChip.evaluate(element => element.tagName), 'DIV', 'Creator identity is fixed text, not a control');
      assert.equal(await creatorChip.locator('button, [role="button"]').count(), 0, 'Creator identity cannot open the fleet switcher');
      assert.equal(await page.getByText('All creators', { exact: true }).count(), 0, 'Creator cannot see All creators');
      assert.equal(await page.getByTestId('twin-assistant').count(), 0, 'Creator shell suppresses desktop and mobile assistants');

      const infoLink = page.getByRole('link', { name: 'Balance unavailable right now', exact: true });
      assert.equal(await infoLink.getAttribute('href'), '/creator/info', 'Earnings contextual Info link stays in creator scope');
      await infoLink.click();
      await page.getByRole('heading', { name: 'Info', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/creator/info');
      assert.match((await page.locator('.dashboard-topbar h1').textContent()) || '', /Fixture Creator\s*\/\s*Info/);
      await page.goBack({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: /^Earnings overview/ }).waitFor();

      for (const period of ['1W', '1D', '2W', '3M', '6M', '1Y', 'All', '1M']) {
        const responsePromise = page.waitForResponse(response => response.url().includes('/api/dashboard?'));
        await page.getByRole('button', { name: period, exact: true }).click();
        const response = await responsePromise;
        const query = new URL(response.url()).searchParams;
        assert.equal(query.get('period'), period.toUpperCase());
        assert.equal(query.get('clone'), own);
      }

      await page.getByRole('button', { name: 'Custom', exact: true }).click();
      const customDialog = page.getByRole('dialog');
      await customDialog.getByRole('heading', { name: 'Custom date range', exact: true }).waitFor();
      await customDialog.getByLabel('From', { exact: true }).fill('2026-09-01');
      await customDialog.getByLabel('To', { exact: true }).fill('2026-09-10');
      const customResponsePromise = page.waitForResponse(response => response.url().includes('startDate=2026-09-01'));
      await customDialog.getByRole('button', { name: 'Apply', exact: true }).click();
      const customQuery = new URL((await customResponsePromise).url()).searchParams;
      assert.equal(customQuery.get('startDate'), '2026-09-01');
      assert.equal(customQuery.get('endDate'), '2026-09-10');
      assert.equal(customQuery.get('clone'), own);
      await page.getByRole('button', { name: '2026-09-01 → 2026-09-10', exact: true }).waitFor();
      const restoreResponse = page.waitForResponse(response => response.url().includes('period=1M'));
      await page.getByRole('button', { name: '1M', exact: true }).click();
      await restoreResponse;

      const primaryMoney = page.locator('.money-value-primary').first();
      const audValue = await primaryMoney.textContent();
      await page.getByRole('button', { name: '$AUD', exact: true }).click();
      await page.getByRole('button', { name: '$USD', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('currency')), 'USD');
      assert.notEqual(await primaryMoney.textContent(), audValue, 'Shared currency toggle updates creator earnings');
      await page.getByRole('button', { name: '$USD', exact: true }).click();
      await page.getByRole('button', { name: '$AUD', exact: true }).waitFor();

      await page.getByRole('button', { name: 'Line chart', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Line chart', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Bar chart', exact: true }).click();
      const refreshResponse = page.waitForResponse(response => response.url().includes('fresh=force'));
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await refreshResponse;
      const report = page.getByRole('button', { name: /revenue report/i }).first();
      await report.click();
      assert.equal(await report.getAttribute('aria-expanded'), 'true');
      for (const title of ['What sells', 'Who pays', 'Peak hours', 'Peak days', 'Paid-message paywall', 'Buyer breakdown']) {
        await page.getByRole('heading', { name: new RegExp('^' + title, 'i') }).waitFor();
      }
      assert.deepEqual(errors, [], 'Every full report section must render without runtime errors');
      await page.getByRole('heading', { name: /^What sells/i }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, prefix + '-full-report.png'), fullPage: true });
      for (let item = 0; item < 3; item++) {
        await page.getByRole('button', { name: /View purchased items/ }).nth(item).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await dialog.getByRole('heading', { name: /Purchased (photos|videos|bundles)/ }).waitFor();
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
      }
      await page.locator('.dashboard-main').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(out, prefix + '-earnings.png'), fullPage: true });

      if (width < 1024) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.getByRole('dialog', { name: 'Main navigation', exact: true }).waitFor();
      }
      const sidebar = page.locator('aside.dashboard-sidebar:visible');
      await sidebar.waitFor();
      const navigation = sidebar.getByRole('navigation', { name: 'Creator navigation', exact: true });
      const navigationItems = await navigation.locator('a').evaluateAll(links => links.map(link => ({
        label: (link.textContent || '').trim(),
        href: new URL(link.href).pathname,
      })));
      assert.deepEqual(navigationItems, expectedNavigation, 'Creator has exactly the six approved destinations');
      for (const forbiddenLabel of ['All creators', 'Create new creator', 'CRM', 'More', 'Fans', 'Flows', 'Sequences', 'Agency Access', 'API', 'Settings']) {
        assert.equal(await navigation.getByText(forbiddenLabel, { exact: true }).count(), 0, `Creator navigation excludes ${forbiddenLabel}`);
      }

      const coreRow = sidebar.locator('[data-creator-core="hero"] > div');
      const creatorCore = await coreContract(coreRow);
      assert.ok(creatorCore.canvasWidth > 0 && creatorCore.canvasHeight > 0, 'Creator core has a rendered size');
      const canvas = coreRow.locator('canvas');
      const firstFrame = await canvas.evaluate(element => element.toDataURL());
      await page.waitForTimeout(150);
      assert.notEqual(await canvas.evaluate(element => element.toDataURL()), firstFrame, 'Shared intelligence core animates');
      if (brand === 'Tether') {
        assert.equal(creatorCore.canvasWidth, tetherAgencyCore.canvasWidth, 'Creator core has the exact Tether rendered width');
        assert.equal(creatorCore.canvasHeight, tetherAgencyCore.canvasHeight, 'Creator core has the exact Tether rendered height');
        assert.equal(creatorCore.tagName, tetherAgencyCore.tagName);
        assert.equal(creatorCore.className, tetherAgencyCore.className);
        assert.equal(creatorCore.outerHTML, tetherAgencyCore.outerHTML, 'Creator and Tether agency render the exact same shared core markup');
      }
      await page.screenshot({ path: path.join(out, prefix + '-shared-shell.png'), fullPage: true });

      await navigation.getByRole('link', { name: 'Edit', exact: true }).click();
      await page.getByRole('heading', { name: 'Edit identity', exact: true }).waitFor();
      if (width < 1024) await page.getByRole('dialog', { name: 'Main navigation', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.locator('input[name="bot_token"],input[name="starting_credits"],select[name="text_model"]').count(), 0);
      await page.locator('input[name="name"]').fill('Fixture identity updated');
      await page.getByRole('button', { name: 'Save identity', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Identity saved.' }).waitFor();
      await page.locator('.dashboard-main').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(out, prefix + '-identity.png'), fullPage: true });
      assert.deepEqual(errors, []);
      evidence.push({
        brand,
        viewport,
        width,
        sharedSidebar: true,
        sharedMobileMenu: width < 1024,
        sharedTopBar: true,
        sharedMainShell: true,
        fixedCreatorChip: true,
        navigationDestinations: expectedNavigation,
        noAdminNavigation: true,
        noAssistant: true,
        exactTetherCore: brand === 'Tether',
        verifiedLynqBranding: brand === 'LYNQ',
        customDateRange: true,
        currencyToggle: true,
        creatorInfoNavigation: true,
        animatedCore: true,
        sameRevenueComponent: true,
        allPresetPeriods: true,
        refreshFunctional: true,
        fullReportSections: 6,
        purchasedMediaDrilldowns: 3,
        identitySaveFunctional: true,
        settingsLocked: true,
        noRuntimeErrors: true,
        screenshots: {
          shell: path.join(out, prefix + '-shared-shell.png'),
          earnings: path.join(out, prefix + '-earnings.png'),
          report: path.join(out, prefix + '-full-report.png'),
          identity: path.join(out, prefix + '-identity.png'),
        },
      });
    } catch (error) {
      await page.screenshot({ path: path.join(out, prefix + '-failure.png'), fullPage: true });
      writeFileSync(path.join(out, prefix + '-failure.json'), JSON.stringify({ error: String(error), browserErrors: errors, text: await page.locator('body').innerText() }, null, 2));
      throw error;
    } finally {
      await page.close();
    }
  }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log('CREATOR BROWSER CHECKS PASSED', JSON.stringify(evidence));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
