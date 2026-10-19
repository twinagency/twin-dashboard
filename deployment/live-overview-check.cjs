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
  assert(combinedHtml.includes('data-channel-roster="all"') && combinedHtml.includes('data-combined-earnings'), 'Combined dashboard mounted');
  const rosterResponse = await read('/api/channel-roster?channel=all'); assert.equal(rosterResponse.status, 200);
  const roster = await rosterResponse.json(); assert.equal(roster.schemaVersion, 'channel-roster.v1');
  assert.equal(roster.telegram.status, 'ready'); assert.equal(roster.onlyfans.status, 'ready');
  const expectedIds = [...new Set([...roster.telegram.items.map(row => row.id), ...roster.onlyfans.items.map(row => row.creatorId)])].sort();
  const renderedIds = [...combinedHtml.matchAll(/data-roster-creator="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(renderedIds, expectedIds, 'Combined dashboard shows the canonical union once');
  const page = await read('/dashboard?workspace=telegram'); assert.equal(page.status, 200);
  const html = await page.text(); assert(html.includes('data-live-overview="true"'), 'Live Telegram reporting component mounted');
  assert(!html.includes('href="/revenue"'), 'No duplicate internal Earnings destination');
  assert(!html.includes('briana-ledger-'), 'No demo ledger in overview');
  for (const route of ['/inbox', '/fans', '/campaigns', '/content-library']) assert(!html.includes(`href="${route}"`), `No retired ${route} navigation`);
  assert(html.includes('href="/users?workspace=telegram"') && html.includes('data-channel-switch="telegram"'), 'Live Telegram is directly accessible in its own workspace');
  for (const [path, destination] of [['/inbox', '/users'], ['/inbox?presentation=movie-night', '/users'], ['/fans', '/users'], ['/campaigns', '/dashboard'], ['/content-library', '/media'], ['/users?relationship=briana-ben', '/users']]) {
    const retired = await read(path); assert.equal(retired.status, 307, path); assert(retired.headers.get('location').endsWith(destination), path);
  }
  for (const path of ['/api/dashboard/demo-photo', '/api/dashboard/demo-fan-photo']) assert.equal((await read(path)).status, 410, path);
  const old = await read('/revenue'); assert.equal(old.status, 307); assert(old.headers.get('location').endsWith('/dashboard'));
  const response = await read('/api/dashboard?period=1D&fresh=1'); assert.equal(response.status, 200);
  const data = await response.json(); assert(data.totals && data.clones.length > 0); assert(!data.demo);
  for (const key of ['stars', 'sales', 'buyers', 'totalFans', 'messages']) assert(Number.isFinite(data.totals[key]), `Live ${key}`);
  const creator = data.clones[0];
  const scoped = await read('/api/dashboard?period=1D&fresh=1&clone=' + creator.id, creator.id); assert.equal(scoped.status, 200);
  const selected = await scoped.json(); assert(selected.perClone[creator.id]);
  assert(Number.isFinite(selected.perClone[creator.id].stars), 'Selected creator revenue');
  const selectedPage = await read('/dashboard?workspace=telegram', creator.id); assert.equal(selectedPage.status, 200);
  assert((await selectedPage.text()).includes('data-live-overview="true"'));
  console.log(JSON.stringify({ release: process.env.GIT_SHA, overview: 'combined', combinedCreators: expectedIds.length, telegramReporting: 'live', demoCleanup: 'passed', earningsRedirect: 'passed', fleetCreators: data.clones.length, liveData: 'passed', creatorScope: 'passed' }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
