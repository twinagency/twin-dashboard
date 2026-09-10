import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CreatorReportError, creatorReportingScope, parseCreatorReportQuery, projectCreatorReport,
  readableCreatorAccount, validRevenueShare, creatorTransactionsCsv,
  type CreatorReportIdentity,
} from '../lib/creator-report-contract';
import { handleCreatorReportRequest } from '../lib/creator-report-controller';
import type { CachedRevenue } from '../lib/revenue-cache';

let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '44444444-4444-4444-8444-444444444444';
const identity: CreatorReportIdentity = { accountId: ACCOUNT, userId: USER, displayName: 'Fixture Creator',
  accountStatus: 'applicant', cloneId: A, cloneName: 'Fixture Clone', revenueSharePercent: 70, onboardingComplete: true };
function fixture(): CachedRevenue {
  return {
    cachedAt: 1700000000000, ageSeconds: 4, stale: false,
    dashboard: {
      period: '1M', clones: [{ id: A, slug: 'fixture', name: 'Fixture Clone', color: '#138a63', stars: 900 }],
      bucketLabels: ['Sep 1'], series: [{ bucket: 'Sep 1', [A]: 900 }],
      totals: { stars: 999999999, costUsd: 789, secret: 'FLEET_TOTAL_SECRET' },
      perClone: { [A]: { stars: 900, grossPaymentStars: 1000, sales: 2, buyers: 1, newFans: 7,
        activeUsers: 10, totalFans: 100, reachable24h: 3, messages: 40, repeatPct: 100,
        costUsd: 123, aiCalls: 400, aiErrors: 7, secret: 'PRIVATE_CLONE_SECRET' } },
      recent: [{ cloneId: A, cloneName: 'Fixture Clone', buyerName: 'Fixture Fan', username: 'PRIVATE_USERNAME',
        telegramId: 12345678, stars: 900, kind: 'photo', paidAt: '2026-09-01T10:00:00Z',
        mediaUrl: 'https://private.invalid/signed-secret', secret: 'PRIVATE_TRANSACTION_SECRET' }],
    },
    analytics: {
      period: '1M', costIncluded: true,
      totals: { revenueStars: 900, costUsd: 555, profitUsd: 12, secret: 'PRIVATE_COST_SECRET' },
      clones: [{ id: A, margin: .7, costUsd: 123, profitUsd: 456 }],
      byFeature: [{ key: 'photo', label: 'Photos', stars: 1000, sales: 2, avgStars: 500, share: 1, secret: 'PRIVATE_FEATURE_SECRET' }, { key: 'refund', label: 'Refunds', stars: -100, sales: 0, avgStars: 0, share: -0.1 }],
      byDow: [{ label: 'Tue', stars: 900, secret: 'PRIVATE_DAY_SECRET' }], byHour: [{ label: '8pm', stars: 900 }],
      buyerConversion: { activeChatters: 10, activeChatBuyers: 1, activeChatBuyerRate: .1,
        lifetimeFanProfiles: 100, lifetimeBuyerProfiles: 20, lifetimeBuyerRate: .2, secret: 'PRIVATE_CONVERSION_SECRET' },
      byFlow: [{ secret: 'PRIVATE_FLOW_SECRET' }], secret: 'PRIVATE_ANALYTICS_SECRET',
    },
  } as unknown as CachedRevenue;
}

