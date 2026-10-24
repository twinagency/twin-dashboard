// Read-only check inside the deployed container; never log credentials or fan records.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
(async () => {
  assert.equal(process.env.GIT_SHA, process.env.EXPECTED_DASHBOARD_SHA, 'Running release');
  const payload = String(Date.now() + 5 * 60000);
  const sig = crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD).update(payload).digest('base64url');
  const session = `allie_admin_session=${payload}.${sig}`;
  const read = (path, scope) => fetch('http://127.0.0.1:3001' + path, { headers: { cookie: session + (scope ? `; clone_scope=${scope}` : '') }, redirect: 'manual', signal: AbortSignal.timeout(120000) });
  const combinedPage = await read('/dashboard'); assert.equal(combinedPage.status, 200);
  const combinedHtml = await combinedPage.text();
  // Overview now uses SharedOverview. Cross-channel ledgers live in Earnings.
  // Do not revive the old roster/ledger presentation to satisfy a stale probe.
  const assertOverview = html => {
    assert(html.includes('data-all-channels-dashboard'), 'Fleet homepage mounted');
    assert(html.includes('data-shared-overview="twin"') && html.includes('data-live-overview="true"'), 'Shared live Overview mounted');
  };
  const creatorIds = html => [...html.matchAll(/data-overview-creator="([^"]+)"/g)].map(match => match[1]).sort();
  assertOverview(combinedHtml);
  const renderedIds = creatorIds(combinedHtml);
  assert(renderedIds.length > 0, 'Creator shortcuts are present');
  assert.equal(new Set(renderedIds).size, renderedIds.length, 'Each creator shortcut appears once');
  const page = await read('/dashboard?workspace=telegram'); assert.equal(page.status, 200);
  const html = await page.text(); assert(html.includes('data-live-overview="true"'), 'Live Telegram reporting component mounted');
  assert(html.includes('href="/revenue"'), 'Detailed Earnings remains directly accessible');
  assert(!html.includes('briana-ledger-'), 'No demo ledger in overview');
  for (const route of ['/inbox', '/fans', '/campaigns', '/content-library']) assert(!html.includes(`href="${route}"`), `No retired ${route} navigation`);
  // Admin Telegram navigation is the operator nav (2465b0b): "Live Telegram" links to plain /users, which the app itself resolves to the Telegram workspace.
  assert(html.includes('href="/users"') && html.includes('Live Telegram') && html.includes('data-channel-switch="telegram"'), 'Live Telegram is directly accessible in its own workspace');
  const chat = await read('/users'); assert.equal(chat.status, 200, 'Live Telegram route');
  assert((await chat.text()).includes('data-channel-switch="telegram"'), 'Live Telegram route opens in the Telegram workspace');
  for (const [path, destination] of [['/inbox', '/users'], ['/inbox?presentation=movie-night', '/users'], ['/fans', '/users'], ['/campaigns', '/dashboard'], ['/content-library', '/media'], ['/users?relationship=briana-ben', '/users']]) {
    const retired = await read(path); assert.equal(retired.status, 307, path); assert(retired.headers.get('location').endsWith(destination), path);
  }
  for (const path of ['/api/dashboard/demo-photo', '/api/dashboard/demo-fan-photo']) assert.equal((await read(path)).status, 410, path);
  const earnings = await read('/revenue'); assert.equal(earnings.status, 200, 'Detailed Earnings route');
  const earningsHtml = await earnings.text();
  assert(earningsHtml.includes('data-detailed-earnings') && earningsHtml.includes('data-combined-earnings'), 'Detailed channel earnings mounted');
  const response = await read('/api/dashboard?period=1D&fresh=1'); assert.equal(response.status, 200);
  const data = await response.json(); assert(data.totals && data.clones.length > 0); assert(!data.demo);
  for (const key of ['stars', 'sales', 'buyers', 'totalFans', 'messages']) assert(Number.isFinite(data.totals[key]), `Live ${key}`);
  const expectedIds = [...new Set(data.clones.map(row => row.id))].sort();
  assert.deepEqual(renderedIds, expectedIds, 'Overview shortcuts match the reporting fleet');
  const creator = data.clones[0];
  const rememberedPage = await read('/dashboard', creator.id); assert.equal(rememberedPage.status, 200);
  const rememberedHtml = await rememberedPage.text();
  assertOverview(rememberedHtml);
  assert.deepEqual(creatorIds(rememberedHtml), expectedIds, 'Fleet homepage ignores a remembered creator');
  const scoped = await read('/api/dashboard?period=1D&fresh=1&clone=' + creator.id, creator.id); assert.equal(scoped.status, 200);
  const selected = await scoped.json(); assert(selected.perClone[creator.id]);
  assert(Number.isFinite(selected.perClone[creator.id].stars), 'Selected creator revenue');
  const selectedPage = await read('/dashboard?workspace=telegram', creator.id); assert.equal(selectedPage.status, 200);
  assert((await selectedPage.text()).includes('data-live-overview="true"'));
  console.log(JSON.stringify({ release: process.env.GIT_SHA, overview: 'shared-fleet', overviewCreators: expectedIds.length, telegramReporting: 'live', demoCleanup: 'passed', detailedEarnings: 'passed', fleetCreators: data.clones.length, liveData: 'passed', creatorScope: 'passed' }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });

