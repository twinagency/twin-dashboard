import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest, createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the production build without production credentials or database writes.
const port = 3117;
const local = `http://127.0.0.1:${port}`;
const publicOrigin = 'https://dashboard.tgaiclone.xyz';
// Local session-store fixture, not a production bypass. The production server
// still hashes opaque tokens, calls its RPC owner and fails closed on outages.
const sessions = new Set();
let sessionOutage = false;
const sessionStore = createServer(async (req, res) => {
  const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (!req.url?.startsWith('/rest/v1/rpc/dashboard_') || req.method !== 'POST') return reply(401, { error: 'Synthetic endpoint unavailable' });
  if (sessionOutage) return reply(503, false);
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (!/^[a-f0-9]{64}$/.test(body.p_session_hash) || Object.keys(body).join(',') !== 'p_session_hash') return reply(400, false);
  if (req.url.endsWith('/dashboard_admin_session_create')) { sessions.add(body.p_session_hash); return reply(200, true); }
  if (req.url.endsWith('/dashboard_owner_session_verify')) return reply(200, sessions.has(body.p_session_hash));
  if (req.url.endsWith('/dashboard_owner_session_revoke')) { sessions.delete(body.p_session_hash); return reply(200, true); }
  return reply(404, false);
});
sessionStore.listen(0, '127.0.0.1'); await once(sessionStore, 'listening');
const sessionOrigin = `http://127.0.0.1:${sessionStore.address().port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', DASHBOARD_PASSWORD: 'offline-login-smoke', DASHBOARD_PUBLIC_ORIGIN: publicOrigin, SUPABASE_URL: sessionOrigin, NEXT_PUBLIC_SUPABASE_URL: sessionOrigin, SUPABASE_SERVICE_KEY: 'synthetic-login-smoke-only', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-login-smoke-only', ONLYFANS_API_BASE_URL: '', ONLYFANS_API_TOKEN: '', DASHBOARD_ALLOW_LEGACY_ADMIN_SESSIONS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-10000); });
// Node fetch overwrites a supplied Host header, which would never exercise
// Moxy's allowed production host. Native HTTP preserves it without leaving
// the local test server or following any production redirect.
const request = (path, init = {}) => new Promise((resolve, reject) => {
  const headers = { ...init.headers };
  const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
  if (init.body instanceof URLSearchParams) headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  if (body != null) headers['content-length'] = String(Buffer.byteLength(body));
  const req = httpRequest(local + path, { method: init.method || 'GET', headers }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('error', reject);
    res.on('end', () => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) responseHeaders.append(key, item);
      resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: responseHeaders }));
    });
  });
  req.setTimeout(5000, () => req.destroy(new Error('Local production request timed out')));
  req.on('error', reject);
  req.end(body);
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Production test server exited');
    try { if ((await request('/twin')).status === 200) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.equal(ready, true, 'Production login page must start');
  for (const cookie of ['', 'twin_agency_access=stale; twin_agency_portal=moxy', 'twin_agency_access=stale; twin_agency_portal=lynq', 'twin_agency_access=stale; twin_agency_portal=jess-and-kate-ai']) {
    for (const [path, action, brand] of [['/', '/admin-auth', 'Admin sign in'], ['/twin', '/admin-auth', 'Admin sign in'], ['/moxy', '/moxy/auth', 'Moxy'], ['/link', '/link/auth', 'Link'], ['/lynq', '/lynq/auth', 'LYNQ'], ['/jess-and-kate-ai', '/jess-and-kate-ai/auth', 'Ava']]) {
      let response = await request(path, { headers: { cookie } });
      if (path === '/moxy') {
        assert.equal(response.status, 308, 'Old Moxy login must move permanently to its canonical brand host');
        assert.equal(response.headers.get('location'), 'https://dashboard.lynqai.co/moxy');
        // Exercise the same local production server under the exact allowed
        // Moxy Host header; do not follow the redirect onto a live website.
        response = await request('/moxy', { headers: { cookie, host: 'dashboard.lynqai.co' } });
      }
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('location'), null, `${path} must not redirect to another login`);
      const html = await response.text();
      assert.ok(html.includes(`action="${action}"`), `${path}: correct authentication endpoint`);
      assert.ok(html.includes(brand), `${path}: correct brand`);
      if (path === '/' || path === '/twin') assert.ok(!html.includes('data-agency="moxy"'), 'Twin must not inherit partner branding');
    }
  }
  const movedQuery = await request('/moxy?next=%2Frevenue');
  assert.equal(movedQuery.status, 308);
  assert.equal(movedQuery.headers.get('location'), 'https://dashboard.lynqai.co/moxy?next=%2Frevenue');
  for (const path of ['/', '/twin', '/link', '/moxy', '/jess-and-kate-ai']) assert.equal((await request(path, {method:'POST', headers:{'next-action':'not-authorized'}})).status, 403);
  const denied = await request('/settings');
  assert.equal(denied.status, 307);
  assert.equal(new URL(denied.headers.get('location')).pathname, '/twin');
  const login = await request('/admin-auth', {method:'POST', headers:{origin:publicOrigin, cookie:'twin_agency_access=stale; twin_agency_portal=moxy'}, body:new URLSearchParams({password:'offline-login-smoke',next:'/twin'})});
  assert.equal(login.status,303);
  assert.equal(login.headers.get('location'),publicOrigin + '/dashboard');
  assert.match(login.headers.get('set-cookie'), /allie_admin_session=/);
  assert.match(login.headers.get('set-cookie'), /twin_agency_access=;/);
  assert.match(login.headers.get('set-cookie'), /twin_agency_portal=;/);
  const cookie = login.headers.get('set-cookie').match(/allie_admin_session=(owner_[a-f0-9]{64})/)[0];
  assert.equal(sessions.size, 1, 'Login creates one durable opaque session');
  assert.equal((await request('/api/onlyfans/accounts', {headers:{cookie}})).status, 503, 'Verified login reaches the unconfigured account service');
  sessions.clear();
  assert.equal((await request('/settings', {headers:{cookie}})).status, 307, 'A copied revoked cookie is rejected on the next request');
  const wrong = await request('/admin-auth', {method:'POST', headers:{origin:publicOrigin}, body:new URLSearchParams({password:'wrong'})});
  assert.equal(wrong.status, 303); assert.equal(sessions.size, 0, 'Wrong passwords cannot create a session');
  sessionOutage = true;
  const outage = await request('/admin-auth', {method:'POST', headers:{origin:publicOrigin}, body:new URLSearchParams({password:'offline-login-smoke'})});
  assert.equal(outage.status, 500, 'Session-store outage remains a visible authentication failure');
  assert.doesNotMatch(outage.headers.get('set-cookie') ?? '', /allie_admin_session=owner_/);
  console.log('Production login smoke passed: revocable session fixture, copied-cookie rejection, wrong password and fail-closed outage; all five entry URLs, stale partner cookies, correct branded forms, admin authentication and protected-route checks');
} catch (error) {
  console.error(error, output);
  process.exitCode = 1;
} finally {
  sessionStore.close();
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 5000).unref();
}