check('query defaults are finite and read-only', () => assert.deepEqual(parseCreatorReportQuery(new URLSearchParams()), { period: '1M', format: 'json' }));
for (const key of ['clone', 'cloneId', 'accountId', 'creator_account_id', 'agency', 'fresh', 'access_token']) {
  check(`rejects client scope/control parameter ${key}`, () => assert.throws(() => parseCreatorReportQuery(new URLSearchParams({ [key]: B })), CreatorReportError));
}
check('rejects duplicate parameters', () => assert.throws(() => parseCreatorReportQuery(new URLSearchParams('period=1D&period=ALL')), CreatorReportError));
check('rejects malformed period', () => assert.throws(() => parseCreatorReportQuery(new URLSearchParams('period=unknown')), CreatorReportError));
check('rejects unsupported format', () => assert.throws(() => parseCreatorReportQuery(new URLSearchParams('format=html')), CreatorReportError));
check('accepts valid custom range and CSV', () => assert.deepEqual(parseCreatorReportQuery(new URLSearchParams('startDate=2026-09-01&endDate=2026-09-10&format=csv')), { period: 'CUSTOM', startDate: '2026-09-01', endDate: '2026-09-10', format: 'csv' }));
for (const query of ['startDate=2026-02-30&endDate=2026-03-01', 'startDate=2026-01-01', 'startDate=2026-09-10&endDate=2026-09-01', 'startDate=2020-01-01&endDate=2026-09-01', 'period=ALL&startDate=2026-09-01&endDate=2026-09-10']) {
  check(`rejects invalid or ambiguous date range ${query}`, () => assert.throws(() => parseCreatorReportQuery(new URLSearchParams(query)), CreatorReportError));
}
check('creator scope contains exactly one authoritative clone', () => assert.deepEqual(creatorReportingScope(identity).cloneIds, [A]));
check('cache identity is namespaced by creator account', () => assert.equal(creatorReportingScope(identity).id, `creator:${ACCOUNT}`));
check('another account has another cache scope', () => assert.notEqual(creatorReportingScope({ ...identity, accountId: B }).id, creatorReportingScope(identity).id));
check('relinking changes the clone scope', () => assert.deepEqual(creatorReportingScope({ ...identity, cloneId: B }).cloneIds, [B]));
for (const cloneId of [null, '', 'all', `eq.${B}`]) check(`no empty/fleet/invalid scope ${cloneId}`, () => assert.throws(() => creatorReportingScope({ ...identity, cloneId }), CreatorReportError));
for (const status of ['archived', 'rejected', 'admin', '']) check(`denies status ${status}`, () => assert.equal(readableCreatorAccount(status), false));
check('applicant imports and paused history remain readable', () => { assert.equal(readableCreatorAccount('applicant'), true); assert.equal(readableCreatorAccount('paused'), true); });
check('missing or invalid share is not guessed', () => { for (const value of [null, undefined, '', ' ', 'not-a-number', -1, 101, NaN, true, {}]) assert.equal(validRevenueShare(value), null); });
check('zero and numeric-string shares are valid', () => { assert.equal(validRevenueShare(0), 0); assert.equal(validRevenueShare('75'), 75); });
const report = projectCreatorReport(fixture(), identity);
check('uses own clone, never fleet totals', () => assert.equal(report.metrics.revenueStars, 900));
check('earnings are configured share of signed net receipts', () => assert.equal(report.metrics.estimatedEarningsStars, 630));
check('missing earnings share stays null', () => assert.equal(projectCreatorReport(fixture(), { ...identity, revenueSharePercent: null }).metrics.estimatedEarningsStars, null));
check('average order uses positive receipts rather than net revenue', () => assert.equal(report.metrics.averageOrderStars, 500));
check('refunds stay negative and have no invented order average', () => { assert.equal(report.byFeature[1].stars, -100); assert.equal(report.byFeature[1].averageStars, null); });
check('conversion ratios retain source units', () => assert.equal(report.conversion.activeChatBuyerRate, .1));
check('unknown denominator remains unavailable', () => { const raw = fixture(); raw.analytics.buyerConversion.activeChatBuyerRate = null; assert.equal(projectCreatorReport(raw, identity).conversion.activeChatBuyerRate, null); });
check('strict allowlist withholds internal and future fields', () => {
  const json = JSON.stringify(report);
  for (const forbidden of ['PRIVATE_', 'FLEET_TOTAL_SECRET', 'telegramId', 'username', 'mediaUrl', 'costUsd', 'profitUsd', 'margin', 'aiCalls', 'aiErrors', 'secret']) assert.ok(!json.includes(forbidden), forbidden);
});
const contamination: [string, (raw: CachedRevenue) => void][] = [
  ['dashboard clone', r => r.dashboard.clones.push({ ...r.dashboard.clones[0], id: B })],
  ['analytics clone', r => r.analytics.clones.push({ ...r.analytics.clones[0], id: B })],
  ['per-clone stats', r => { r.dashboard.perClone[B] = r.dashboard.perClone[A]; }],
  ['transaction', r => { r.dashboard.recent[0].cloneId = B; }],
  ['chart key', r => { r.dashboard.series[0][B] = 800; }],
];
for (const [name, alter] of contamination) check(`fails closed on contaminated ${name}`, () => { const raw = fixture(); alter(raw); assert.throws(() => projectCreatorReport(raw, identity), CreatorReportError); });
check('missing metrics are not rendered as zero earnings', () => { const raw = fixture(); delete raw.dashboard.perClone[A]; assert.throws(() => projectCreatorReport(raw, identity), CreatorReportError); });
check('non-finite financial data is rejected', () => { const raw = fixture(); raw.dashboard.perClone[A].stars = NaN; assert.throws(() => projectCreatorReport(raw, identity), CreatorReportError); });
check('exports are bounded to 100 rows', () => { const raw = fixture(); raw.dashboard.recent = Array.from({ length: 150 }, () => raw.dashboard.recent[0]); assert.equal(projectCreatorReport(raw, identity).transactions.length, 100); });
check('CSV quotes commas/quotes and prevents formula injection', () => {
  const copy = structuredClone(report); copy.transactions[0].buyerName = '=HYPERLINK("evil","click")';
  const csv = creatorTransactionsCsv(copy); assert.ok(csv.includes('"\'=HYPERLINK(""evil"",""click"")"'));
  copy.transactions[0].buyerName = '  @SUM(1,2)'; assert.ok(creatorTransactionsCsv(copy).includes("'  @SUM"));
});

