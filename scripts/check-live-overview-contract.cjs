// Runs the deployed probe against isolated HTTP fixtures. No account or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(process.env.OVERVIEW_CHECK_SCRIPT || 'deployment/live-overview-check.cjs'), 'utf8');
const creators = ['creator-a', 'creator-b'];
const shortcuts = ids => ids.map(id => `<button data-overview-creator="${id}"></button>`).join('');
const shared = '<div data-shared-overview="twin" data-live-overview="true"><a href="/revenue">Earnings</a><a href="/users">Live Telegram</a><div data-channel-switch="telegram"></div>';
const overview = ids => `<div data-all-channels-dashboard>${shared}${shortcuts(ids)}</div></div>`;
async function probe(change = {}) {
  const process = { env: { GIT_SHA: 'fixture-release', EXPECTED_DASHBOARD_SHA: 'fixture-release', DASHBOARD_SESSION_SECRET: 'fixture-secret' }, exitCode: 0 };
  const errors = [], output = [], requests = [];
  const fetch = async (input, init) => {
    const url = new URL(input); requests.push(url.pathname + url.search);
    assert.equal(url.origin, 'http://127.0.0.1:3001');
    assert.equal(init.method || 'GET', 'GET');
    assert.match(init.headers.cookie, /^allie_admin_session=/);
    const remembered = init.headers.cookie.includes('clone_scope=');
    if (url.pathname === '/users' && !url.search) return change.chatWrongWorkspace ? new Response('<main>Users</main>') : new Response(shared);
    if (url.pathname === '/dashboard') {
      if (url.searchParams.get('workspace') === 'telegram') return change.missingChatLink ? new Response(shared.replace('<a href="/users">Live Telegram</a>', '')) : new Response(shared);
      return new Response(change.missingOverview ? '<main>Wrong page</main>' : overview(remembered && change.scopedHomepage ? ['creator-a'] : change.duplicate ? ['creator-a', 'creator-a'] : creators));
    }
    if (url.pathname === '/revenue') return change.earningsRedirect ? new Response(null, { status: 307, headers: { location: '/dashboard' } }) : new Response('<div data-detailed-earnings><div data-combined-earnings></div></div>');
    if (url.pathname.startsWith('/api/dashboard/demo-')) return new Response(null, { status: 410 });
    if (url.pathname === '/api/dashboard') {
      if (change.apiFailure) return new Response(null, { status: 503 });
      const ids = change.missingCreator ? ['creator-a'] : creators;
      return Response.json({ totals: { stars: 10, sales: 1, buyers: 1, totalFans: 2, messages: 5 }, clones: ids.map(id => ({ id })), perClone: { 'creator-a': { stars: 10 } } });
    }
    const destinations = { '/inbox': '/users', '/fans': '/users', '/campaigns': '/dashboard', '/content-library': '/media', '/users': '/users' };
    assert(destinations[url.pathname], 'Unexpected probe request');
    return new Response(null, { status: 307, headers: { location: destinations[url.pathname] } });
  };
  await vm.runInNewContext(source, { require, process, fetch, URL, AbortSignal, console: { log: value => output.push(value), error: value => errors.push(value) } });
  return { code: process.exitCode, errors, output, requests };
}
(async () => {
  const good = await probe();
  assert.equal(good.code, 0, good.errors.join('\n'));
  assert.equal(JSON.parse(good.output[0]).overviewCreators, 2);
  assert(!good.requests.some(url => /onlyfans|channel-roster/.test(url)), 'Overview probe does not depend on a live OnlyFans connection');
  for (const change of [{ missingOverview: true }, { duplicate: true }, { missingCreator: true }, { scopedHomepage: true }, { earningsRedirect: true }, { apiFailure: true }, { chatWrongWorkspace: true }, { missingChatLink: true }]) {
    const result = await probe(change);
    assert.equal(result.code, 1, 'Probe must reject ' + JSON.stringify(change));
    assert.equal(result.output.length, 0);
  }
  console.log('PASS deployed Overview contract: current shared layout, complete creator strip, remembered scope, distinct Earnings and failed reads; loopback GETs only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
