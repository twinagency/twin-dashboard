import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { setAgencySessionCookies, renewAgencySession, AGENCY_REFRESH_COOKIE, AGENCY_SESSION_SECONDS } from '../lib/agency-session';
import { AGENCY_COOKIE } from '../lib/agency-policy';
import { middleware } from '../middleware';
import { POST as logout } from '../app/agency/logout/route';

async function main() {
  Object.assign(process.env, { NODE_ENV: 'production', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_offline', DASHBOARD_SESSION_SECRET: 'offline-operator-secret-32-characters', CREATOR_SESSION_SECRET: 'offline-creator-secret-32-characters', DASHBOARD_PASSWORD: 'offline-master-password', FLIRT_BACKEND_ENABLED: 'true', FLIRT_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', DASHBOARD_PUBLIC_ORIGIN: 'https://dashboard.flirtaiagency.com' });
  const realNow = Date.now, realFetch = globalThis.fetch;
  const started = realNow(); let now = started, refreshCount = 0, memberActive = true, failure = 0, wrongUser = false;
  Date.now = () => now;
  const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const agency = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const clone = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const origin = 'https://dashboard.flirtaiagency.com';
  const access = () => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(now / 1000) + 3600 })).toString('base64url') + '.offline';
  const session = () => ({ access_token: access(), refresh_token: `refresh-${now}`, user: { id: user } });
  const header = (res: NextResponse) => res.cookies.getAll().filter(c => c.value).map(c => `${c.name}=${c.value}`).join('; ');
  const request = (cookie: string, path = '/revenue') => new NextRequest(origin + path, { headers: { cookie } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); let data: unknown;
    if (url.pathname === '/auth/v1/token') {
      refreshCount++;
      assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
      assert.ok(JSON.parse(String(init?.body)).refresh_token);
      if (failure) return Response.json({ message: 'offline failure', code: 'refresh_token_not_found' }, { status: failure });
      data = { ...session(), expires_in: 3600, token_type: 'bearer', user: { id: wrongUser ? clone : user } };
    } else if (url.pathname === '/auth/v1/user') data = { id: user };
    else if (url.pathname === '/rest/v1/agency_memberships') data = memberActive ? { agency_id: agency } : null;
    else if (url.pathname === '/rest/v1/partner_agencies') data = { id: agency, name: 'FLIRT' };
    else if (url.pathname === '/rest/v1/agency_creators') data = [{ clone_id: clone }];
    else if (url.pathname === '/auth/v1/logout') data = {};
    else throw new Error(`Unexpected offline request ${url.pathname}`);
    return Response.json(data);
  };
  try {
    const login = NextResponse.next(); await setAgencySessionCookies(login, session());
    const cookies = header(login);
    for (const name of [AGENCY_COOKIE, AGENCY_REFRESH_COOKIE]) {
      const c = login.cookies.get(name)!;
      assert.equal(c.maxAge, AGENCY_SESSION_SECONDS); assert.equal(c.httpOnly, true); assert.equal(c.secure, true); assert.equal(c.sameSite, 'strict');
    }
    assert.equal((await renewAgencySession(request(cookies))).kind, 'unchanged'); assert.equal(refreshCount, 0);
    now += 61 * 60_000;
    const responses = await Promise.all(Array.from({ length: 8 }, () => middleware(request(cookies))));
    assert.equal(refreshCount, 1, 'parallel page requests share token rotation');
    for (const res of responses) {
      assert.equal(res.status, 200); assert.equal(res.headers.get('x-middleware-next'), '1');
      assert.match(res.headers.get('x-middleware-request-cookie')!, /twin_agency_access=/);
      assert.ok(res.headers.get('x-middleware-request-cookie')!.includes(access()), 'new access token reaches the route on this request');
      assert.equal(res.cookies.get(AGENCY_COOKIE)!.maxAge, 24 * 3600 - 61 * 60);
    }
    const rotated = header(responses[0]);
    memberActive = false;
    assert.equal((await middleware(request(rotated))).status, 307, 'membership revocation still denies access');
    memberActive = true;
    now = started + 23 * 3600_000;
    const late = await middleware(request(rotated)); assert.equal(late.status, 200);
    assert.equal(late.cookies.get(AGENCY_COOKIE)!.maxAge, 3600, 'renewal does not slide the deadline');
    const lateCookies = header(late);
    const signedOut = await logout(new NextRequest(origin + '/agency/logout', { method: 'POST', headers: { cookie: lateCookies, origin } }));
    assert.equal(signedOut.cookies.get(AGENCY_COOKIE)!.value, ''); assert.equal(signedOut.cookies.get(AGENCY_REFRESH_COOKIE)!.value, '');
    now = started + 24 * 3600_000;
    const expired = await middleware(request(lateCookies, '/api/dashboard'));
    assert.equal(expired.status, 401); assert.equal(expired.cookies.get(AGENCY_REFRESH_COOKIE)!.value, '');
    now = started + 2 * 3600_000;
    const tampered = cookies.replace(/twin_agency_refresh=./, 'twin_agency_refresh=!');
    const before = refreshCount; assert.equal((await middleware(request(tampered))).status, 307); assert.equal(refreshCount, before);
    const makeExpired = async () => { const res = NextResponse.next(); await setAgencySessionCookies(res, session()); now += 2 * 3600_000; return header(res); };
    failure = 503; const retryCookie = await makeExpired();
    const unavailable = await middleware(request(retryCookie)); assert.equal(unavailable.status, 503); assert.equal(unavailable.cookies.getAll().length, 0, 'outage does not delete login');
    failure = 0; assert.equal((await middleware(request(retryCookie))).status, 200, 'retry after outage recovers');
    failure = 400; assert.equal((await middleware(request(await makeExpired()))).status, 307);
    failure = 0; wrongUser = true; assert.equal((await middleware(request(await makeExpired()))).status, 307, 'rotation cannot switch identity');
    const calls = refreshCount;
    await middleware(new NextRequest(origin + '/agency/logout', { method: 'POST', headers: { cookie: cookies, origin } }));
    assert.equal(refreshCount, calls, 'logout never renews a session');
    console.log('PASS agency login: hour-away renewal, parallel requests, request forwarding, 24h cutoff, revocation, tampering, outages, identity binding and logout');
  } finally { Date.now = realNow; globalThis.fetch = realFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