async function runHttpChecks() {
  let loads = 0;
  const authorize = async () => identity;
  const load = async () => { loads++; return { state: 'ready' as const, report }; };
  const request = (query = '', method = 'GET') => new Request(`https://fixture.invalid/creator/report-data${query}`, { method });
  const denied = await handleCreatorReportRequest(request(), async () => { throw new CreatorReportError(401, 'Sign in'); }, load);
  check('unauthenticated read fails before loading any data', () => { assert.equal(denied.status, 401); assert.equal(loads, 0); });
  const bad = await handleCreatorReportRequest(request(`?clone=${B}`), authorize, load);
  check('forged clone parameter never reaches reporting engine', () => { assert.equal(bad.status, 400); assert.equal(loads, 0); });
  const post = await handleCreatorReportRequest(request('', 'POST'), authorize, load);
  check('write requests are denied before loading', () => { assert.equal(post.status, 405); assert.equal(loads, 0); });
  const success = await handleCreatorReportRequest(request(), authorize, load);
  check('successful response forbids browser/shared caching', () => { assert.equal(success.status, 200); assert.match(success.headers.get('cache-control')!, /private, no-store/); assert.equal(success.headers.get('vary'), 'Cookie'); });
  const payload = await success.json();
  check('response is the allowlisted contract only', () => assert.equal(payload.report.metrics.revenueStars, 900));
  const broken = await handleCreatorReportRequest(request(), authorize, async () => { throw new Error('PRIVATE_SERVICE_KEY'); });
  check('internal error details do not reach the browser', () => assert.equal(broken.status, 503));
  check('error body omits internal secret', () => assert.ok(broken.headers.get('cache-control')?.includes('no-store')));
  assert.ok(!(await broken.text()).includes('PRIVATE_SERVICE_KEY'));
  const waiting = await handleCreatorReportRequest(request(), authorize, async () => ({ state: 'awaiting_connection', report: null }));
  const waitingBody = await waiting.json();
  check('unlinked state is explicit and has no invented metrics', () => assert.deepEqual(waitingBody, { state: 'awaiting_connection', report: null }));
  const noExport = await handleCreatorReportRequest(request('?format=csv'), authorize, async () => ({ state: 'awaiting_connection', report: null }));
  check('unlinked export fails clearly', () => assert.equal(noExport.status, 409));
  const csv = await handleCreatorReportRequest(request('?format=csv'), authorize, load);
  check('CSV uses the same authorization and private headers', () => { assert.match(csv.headers.get('content-disposition')!, /attachment/); assert.match(csv.headers.get('content-type')!, /text\/csv/); assert.equal(loads, 2); });
  const head = await handleCreatorReportRequest(request('', 'HEAD'), authorize, load);
  check('HEAD exposes no response body', () => assert.equal(head.status, 200)); assert.equal(await head.text(), '');
  // Source integration checks supplement behavioral tests; they are not a
  // substitute for staging auth/SQL/RPC and browser checks before rollout.
  const server = readFileSync('lib/creator-reporting.ts', 'utf8');
  const layout = readFileSync('app/layout.tsx', 'utf8');
  const ui = readFileSync('components/CreatorLinkEarningsDashboard.jsx', 'utf8');
  check('bootstrap binds account to authenticated user', () => { assert.ok(server.includes(".eq('id', session.accountId).eq('auth_user_id', session.userId)")); });
  check('shared reporting runs inside the restricted scope', () => assert.ok(server.includes('withDashboardAccess(scope, () =>')));
  check('creator root exits before admin/agency fleet lookup', () => { const body = layout.slice(layout.indexOf('export default async function RootLayout')); assert.ok(body.indexOf('if (isCreatorSurface(pathname))') < body.indexOf('getDashboardAccess()')); assert.ok(body.indexOf('if (isCreatorSurface(pathname))') < body.indexOf('getFleetClones()')); });
  check('creator scope does not accidentally match creator-management', () => assert.ok(layout.includes('pathname === "/creator" || !!pathname?.startsWith("/creator/")')));
  check('client does not call operator APIs or import server readers', () => { assert.ok(!ui.includes('/api/dashboard')); assert.ok(!ui.includes('@/lib/creator-reporting')); assert.ok(!ui.includes('supabase')); });
  check('conversion ratios are formatted as percentages', () => { assert.ok(ui.includes('value * 100')); assert.ok(ui.includes('ratio(report.conversion.activeChatBuyerRate)')); });
  check('creator UI is LYNQ-branded and AUD-first', () => { assert.ok(ui.includes('agencyName="LYNQ"')); assert.ok(ui.includes("'$AUD'" ) || ui.includes('>$AUD<')); assert.ok(ui.includes("starsToMoney(Number(stars || 0), 'AUD')")); });
  console.log(`Creator reporting: ${checks} checks passed. No live data or credentials used.`);
}
runHttpChecks().catch(error => { console.error(error); process.exitCode = 1; });