/* Disposable production check, deliberately inert unless invoked with --execute.
 * Never logs credentials, cookies, customer data, or fixture identifiers.
 * Run inside next-app with MOXY_UPLOAD_CHECK_EXPECTED_SHA set to the reviewed commit.
 */
'use strict';
const fs = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const PROJECT = 'aouaenqayfltoqrmpitg';
const API = `https://${PROJECT}.supabase.co`;
const ORIGIN = 'https://dashboard.lynqai.co';
const MOXY = 'bc670215-110b-4ea0-8f5c-af3dfe21d253';
const RUN = randomBytes(18).toString('hex');
const fixtures = [];
const checks = [];
const CHILD_TABLES = ['creator_files', 'creator_onboarding_progress', 'creator_applications', 'creator_consents', 'creator_agency_assignments', 'creator_clone_links'];
let staged;
class CheckError extends Error {}
function assert(ok, label) { if (!ok) throw new CheckError(label); }
function guard() {
  assert(process.argv.slice(2).join(' ') === '--execute', 'Execution requires --execute');
  const expected = process.env.MOXY_UPLOAD_CHECK_EXPECTED_SHA;
  assert(/^[a-f0-9]{40}$/.test(expected || '') && process.env.GIT_SHA === expected, 'Running commit does not match the explicitly expected release');
  assert(process.env.NODE_ENV === 'production', 'Production runtime required');
  assert(!Object.entries(process.env).some(([name, value]) => name.startsWith('FLIRT_') && value), 'Refusing a FLIRT runtime');
  assert(process.env.SUPABASE_URL === API || process.env.SUPABASE_URL === API + '/', 'Refusing a different Supabase project');
  assert(!!process.env.SUPABASE_SERVICE_KEY, 'Service credentials unavailable');
  assert(!process.env.DASHBOARD_PUBLIC_ORIGIN || ['https://dashboard.tgaiclone.xyz', ORIGIN].includes(process.env.DASHBOARD_PUBLIC_ORIGIN), 'Unexpected dashboard origin');
}
async function request(url, options = {}) {
  try { return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), ...options }); }
  catch { throw new CheckError('A test request failed or timed out; provider details suppressed'); }
}
async function apiResponse(path, { method = 'GET', body, headers = {} } = {}) {
  return request(API + path, { method, headers: {
    apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function api(path, options) {
  const response = await apiResponse(path, options);
  assert(response.ok, `Fixture API operation failed at ${path.split("?")[0]} (HTTP ${response.status}); provider details suppressed`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function rest(table, query) { return `/rest/v1/${table}?${new URLSearchParams(query)}`; }
function rowQuery(fixture, select = '*') { return { select, creator_account_id: `eq.${fixture.id}` }; }
async function rows(table, fixture, select) { return api(rest(table, rowQuery(fixture, select))); }
async function account(fixture) { return api(rest('creator_accounts', { select: 'id,auth_user_id,email,source,account_status', id: `eq.${fixture.id}` })); }
async function page(path, fixture, options = {}) {
  const { headers, ...restOptions } = options;
  return request(ORIGIN + path, { ...restOptions, headers: { Origin: ORIGIN, ...(fixture?.cookie ? { Cookie: fixture.cookie } : {}), ...headers } });
}
async function createFixture(label) {
  const fixture = { id: randomUUID(), email: `moxy-upload-${RUN}-${label}@example.com`, password: randomBytes(32).toString('hex') };
  fixtures.push(fixture);
  assert((await account(fixture)).length === 0, 'Synthetic UUID collision');
  fixture.authCreationAttempted = true;
  const created = await api('/auth/v1/admin/users', { method: 'POST', body: {
    email: fixture.email, password: fixture.password, email_confirm: true,
    user_metadata: { display_name: 'Disposable Moxy upload verification' },
    app_metadata: { moxy_upload_check: RUN },
  } });
  const user = created.user || created;
  assert(user.email === fixture.email && /^[a-f0-9-]{36}$/.test(user.id || ''), 'Synthetic auth creation did not return the expected user');
  fixture.authId = user.id;
  await api('/rest/v1/creator_accounts', { method: 'POST', body: { id: fixture.id, auth_user_id: fixture.authId, email: fixture.email, display_name: 'Disposable Moxy upload verification', source: 'twin', account_status: 'applicant' } });
  await api('/rest/v1/creator_agency_assignments', { method: 'POST', body: { creator_account_id: fixture.id, agency_id: MOXY, assignment_source: 'invite', assigned_at: new Date().toISOString() } });
  await api('/rest/v1/creator_onboarding_progress', { method: 'POST', body: { creator_account_id: fixture.id } });
  await api('/rest/v1/creator_applications', { method: 'POST', body: { id: fixture.id, creator_account_id: fixture.id, status: 'draft', answers: {}, updated_at: new Date().toISOString() } });
  const login = await page('/creator-auth/login', null, { method: 'POST', body: new URLSearchParams({ email: fixture.email, password: fixture.password, portal: 'twin', next: '/creator/onboarding?step=content' }) });
  assert(login.status === 303 && new URL(login.headers.get('location'), ORIGIN).origin === ORIGIN, 'Normal Moxy creator login failed or changed origin');
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('twin_creator_session='));
  assert(cookie && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie), 'Normal login did not issue a secure creator session');
  fixture.cookie = cookie.split(';')[0];
  const identity = JSON.parse(Buffer.from(fixture.cookie.split('=')[1].split('.')[0], 'base64url').toString());
  assert(identity.accountId === fixture.id && identity.userId === fixture.authId, 'Issued creator session owns a different account');
  const assignment = await rows('creator_agency_assignments', fixture, 'agency_id');
  assert(assignment.length === 1 && assignment[0].agency_id === MOXY, 'Synthetic Moxy assignment missing');
  return fixture;
}
function hasBoolean(tag, attribute) {
  return new RegExp(`\\s${attribute}(?=[\\s=>])`, 'i').test(tag.replace(/"[^"]*"|'[^']*'/g, '""'));
}
async function assertContentUi(fixture) {
  const response = await page('/creator/onboarding?step=content', fixture);
  const html = await response.text();
  assert(response.status === 200 && html.includes('data-creator-onboarding-brand="moxy"'), 'Authenticated content page did not resolve Moxy identity');
  assert(html.includes('512 MB') && html.includes('30 minutes'), '512 MB / 30 minute limits not rendered');
  const pickers = [...html.matchAll(/<label\b[^>]*data-choose-content[^>]*>[\s\S]*?<\/label>/g)];
  assert(pickers.length === 4, 'Four content picker controls missing');
  const inputs = [...html.matchAll(/<input\b[^>]*type="file"[^>]*>/g)].map(match => match[0]);
  assert(inputs.length >= 6 && inputs.every(tag => hasBoolean(tag, 'multiple') && !hasBoolean(tag, 'disabled')), 'Post-submission content pickers must allow multiple files');
  assert(inputs.filter(tag => tag.includes('accept="application/octet-stream"')).length === 2 && (html.match(/data-choose-photos/g) || []).length === 2, 'Both video categories require Files and secondary Photos pickers');
  assert(html.includes('Choose videos from Files') && html.includes('On My iPhone'), 'Files picker instructions missing');
  checks.push('Moxy identity, post-submission 512 MB / 30 minute UI, multiple selection, Files bypass, and secondary Photos controls verified');
}
async function upload(fixture, name, path, { headers, fields = {} } = {}) {
  const form = new FormData();
  form.set('kind', 'content_sfw_video');
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.append('files', await fs.openAsBlob(path, { type: 'video/mp4' }), name);
  return page('/creator-auth/upload', fixture, { method: 'POST', headers: { Accept: 'application/json', ...headers }, body: form, signal: AbortSignal.timeout(150000) });
}
async function requireSaved(response, label) {
  let result;
  try { result = await response.json(); } catch { throw new CheckError(label + ': upload returned a non-JSON response'); }
  assert(response.status === 200 && result.status === 'content_saved', label + ': upload did not confirm persistence');
}
async function makeClip(name, duration) {
  const path = join(staged, name);
  try {
    await exec('/usr/bin/ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=4', '-t', String(duration), '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], { timeout: 60000, maxBuffer: 65536 });
    const { stdout } = await exec('/usr/bin/ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'format=duration:stream=nb_read_frames', '-of', 'json', path], { timeout: 15000, maxBuffer: 65536 });
    const metadata = JSON.parse(stdout);
    assert(Math.abs(Number(metadata.format?.duration) - duration) < 0.5 && Number(metadata.streams?.[0]?.nb_read_frames) >= duration * 4, 'Generated video duration/frame count incorrect');
  } catch (error) {
    if (error instanceof CheckError) throw error;
    throw new CheckError('Synthetic video generation failed; tool details suppressed');
  }
  return path;
}
async function verifiedFile(fixture, name, size) {
  const saved = (await rows('creator_files', fixture, 'original_name,kind,bucket,storage_path,size_bytes,storage_transfer_status')).filter(row => row.original_name === name);
  assert(saved.length === 1 && saved[0].kind === 'content_sfw_video' && saved[0].bucket === 'onboarding-content' && Number(saved[0].size_bytes) === size && saved[0].storage_transfer_status === 'verified', 'Uploaded video was not recorded exactly once and verified');
  const file = saved[0];
  assert(file.storage_path.startsWith(`creators/${fixture.id}/content_sfw_video/`), 'Stored upload escaped its authenticated account');
  const info = await api('/storage/v1/object/info/onboarding-content/' + file.storage_path.split('/').map(encodeURIComponent).join('/'));
  assert(Number(info.metadata?.size ?? info.size) === size, 'Stored object size does not match uploaded video');
}
async function main() {
  guard();
  const agency = await api(rest('partner_agencies', { select: 'id,name,active', id: `eq.${MOXY}` }));
  assert(agency.length === 1 && agency[0].name.trim().toLowerCase() === 'moxy' && agency[0].active, 'Expected active Moxy agency is unavailable');
  const bucket = await api('/storage/v1/bucket/onboarding-content');
  assert(bucket.public === false && (!bucket.file_size_limit || Number(bucket.file_size_limit) >= 512 * 1024 * 1024), 'Private content bucket cannot accept the configured video limit');
  staged = await mkdtemp(join(tmpdir(), 'moxy-live-upload-'));
  const short = await makeClip('short-moving.mp4', 1);
  const long5 = await makeClip('five-minutes-moving.mp4', 300);
  const long10 = await makeClip('ten-minutes-moving.mp4', 600);
  const a = await createFixture('upload');
  const b = await createFixture('isolation');
  const submit = await page('/creator-auth/onboarding', a, { method: 'POST', body: new URLSearchParams({ action: 'submit' }) });
  assert(submit.status === 303 && new URL(submit.headers.get('location'), ORIGIN).pathname === '/creator', 'Normal Moxy optional onboarding submission failed');
  const application = await rows('creator_applications', a, 'status');
  assert(application.length === 1 && application[0].status === 'submitted', 'Synthetic onboarding was not submitted');
  await assertContentUi(a);

  const anonymous = await upload(null, 'denied-anonymous.mp4', short);
  assert(anonymous.status === 401, 'Anonymous upload was not denied');
  const foreignOrigin = await upload(a, 'denied-origin.mp4', short, { headers: { Origin: 'https://untrusted.example' } });
  assert(foreignOrigin.status === 403, 'Cross-origin upload was not denied');
  const action = await upload(a, 'denied-action.mp4', short, { headers: { 'next-action': 'forged' } });
  assert(action.status === 403, 'Server-action header was not denied');
  const [payload, signature] = a.cookie.split('=')[1].split('.');
  const changed = JSON.parse(Buffer.from(payload, 'base64url').toString());
  changed.accountId = b.id; changed.userId = b.authId;
  const forged = { cookie: 'twin_creator_session=' + Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + signature };
  assert((await upload(forged, 'denied-account.mp4', short)).status === 401, 'Forged foreign-account session was not denied');
  await requireSaved(await upload(a, 'own-account-only.mp4', short, { fields: { creator_account_id: b.id }, headers: { 'x-pathname': '/agency', 'x-dashboard-audience': 'creator' } }), 'Authenticated account isolation');
  await verifiedFile(a, 'own-account-only.mp4', fs.statSync(short).size);
  assert((await rows('creator_files', b, 'id')).length === 0, 'Posted foreign account identifier received an upload');
  checks.push('Anonymous, cross-origin, forged action and foreign-account sessions denied; caller-supplied account identifier cannot change ownership');

  const large = join(staged, 'one-second-padded-80mib.mp4');
  fs.copyFileSync(short, large);
  const size = 80 * 1024 * 1024;
  const original = fs.statSync(large).size;
  const free = Buffer.alloc(8); free.writeUInt32BE(size - original); free.write('free', 4);
  const fd = fs.openSync(large, 'r+');
  try { fs.writeSync(fd, free, 0, 8, original); fs.ftruncateSync(fd, size); } finally { fs.closeSync(fd); }
  const names = ['concurrent-large-a.mp4', 'concurrent-large-b.mp4'];
  const started = Date.now();
  const outcomes = await Promise.allSettled(names.map(async name => requireSaved(await upload(a, name, large), 'Concurrent 80 MiB video')));
  for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
  for (const name of names) await verifiedFile(a, name, size);
  checks.push(`Two 80 MiB one-second padded videos transferred concurrently and stored in ${((Date.now() - started) / 1000).toFixed(1)} seconds over the server test connection`);
  for (const [name, path, minutes] of [['real-five-minutes.mp4', long5, 5], ['real-ten-minutes.mp4', long10, 10]]) {
    await requireSaved(await upload(a, name, path), `${minutes}-minute moving video`);
    await verifiedFile(a, name, fs.statSync(path).size);
    checks.push(`Actual ${minutes}-minute moving video with ${minutes * 60 * 4} encoded frames uploaded and storage-verified after onboarding submission`);
  }
  assert((await rows('creator_files', a, 'id')).length === 5 && (await rows('creator_files', b, 'id')).length === 0, 'Unexpected number of fixture uploads');
  assert((await rows('creator_applications', a, 'status'))[0]?.status === 'submitted', 'Uploads changed application approval status');
  assert((await account(a))[0]?.account_status === 'applicant', 'Uploads changed account approval status');
}
async function cleanFixture(fixture) {
  if (!fixture.authId) {
    assert(!fixture.authCreationAttempted, 'Auth creation result was uncertain; cleanup requires a scoped lookup');
    return;
  }
  const lookup = await apiResponse('/auth/v1/admin/users/' + fixture.authId);
  assert(lookup.ok, 'Cleanup auth ownership lookup failed');
  const data = await lookup.json(); const user = data.user || data;
  assert(user.id === fixture.authId && user.email === fixture.email && user.app_metadata?.moxy_upload_check === RUN, 'Cleanup auth ownership guard failed');
  const existing = await account(fixture);
  assert(existing.length <= 1 && existing.every(row => row.auth_user_id === fixture.authId && row.email === fixture.email && row.source === 'twin' && row.account_status === 'applicant'), 'Cleanup account ownership guard failed');
  assert((await api(rest('agency_memberships', { select: 'user_id', user_id: `eq.${fixture.authId}` }))).length === 0, 'Cleanup stopped: synthetic auth user gained operator access');
  assert((await rows('creator_clone_links', fixture, 'clone_id')).length === 0, 'Cleanup stopped: synthetic account gained a live clone');
  // This also finds an upload that reached Storage but failed before its file row.
  const prefix = `creators/${fixture.id}/content_sfw_video`;
  const objects = await api('/storage/v1/object/list/onboarding-content', { method: 'POST', body: { prefix, limit: 100, offset: 0 } });
  assert(Array.isArray(objects) && objects.length < 100 && objects.every(object => object.id && typeof object.name === 'string' && !object.name.includes('/') && !object.name.includes('..')), 'Cleanup encountered unexpected synthetic storage entries');
  const paths = objects.map(object => prefix + '/' + object.name);
  const saved = await rows('creator_files', fixture, 'bucket,storage_path');
  assert(saved.every(file => file.bucket === 'onboarding-content' && file.storage_path.startsWith(prefix + '/') && paths.includes(file.storage_path)), 'Cleanup file rows reference an unexpected object');
  if (paths.length) await api('/storage/v1/object/onboarding-content', { method: 'DELETE', body: { prefixes: paths } });
  assert((await api('/storage/v1/object/list/onboarding-content', { method: 'POST', body: { prefix, limit: 100, offset: 0 } })).length === 0, 'Synthetic objects remained after cleanup');
  if (fixture.cookie) {
    const logout = await page('/creator-auth/logout', fixture, { method: 'POST' });
    assert(logout.status === 303 && logout.headers.getSetCookie().some(cookie => cookie.startsWith('twin_creator_session=;') && /Max-Age=0/i.test(cookie)), 'Synthetic browser session did not clear');
  }
  for (const table of CHILD_TABLES) await api(rest(table, { creator_account_id: `eq.${fixture.id}` }), { method: 'DELETE' });
  await api(rest('creator_accounts', { id: `eq.${fixture.id}`, auth_user_id: `eq.${fixture.authId}`, email: `eq.${fixture.email}` }), { method: 'DELETE' });
  assert((await account(fixture)).length === 0, 'Synthetic account remained after deletion');
  for (const table of CHILD_TABLES) assert((await rows(table, fixture, 'creator_account_id')).length === 0, 'Synthetic child rows remained after deletion');
  await api('/auth/v1/admin/users/' + fixture.authId, { method: 'DELETE', body: { should_soft_delete: false } });
  assert((await apiResponse('/auth/v1/admin/users/' + fixture.authId)).status === 404, 'Synthetic auth identity remained after deletion');
  // The app validates current account ownership on every request; old signed
  // creator cookies must therefore be unusable after account deletion.
  if (fixture.cookie) {
    const response = await page('/creator-auth/upload', fixture, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData() });
    assert(response.status === 401, 'Deleted synthetic creator session remained usable');
  }
  fixture.cookie = undefined; fixture.password = undefined;
}
async function run() {
  let failure;
  try { await main(); } catch (error) { failure = error instanceof CheckError ? error.message : 'Unexpected check failure; details suppressed'; }
  let cleanupFailed = false;
  const cleanupErrors = [];
  for (const fixture of fixtures) {
    try { await cleanFixture(fixture); } catch (error) { cleanupFailed = true; cleanupErrors.push(error instanceof CheckError ? error.message : "Unexpected cleanup error"); }
  }
  if (staged) await rm(staged, { recursive: true, force: true }).catch(() => { cleanupFailed = true; });
  if (cleanupFailed) failure = (failure ? failure + '; ' : '') + 'Exact synthetic fixture cleanup needs attention';
  console.log(JSON.stringify({ passed: !failure, checks, ...(failure ? { error: failure } : {}), synthetic_fixtures_removed: !cleanupFailed, ...(cleanupFailed ? { cleanup_run: RUN, cleanup_errors: cleanupErrors } : {}), credentials_logged: false }));
  if (failure) process.exitCode = 1;
}
if (require.main === module) run();
