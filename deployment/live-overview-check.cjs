// Read-only check inside the deployed container; never log credentials or fan records.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
(async () => {
  assert.equal(process.env.GIT_SHA, process.env.EXPECTED_DASHBOARD_SHA, 'Running release');
  const payload = String(Date.now() + 5 * 60000);
  const sig = crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD).update(payload).digest('base64url');
  const session = `allie_admin_session=${payload}.${sig}`;
  const read = (path, scope) => fetch('http://127.0.0.1:3001' + path, { headers: { cookie: session + (scope ? `; clone_scope=${scope}` : '') }, redirect: 'manual', signal: AbortSignal.timeout(120000) });
  const page = await read('/dashboard'); assert.equal(page.status, 200);
  const html = await page.text(); assert(html.includes('data-live-overview="true"'), 'Live reporting component mounted');
  assert(!html.includes('href="/revenue"'), 'No duplicate internal Earnings destination');
  assert(!html.includes('briana-ledger-'), 'No demo ledger in overview');
  const old = await read('/revenue'); assert.equal(old.status, 307); assert(old.headers.get('location').endsWith('/dashboard'));
  const response = await read('/api/dashboard?period=1D&fresh=1'); assert.equal(response.status, 200);
  const data = await response.json(); assert(data.totals && data.clones.length > 0); assert(!data.demo);
  for (const key of ['stars', 'sales', 'buyers', 'totalFans', 'messages']) assert(Number.isFinite(data.totals[key]), `Live ${key}`);
  const creator = data.clones[0];
  const scoped = await read('/api/dashboard?period=1D&fresh=1&clone=' + creator.id, creator.id); assert.equal(scoped.status, 200);
  const selected = await scoped.json(); assert(selected.perClone[creator.id]);
  assert(Number.isFinite(selected.perClone[creator.id].stars), 'Selected creator revenue');
  const selectedPage = await read('/dashboard', creator.id); assert.equal(selectedPage.status, 200);
  assert((await selectedPage.text()).includes('data-live-overview="true"'));
  console.log(JSON.stringify({ release: process.env.GIT_SHA, overview: 'live', earningsRedirect: 'passed', fleetCreators: data.clones.length, liveData: 'passed', creatorScope: 'passed' }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
