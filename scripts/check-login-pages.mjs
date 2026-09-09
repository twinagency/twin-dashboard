import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the production build without production credentials or database writes.
const port = 3117;
const local = `http://127.0.0.1:${port}`;
const publicOrigin = 'https://dashboard.tgaiclone.xyz';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', DASHBOARD_PASSWORD: 'offline-login-smoke', DASHBOARD_PUBLIC_ORIGIN: publicOrigin },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-10000); });
const request = (path, init = {}) => fetch(local + path, { redirect: 'manual', signal: AbortSignal.timeout(5000), ...init });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Production test server exited');
    try { if ((await request('/twin')).status === 200) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.equal(ready, true, 'Production login page must start');
  for (const cookie of ['', 'twin_agency_access=stale; twin_agency_portal=moxy', 'twin_agency_access=stale; twin_agency_portal=lynq', 'twin_agency_access=stale; twin_agency_portal=jess-and-kate-ai']) {
    for (const [path, action, brand] of [['/', '/admin-auth', 'Admin sign in'], ['/twin', '/admin-auth', 'Admin sign in'], ['/moxy', '/moxy/auth', 'Moxy'], ['/link', '/link/auth', 'Link'], ['/lynq', '/lynq/auth', 'LYNQ'], ['/jess-and-kate-ai', '/jess-and-kate-ai/auth', 'Jess and Kate AI']]) {
      const response = await request(path, { headers: { cookie } });
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('location'), null, `${path} must not redirect to another login`);
      const html = await response.text();
      assert.ok(html.includes(`action="${action}"`), `${path}: correct authentication endpoint`);
      assert.ok(html.includes(brand), `${path}: correct brand`);
      if (path === '/' || path === '/twin') assert.ok(!html.includes('data-agency="moxy"'), 'Twin must not inherit partner branding');
    }
  }
  for (const path of ['/', '/twin', '/link', '/moxy', '/jess-and-kate-ai']) assert.equal((await request(path, {method:'POST', headers:{'next-action':'not-authorized'}})).status, 403);
  const denied = await request('/settings');
  assert.equal(denied.status, 307);
  assert.equal(new URL(denied.headers.get('location')).pathname, '/twin');
  const login = await request('/admin-auth', {method:'POST', headers:{origin:publicOrigin, cookie:'twin_agency_access=stale; twin_agency_portal=moxy'}, body:new URLSearchParams({password:'offline-login-smoke',next:'/twin'})});
  assert.equal(login.status,303);
  assert.equal(login.headers.get('location'),publicOrigin + '/revenue');
  assert.match(login.headers.get('set-cookie'), /allie_admin_session=/);
  assert.match(login.headers.get('set-cookie'), /twin_agency_access=;/);
  assert.match(login.headers.get('set-cookie'), /twin_agency_portal=;/);
  console.log('Production login smoke passed: all five entry URLs, stale partner cookies, correct branded forms, admin authentication and protected-route checks');
} catch (error) {
  console.error(error, output);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 5000).unref();
}
