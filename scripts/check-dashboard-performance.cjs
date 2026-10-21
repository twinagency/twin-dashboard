const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let access = null, dashboards = 0, analytics = 0, lastOptions, lastScope;
const range = { startMs: 1000, endMs: 2000 };
Module._load = function(id, parent, ...rest) {
  if (parent?.filename.endsWith('revenue-cache.ts')) {
    if (id === './dashboard-access') return {
      getDashboardAccess: async () => access,
      withDashboardAccess: (_, fn) => fn(),
      requireCloneAccess: async id => { if (access && id && !access.cloneIds.includes(id)) throw Error('Creator access denied'); },
    };
    if (id === './platform-cut') return { viewerCacheKey: async a => JSON.stringify(a) };
    if (id === './revenue-window') return { resolveRevenueWindow: async (_, r) => r || range };
    if (id === './dashboard-data') return { getDashboard: async (_p, r, _now, scope, options) => {
      dashboards++; lastOptions = options; lastScope = scope;
      assert.deepEqual(r, range); await new Promise(resolve => setTimeout(resolve, 5));
      return { totals: { stars: 900, sales: 2 }, overviewConversion: options ? { activeChatters: 10, activeChatBuyers: 2, activeChatBuyerRate: .2 } : undefined };
    } };
    if (id === './analytics-data') return { getAnalytics: async () => { analytics++; return { marker: 'full report' }; } };
  }
  return originalLoad.call(this, id, parent, ...rest);
};
const { getRevenueRollup, clearRevenueCache } = require('../lib/revenue-cache.ts');
Module._load = originalLoad;
(async () => {
  const copies = await Promise.all(Array.from({ length: 8 }, () => getRevenueRollup('1W', null, range, { summary: true })));
  assert.equal(dashboards, 1); assert.equal(analytics, 0); assert.deepEqual(lastOptions, { overviewCloneId: null });
  assert.equal(copies[0].analytics, null); assert.equal(copies[0].dashboard.overviewConversion.activeChatBuyerRate, .2);
  await getRevenueRollup('1W', null, range, { summary: true, awaitFresh: true }); assert.equal(dashboards, 1);
  const detailed = await getRevenueRollup('1W', null, range); assert.equal(analytics, 1); assert.equal(dashboards, 2);
  assert.deepEqual(detailed.dashboard.totals, copies[0].dashboard.totals); assert.equal(detailed.analytics.marker, 'full report');
  await getRevenueRollup('1W', null, range, { summary: true, force: true }); assert.equal(dashboards, 3);
  access = { id: 'agency-one', cloneIds: ['one', 'two'] };
  await getRevenueRollup('1W', null, range, { summary: true }); assert.deepEqual(lastScope, ['one', 'two']); assert.equal(dashboards, 4);
  await getRevenueRollup('1W', 'one', range, { summary: true }); assert.deepEqual(lastScope, ['one']); assert.deepEqual(lastOptions, { overviewCloneId: 'one' });
  await assert.rejects(() => getRevenueRollup('1W', 'foreign', range, { summary: true }), /access denied/);
  access.cloneIds = ['two'];
  await getRevenueRollup('1W', null, range, { summary: true }); assert.deepEqual(lastScope, ['two']); assert.equal(dashboards, 6);
  clearRevenueCache();
  console.log('PASS dashboard performance: summary skips full analysis, exact totals, coalescing, warm reads, forced refresh, mode separation and current roster isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
