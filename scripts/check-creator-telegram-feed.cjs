// Run from the dashboard checkout with node scripts/check-creator-telegram-feed.cjs.
// Only transport, request context and peripheral presentation use offline fixtures.
require('tsx/cjs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest } = require('next/server');
const { configureFlirtOfflineEnv } = require('./flirt-offline-env.ts');
configureFlirtOfflineEnv();
Object.assign(process.env, {
  FLIRT_LIVE_TWIN_ENABLED: 'true',
  FLIRT_SUPABASE_PROJECT_REF: 'lkmfwpqegjluirfusnaw',
  BOT_V2_URL: 'http://fixture.invalid',
});
global.React = React;

const account = '75df7b21-b83d-49c6-bf35-4d33fc68f80f';
const clone = 'e66c7b0a-21b5-48cc-9611-bd09f6b9f96a';
const other = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const otherUser = '33333333-3333-4333-8333-333333333333';
const { ID: agency } = require('../deployment/flirt-live-twin.cjs');
const link = { creator_account_id: account, clone_id: null, twin_slug: 'randy' };
const local = {
  creator_accounts: [ [account, user], [other, otherUser] ].map(([id, auth_user_id]) =>
    ({ id, auth_user_id, source: id === account ? 'admin' : 'agency_invite', display_name: 'Test creator', account_status: 'active' })),
  creator_agency_assignments: [other].map(creator_account_id =>
    ({ creator_account_id, agency_id: agency, partner_agencies: { name: 'FLIRT', active: true } })),
  // Another signed account with a matching slug must still be outside the grant.
  creator_applications: [], creator_clone_links: [link, { ...link, creator_account_id: other }],
};
const live = { clones: [{ id: clone, slug: 'randy' }, { id: other, slug: 'unassigned' }] };
function readOnlyDatabase(tables) {
  return { from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    let rows = tables[table];
    return {
      select() { return this; }, order() { return this; }, limit() { return this; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return this; },
      async maybeSingle() { assert.ok(rows.length <= 1); return { data: rows[0] ?? null, error: null }; },
    };
  } };
}

let cookie = '';
const pathname = '/creator/telegram';
const api = '/creator-auth/telegram/feed';
const blank = () => null;
const childrenOnly = ({ children }) => children;
const navigation = { usePathname: () => pathname, useRouter: () => ({}), notFound() { throw Error('not found'); } };
const locale = { useFlirtCreatorLocale: () => ({ t: english => english, locale: 'en' }), FlirtCreatorLanguageSwitch: blank };
const mocks = {
  'server-only': {}, 'next/navigation': navigation,
  'next/headers': { cookies: async () => ({ get: name => name === 'twin_creator_session' && cookie ? { value: cookie } : undefined }),
    headers: async () => new Headers({ 'x-pathname': pathname }) },
  './supabase-service': { serviceClient: () => readOnlyDatabase(local), serviceClientForAccess: () => readOnlyDatabase(live) },
  '@/lib/query-cache': { getFleetClones: async () => [], getHeaderAllTimeStars: async () => 0 },
  '@/lib/creator-studio': { getCreatorStudioStatus: async () => ({ linked: false, phase: 'draft' }) },
  '@/components/FlirtCreatorLocale': locale, './FlirtCreatorLocale': locale,
  './useCreatorCurrency': { useCreatorCurrency: () => ({ currency: 'AUD' }) },
  '@/components/NavigationLink': ({ children, ...props }) => React.createElement('a', props, children),
  './BlurProvider': childrenOnly, './CurrencyProvider': childrenOnly, './DashboardAccessProvider': childrenOnly,
  './MainShell': blank, './MobileMenu': blank, './Sidebar': blank, './TopBar': blank, './TwinWordmark': blank,
  './CreatorContentAccess': blank, './CreatorCloneSetupBanner': blank, './FlirtOnboardingLinks': {},
};
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (Object.hasOwn(mocks, name)) return mocks[name];
  if (name.endsWith('.module.css')) return {};
  return originalLoad.call(this, name, parent, main);
};

