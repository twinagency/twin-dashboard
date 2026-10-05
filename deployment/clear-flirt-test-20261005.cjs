'use strict';
// User-authorized, single-identity reset. Never discover deletion targets by email.
const TARGET = Object.freeze({ account: 'fe90d948-76a4-4c9e-a2f5-69175f67e308', auth: 'daf045ba-752b-464a-a419-fb7d06bde8c9', created: '2026-09-20T08:40:07.877Z', accountCreated: '2026-09-20T08:40:07.945Z' });
const PROJECT = 'lkmfwpqegjluirfusnaw';
const EXPECTED_SHA = '2f42c312a0a69707f6eb675bef0f7767897c9d3b';
const MOXY = Object.freeze({ auth: '6e6491b9-8db0-43f5-b04a-d4509318dac9', created: '2026-09-07T16:01:59.877Z', agency: '74b03b70-397e-49ab-841f-8adb8241d87d' });
function check(value, message) { if (!value) throw new Error(message); }
async function run(env = process.env, request = fetch, brand = 'flirt') {
  check(['flirt','moxy'].includes(brand), 'Unknown brand');
  const target = brand === 'flirt' ? TARGET : MOXY;
  if (brand === 'flirt') check(env.GIT_SHA === EXPECTED_SHA && env.SUPABASE_URL === `https://${PROJECT}.supabase.co` && env.FLIRT_BACKEND_ENABLED === 'true' && env.FLIRT_SUPABASE_PROJECT_REF === PROJECT, 'Wrong serving version or backend; no reset');
  else check(env.SUPABASE_URL === 'https://aouaenqayfltoqrmpitg.supabase.co' && env.FLIRT_BACKEND_ENABLED !== 'true' && /^[a-f0-9]{40}$/.test(env.GIT_SHA || ''), 'Wrong shared backend; no reset');
  check(env.SUPABASE_SERVICE_KEY, 'Runtime credential unavailable');
  const base = env.SUPABASE_URL;
  async function call(resource, method = 'GET', body, extra = {}) {
    const response = await request(base + resource, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error('Unrecognized provider response'); }
    if (response.status === 404 && resource.startsWith('/auth/v1/admin/users/') && data?.code === 'user_not_found') return null;
    check(response.ok, `Provider operation failed (${response.status}); details suppressed`); return data;
  }
  const rows = (table, query) => call(`/rest/v1/${table}?${query}`);
  const userPath = '/auth/v1/admin/users/' + target.auth;
  const auth = await call(userPath);
  if (auth) check(auth.id === target.auth && new Date(auth.created_at).toISOString() === target.created, 'Auth identity mismatch');
  if (brand === 'moxy') {
    async function moxyGuard() {
      check((await rows('creator_accounts', `select=id&auth_user_id=eq.${MOXY.auth}`)).length === 0, 'Unexpected Moxy creator profile; reset refused');
      const memberships = await rows('agency_memberships', `select=user_id,agency_id,active&user_id=eq.${MOXY.auth}`);
      check(memberships.length <= 1 && memberships.every(m => m.user_id === MOXY.auth && m.agency_id === MOXY.agency && m.active === true), 'Unexpected agency access; reset refused');
    }
    await moxyGuard();
    if (auth && !auth.deleted_at) await call(userPath, 'DELETE', { should_soft_delete: true });
    await moxyGuard();
    if (await call(userPath)) await call(userPath, 'DELETE', { should_soft_delete: false });
    check(await call(userPath) === null, 'Moxy Auth identity still present');
    check((await rows('agency_memberships', `select=user_id&user_id=eq.${MOXY.auth}`)).length === 0, 'Old Moxy agency access still present');
    console.log(JSON.stringify({ passed: true, brand, old_auth_removed: true, authorized_old_agency_access_removed: true, customer_media_deleted: 0 }));
    return;
  }
  const accounts = await rows('creator_accounts', `select=id,auth_user_id,display_name,created_at,account_status&id=eq.${TARGET.account}`);
  check(accounts.length <= 1 && accounts.every(a => a.id === TARGET.account && a.auth_user_id === TARGET.auth && a.display_name === 'Jesse Test' && a.account_status === 'applicant' && new Date(a.created_at).toISOString() === TARGET.accountCreated), 'Creator identity mismatch');
  check((await rows('creator_accounts', `select=id&auth_user_id=eq.${TARGET.auth}`)).every(a => a.id === TARGET.account), 'Unexpected linked creator identity');
  async function protectedDataAbsent() {
    check((await rows('agency_memberships', `select=user_id&user_id=eq.${TARGET.auth}`)).length === 0, 'Agency access present; reset refused');
    for (const table of ['creator_files', 'creator_clone_links', 'creator_upload_receipts', 'creator_file_removals', 'creator_consents']) {
      check((await rows(table, `select=creator_account_id&creator_account_id=eq.${TARGET.account}`)).length === 0, 'New media, consent, or connected profile present; reset refused');
    }
    for (const bucket of ['onboarding-content','voice-samples']) {
      const objects = await call('/storage/v1/object/list/' + bucket, 'POST', { prefix: 'creators/' + TARGET.account, limit: 1, offset: 0 });
      check(Array.isArray(objects) && objects.length === 0, 'Stored content present; reset refused');
    }
  }
  await protectedDataAbsent();
  // Supabase soft deletion revokes the user's sessions before permanent removal.
  // The exact allowlist also makes a retry safe after a partially completed reset.
  if (auth && !auth.deleted_at) await call(userPath, 'DELETE', { should_soft_delete: true });
  await protectedDataAbsent();
  if (accounts.length) {
    const deleted = await call(`/rest/v1/creator_accounts?id=eq.${TARGET.account}&auth_user_id=eq.${TARGET.auth}`, 'DELETE', undefined, { Prefer: 'return=representation' });
    check(Array.isArray(deleted) && deleted.length === 1 && deleted[0].id === TARGET.account, 'Creator deletion count mismatch');
  }
  check((await rows('creator_accounts', `select=id&id=eq.${TARGET.account}`)).length === 0, 'Creator identity still present');
  await protectedDataAbsent();
  if (await call(userPath)) await call(userPath, 'DELETE', { should_soft_delete: false });
  check(await call(userPath) === null, 'Auth identity still present');
  console.log(JSON.stringify({ passed: true, brand: 'flirt', old_creator_removed: true, old_auth_removed: true, customer_media_deleted: 0, other_backend_touched: false }));
}
module.exports = { run, TARGET, MOXY, PROJECT, EXPECTED_SHA };
if (require.main === module || (process.argv[1] === '-' && module.id === '[stdin]')) run(process.env, fetch, process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
