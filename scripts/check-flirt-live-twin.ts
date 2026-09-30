import assert from 'node:assert/strict';
import { identity, PROJECT, CLONES } from '../deployment/flirt-live-twin.cjs';
import { configureFlirtOfflineEnv } from './flirt-offline-env';
import { withDashboardAccess } from '../lib/dashboard-access';
import { supabaseAdmin } from '../lib/supabase';
import { signSession, SESSION_COOKIE } from '../lib/session';
import { middleware } from '../middleware';
import { NextRequest } from 'next/server';
async function main() {
  configureFlirtOfflineEnv();
  Object.assign(process.env, { NODE_ENV: 'production', FLIRT_SUPABASE_PROJECT_REF: 'lkmfwpqegjluirfusnaw', SUPABASE_URL: 'https://lkmfwpqegjluirfusnaw.supabase.co', FLIRT_LIVE_TWIN_ENABLED: 'true', FLIRT_LIVE_TWIN_URL: `https://${PROJECT}.supabase.co`, FLIRT_LIVE_TWIN_SERVICE_KEY: 'sb_secret_' + 'x'.repeat(32) });
  const original = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = async input => { const url = new URL(String(input)); calls.push(url); return new Response(JSON.stringify([{ id: CLONES[0], bot_token: 'hidden' }]), { headers: { 'content-type': 'application/json' } }); };
  try {
    await withDashboardAccess(identity(), async () => {
      const rows = await supabaseAdmin.from('clones').select('*');
      assert.equal(rows.error, null);
      assert.equal(rows.data?.[0].bot_token, null);
      assert.equal(calls.at(-1)?.hostname, `${PROJECT}.supabase.co`);
      for (const id of CLONES) assert.ok(calls.at(-1)?.searchParams.get('and')?.includes(id));
      const count = calls.length;
      assert.ok((await supabaseAdmin.from('clones').update({ status: 'paused' }).eq('id', '11111111-1111-1111-1111-111111111111')).error);
      assert.equal(calls.length, count, 'Unassigned write must never reach Twin');
      assert.equal((await supabaseAdmin.from('clones').update({ status: 'active' }).eq('id', CLONES[0])).error, null);
      assert.equal(calls.at(-1)?.hostname, `${PROJECT}.supabase.co`);
      assert.ok(calls.at(-1)?.searchParams.get('and')?.includes(CLONES[0]));
    });
    await withDashboardAccess(null, async () => {
      await supabaseAdmin.from('clones').select('id');
      assert.equal(calls.at(-1)?.hostname, 'lkmfwpqegjluirfusnaw.supabase.co');
      assert.equal(calls.at(-1)?.searchParams.has('and'), false);
    });
    const cookie = `${SESSION_COOKIE}=${await signSession()}`;
    for (const path of ['/clones', `/clones/${CLONES[0]}`, '/api/dashboard']) assert.equal((await middleware(new NextRequest('https://dashboard.flirt.example' + path, { headers: { cookie } }))).status, 200);
    for (const path of ['/settings', '/clones/new', '/clones/11111111-1111-1111-1111-111111111111', '/api/dashboard?clone=11111111-1111-1111-1111-111111111111']) assert.equal((await middleware(new NextRequest('https://dashboard.flirt.example' + path, { headers: { cookie } }))).status, 403);
    assert.equal((await middleware(new NextRequest('https://dashboard.flirt.example/api/compile?cloneId=11111111-1111-1111-1111-111111111111', { method: 'POST', headers: { cookie, origin: 'https://dashboard.flirt.example' } }))).status, 403);
  } finally { globalThis.fetch = original; }
  console.log('FLIRT live routing, scoped SDK reads, blocked writes, local database isolation and authenticated middleware passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
