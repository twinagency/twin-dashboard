/* Runs inside FLIRT. Only check labels and selected creator names are logged. */
const { configuration, CLONES, PROJECT } = require('./deployment/flirt-live-twin.cjs');
const ORIGIN = 'https://dashboard.flirtaiagency.com';
const LOCAL = 'lkmfwpqegjluirfusnaw';
const checks = [];
function assert(ok, label) { if (!ok) throw new Error(label); }
async function request(url, options = {}) { return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120000), ...options }); }
async function rows(url, key, path) {
  const response = await request(url + '/rest/v1/' + path, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  assert(response.ok, `Readback database returned ${response.status}`);
  return response.json();
}
async function main() {
  assert(process.env.FLIRT_BACKEND_ENABLED === 'true' && process.env.FLIRT_SUPABASE_PROJECT_REF === LOCAL && process.env.SUPABASE_URL === `https://${LOCAL}.supabase.co` && process.env.DASHBOARD_PUBLIC_ORIGIN === ORIGIN, 'Refusing a non-FLIRT runtime');
  const live = configuration();
  const expected = await rows(live.url, live.key, `clones?select=id,name,status&id=in.(${CLONES.join(',')})`);
  assert(expected.length === CLONES.length && new Set(expected.map(row => row.id)).size === CLONES.length && expected.every(row => CLONES.includes(row.id) && row.status === 'active'), 'Selected live creators must all exist and stay active');
  const outside = (await rows(live.url, live.key, `clones?select=id&id=not.in.(${CLONES.join(',')})&limit=1`))[0]?.id;
  assert(outside, 'An unselected creator is required for isolation verification');
  const login = await request(ORIGIN + '/admin-auth', { method: 'POST', headers: { Origin: ORIGIN }, body: new URLSearchParams({ password: process.env.DASHBOARD_PASSWORD, next: '/clones' }) });
  const signed = login.headers.getSetCookie().find(value => value.startsWith('allie_admin_session='));
  assert(login.status === 303 && signed && /HttpOnly/i.test(signed) && /Secure/i.test(signed), 'FLIRT admin sign-in failed');
  const cookie = signed.split(';')[0];
  const page = (path, options = {}) => request(ORIGIN + path, { ...options, headers: { Cookie: cookie, Origin: ORIGIN, ...options.headers } });
  const listing = await page('/clones');
  const html = await listing.text();
  assert(listing.status === 200 && expected.every(row => html.includes(row.name)), 'FLIRT must render all selected live creators');
  const stats = await page('/api/dashboard?period=1D&fresh=1');
  assert(stats.status === 200, 'Live dashboard statistics failed');
  const data = await stats.json();
  assert(data.clones?.length === CLONES.length && new Set(data.clones.map(row => row.id)).size === CLONES.length && data.clones.every(row => CLONES.includes(row.id)), 'Live statistics must contain exactly the selected creators');
  assert(Array.isArray(data.recent) && data.recent.every(row => CLONES.includes(row.cloneId)), 'Live payments must stay in the selected scope');
  checks.push('Authenticated FLIRT renders exactly the selected existing live creators and their live statistics');
  for (const id of CLONES) assert((await page(`/clones/${id}`)).status === 200, 'Selected creator settings failed to open');
  checks.push('All selected live creator settings pages open');
  for (const id of CLONES) {
    const selection = await page('/agency/clone-scope', { method: 'POST', body: new URLSearchParams({ clone: id, next: '/revenue' }) });
    assert(selection.status === 303 && selection.headers.getSetCookie().some(value => value.startsWith('clone_scope=' + id)), 'Creator selector must work for every selected creator with the FLIRT operator session');
  }
  assert((await page('/agency/clone-scope', { method: 'POST', body: new URLSearchParams({ clone: outside }) })).status === 403, 'Creator selector must deny unassigned creators');
  checks.push('Creator selector accepts assigned creators and rejects other creators');
  for (const path of [`/clones/${outside}`, `/api/dashboard?clone=${outside}`]) assert((await page(path)).status === 403, 'Unselected creator read was not denied');
  assert((await page(`/api/compile?cloneId=${outside}`, { method: 'POST' })).status === 403, 'Unselected creator action was not denied');
  assert((await page('/settings')).status === 403, 'Global Twin settings must remain restricted');
  checks.push('Other Twin creators, writes and global settings are denied');
  const photo = (await rows(live.url, live.key, `photos?select=storage_path&clone_id=in.(${CLONES.join(',')})&limit=1`))[0];
  assert(photo?.storage_path, 'Selected creator media is missing');
  const media = await page('/api/media-sign?path=' + encodeURIComponent(photo.storage_path));
  assert(media.status === 200, 'Live media signing failed');
  const mediaUrl = new URL((await media.json()).url);
  assert(mediaUrl.hostname === `${PROJECT}.supabase.co` && (await request(mediaUrl)).ok, 'Live media URL must read the existing Twin object');
  checks.push('Existing live media signs and loads from its original storage');
  const localClones = await rows(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, 'clones?select=id&limit=1');
  assert(localClones.length === 0, 'FLIRT must not copy or run duplicate bot records');
  checks.push('No duplicate bot records were created in FLIRT');
  const publicPage = await page('/creator/signup');
  assert(publicPage.status === 200, 'Local creator signup must remain available with an admin cookie');
  const logout = await page('/agency/logout', { method: 'POST' });
  assert([303,307].includes(logout.status) && new URL(logout.headers.get('location'), ORIGIN).pathname === '/login' && logout.headers.getSetCookie().some(value => value.startsWith('allie_admin_session=;')), 'FLIRT sign-out must clear the admin session');
  checks.push('Local signup and operator sign-out work');
  console.log(JSON.stringify({ passed: true, creators: expected.map(row => row.name).sort(), checks, credentials_logged: false, database_records_copied: false }));
}
main().catch(error => { console.log(JSON.stringify({ passed: false, error: error.message, checks, credentials_logged: false })); process.exitCode = 1; });