const calls = [];
global.fetch = async (input, init) => {
  const url = new URL(input);
  assert.equal(url.origin, 'http://fixture.invalid');
  assert.equal(init?.method || 'GET', 'GET');
  assert.equal(url.searchParams.get('girl'), 'randy');
  calls.push(url);
  if (url.pathname === '/api/fans') return Response.json([{ chatId: '1234', name: 'Fan A', messages: 3, lastSeen: '2026-10-01T00:01:00Z' }]);
  assert.equal(url.pathname, '/api/chat-history');
  assert.equal(url.searchParams.get('chatId'), '1234', 'history can only be fetched for a fan from the verified bot');
  const entries = [
    ['first', 'user', 'received', 'hello'], ['second', 'assistant', 'acknowledged', 'hey'], ['third', 'assistant', 'unverified', 'unsent'],
  ];
  return Response.json({ history: entries.map(([id, role, delivery, content], i) =>
    ({ id, role, delivery, content, at: `2026-10-01T00:0${i}:00Z` })), hasMore: false });
};

async function main() {
  const { middleware } = require('../middleware.ts');
  const feed = require('../app/creator-auth/telegram/feed/route.ts');
  const layout = require('../app/creator/layout.tsx').default;
  const page = require('../app/creator/telegram/page.tsx').default;
  const { signCreatorSession } = require('../lib/creator-session.ts');
  const request = (suffix = '', init) => new NextRequest(new URL(api + suffix, 'https://fixture.invalid'), init);
  const read = suffix => feed.GET(request(suffix));
  const navLinks = async () => {
    const markup = renderToStaticMarkup(await layout({ children: 'Fixture' }));
    return (markup.match(/href="\/creator\/telegram"/g) || []).length;
  };
  assert.equal((await read()).status, 401);
  const token = await signCreatorSession(account, user);
  cookie = token.slice(0, token.indexOf('.') + 1) + 'AAAA';
  assert.equal((await read()).status, 401);
  cookie = await signCreatorSession(account, otherUser);
  assert.equal((await read()).status, 401, 'signed identity must match current Auth user');
  cookie = await signCreatorSession(other, otherUser);
  assert.equal((await read()).status, 403);
  assert.equal(await navLinks(), 0);
  await assert.rejects(page, /not found/);

  cookie = token;
  for (const method of ['GET', 'HEAD']) assert.equal((await middleware(request('', { method }))).status, 200);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await middleware(request('', { method }))).status, 403);
  assert.equal((await middleware(request('', { headers: { 'next-action': 'fixture' } }))).status, 403);
  assert.equal(await navLinks(), 2, 'both desktop and mobile expose the feed');
  assert.ok(await page());
  for (const suffix of ['?girl=unassigned', '?accountId=' + other, '?fan=1234&fan=8888']) assert.equal((await read(suffix)).status, 400);
  assert.equal(calls.length, 0, 'denials and navigation must not look up fan data');
  const response = await read();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual((await response.json()).conversations.map(fan => fan.id), ['1234']);
  const history = await (await read('?fan=1234')).json();
  assert.deepEqual(history.messages.map(message => [message.direction, message.text]), [['in', 'hello'], ['out', 'hey']]);
  const before = calls.filter(url => url.pathname === '/api/chat-history').length;
  assert.deepEqual((await (await read('?fan=8888')).json()).messages, []);
  assert.equal(calls.filter(url => url.pathname === '/api/chat-history').length, before);

  const reads = calls.length;
  link.twin_slug = 'unassigned';
  assert.equal((await read()).status, 403);
  assert.equal(await navLinks(), 0);
  local.creator_clone_links.length = 0;
  assert.equal((await read()).status, 403, 'revoked assignment takes effect even with an existing cookie');
  link.twin_slug = 'randy';
  local.creator_clone_links.push(link);
  live.clones[0].slug = 'renamed';
  assert.equal((await read()).status, 403, 'a renamed live bot invalidates the stored assignment');
  live.clones[0].slug = 'randy';
  live.clones[0].id = other;
  assert.equal((await read()).status, 403, 'a changed live clone ID cannot inherit access by slug');
  assert.equal(calls.length, reads);
  console.log('PASS creator Telegram session, current assignment, read-only access, scoped fan history and desktop/mobile navigation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
