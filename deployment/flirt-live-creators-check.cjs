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
  // Every assigned creator must render the same individually scoped Overview.
  for (const overviewId of CLONES) {
    const overviewResponse = await page('/api/creator-overview?clone=' + overviewId);
    assert(overviewResponse.status === 200, 'Assigned creator Overview must load');
    const overview = await overviewResponse.json();
    assert(overview.presentation?.id === overviewId, 'Overview must use the selected creator');
    const slots = [overview.presentation.hero, overview.presentation.avatar, ...overview.presentation.library].filter(Boolean);
    assert(new Set(slots.map(p => p.id)).size === slots.length, 'Every Overview photo placement must be different');
    const ownPhotos = await rows(live.url, live.key, 'photos?select=id&clone_id=eq.' + overviewId);
    assert(slots.every(p => p.id === 'profile-' + overviewId || ownPhotos.some(own => own.id === p.id)), 'Overview photos must belong to this creator');
    if (overviewId === 'e0464c19-d5b7-4154-ba46-a60a2ed2a8a3' && !ownPhotos.length) assert(!overview.presentation.hero && !overview.presentation.library.length, 'A creator without photos must use the honest empty state');
    else assert(overview.presentation.hero && overview.presentation.library.length === 3, 'Reviewed creator photos must be available');
    const fanCountResponse = await request(live.url + '/rest/v1/users?select=id&clone_id=eq.' + overviewId + '&or=(is_test.is.null,is_test.eq.false)', {method:'HEAD',headers:{apikey:live.key,Authorization:`Bearer ${live.key}`,Prefer:'count=exact'}});
    assert(fanCountResponse.ok && Number(fanCountResponse.headers.get('content-range')?.split('/')[1]) === overview.audience.total, 'Overview must show all recorded fans excluding test records');
    const selectedOverview = await page('/revenue',{headers:{Cookie:cookie+'; clone_scope='+overviewId}});
    const selectedHtml = await selectedOverview.text();
    assert(selectedOverview.ok && selectedHtml.includes('data-creator-overview="'+overviewId+'"') && selectedHtml.includes('Total fans') && selectedHtml.includes('Not connected') && selectedHtml.includes('Content library'), 'Every selected Overview must render the shared layout');
    for (const slot of slots) {
      const response = slot.url.startsWith('/api/creator-overview/photo?') ? await page(slot.url) : await request(slot.url, {method:'HEAD'});
      assert(response.ok && response.headers.get('content-type')?.startsWith('image/'), 'Every reviewed portrait must load');
    }
  }
  assert((await page('/api/creator-overview?clone='+outside)).status === 403, 'Overview must reject an unassigned creator');
  assert((await page('/api/creator-overview/photo?clone='+outside+'&slot=hero')).status === 403, 'Portrait endpoint must reject an unassigned creator');
  assert((await page('/api/creator-overview/photo?clone='+CLONES[0]+'&slot=unreviewed')).status === 404, 'Portrait endpoint must reject arbitrary media slots');
  checks.push('All six creator Overviews, unique owned photos, all-time fans and portrait isolation verified live');
  const agencyResponse = await page('/api/creator-overview');
  assert(agencyResponse.ok, 'Agency overview data must load');
  const agency = await agencyResponse.json();
  assert(agency.creators.length === CLONES.length && agency.creators.every(c => CLONES.includes(c.id)), 'Agency overview must use exactly assigned creators');
  assert(agency.audience.total === agency.creators.reduce((sum,c)=>sum+c.totalFans,0), 'Agency fan total must equal per-creator all-time fans');
  const agencyCountResponse = await request(live.url+'/rest/v1/users?select=id&clone_id=in.('+CLONES.join(',')+')&or=(is_test.is.null,is_test.eq.false)',{method:'HEAD',headers:{apikey:live.key,Authorization:`Bearer ${live.key}`,Prefer:'count=exact'}});
  assert(agencyCountResponse.ok && Number(agencyCountResponse.headers.get('content-range')?.split('/')[1]) === agency.audience.total, 'Agency fan count must match the database including imports and excluding tests');
  assert(agency.creators.filter(c=>c.heroPhoto).length===3,'The agency retains three approved hero photo selections');
  const agencyPhotos = agency.creators.flatMap(c=>[c.portrait,c.cardPhoto,c.heroPhoto]).filter(Boolean);
  assert(new Set(agencyPhotos.map(p=>p.id)).size===agencyPhotos.length,'Agency photos must all be different');
  for(const photo of agencyPhotos) assert(new URL(photo.url).hostname===`${PROJECT}.supabase.co` && (await request(photo.url,{method:'HEAD'})).ok,'Every agency portrait must load from its original private storage');
  const agencyPage = await page('/revenue'); const agencyHtml = await agencyPage.text();
  assert(agencyPage.ok && agencyHtml.includes('data-agency-overview="flirt"') && agencyHtml.includes('Agency overview') && agencyHtml.includes('Compare creators') && CLONES.every(id=>agencyHtml.includes('data-agency-hero-creator="'+id+'"')) && expected.every(c=>agencyHtml.includes(c.name)), 'Live All creators Overview must render its agency layout');
  const monthResponse=await page('/api/dashboard?period=1M&fresh=1');
  assert(monthResponse.ok,'Default 30-day agency earnings must load');
  const month=await monthResponse.json();
  assert(month.clones.length===CLONES.length && month.clones.every(c=>CLONES.includes(c.id)), 'Monthly agency report must stay scoped');
  assert(Math.abs(month.totals.stars-Object.values(month.perClone).reduce((sum,c)=>sum+c.stars,0))<.001,'Monthly combined earnings must equal creator earnings');
  assert(Math.abs(month.totals.stars-month.series.reduce((sum,row)=>sum+CLONES.reduce((n,id)=>n+(Number(row[id])||0),0),0))<.001,'Monthly chart must equal total earnings');
  assert(Math.abs(data.totals.stars-Object.values(data.perClone).reduce((sum,c)=>sum+c.stars,0))<.001,'Combined earnings must equal selected creator earnings');
  assert(Math.abs(data.totals.stars-data.series.reduce((sum,row)=>sum+CLONES.reduce((n,id)=>n+(Number(row[id])||0),0),0))<.001,'Combined chart must match total earnings');
  checks.push('Agency Overview: assigned creators, exact all-time fans, distinct private photos, and reconciled combined earnings verified live');
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

