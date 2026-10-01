/* Run only inside the labelled FLIRT dashboard. No credentials or customer data logged. */
const { randomBytes, randomUUID } = require('node:crypto');
const PROJECT = 'lkmfwpqegjluirfusnaw';
const ORIGIN = 'https://dashboard.flirtaiagency.com';
const BASE = 'http://127.0.0.1:3001';
const API = `https://${PROJECT}.supabase.co`;
const key = process.env.SUPABASE_SERVICE_KEY;
const fixtures = [];
const objects = [];
const checks = [];
function assert(ok, label) { if (!ok) throw new Error(label); }
async function request(url, options = {}) { return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000), ...options }); }
async function api(path, options = {}) {
  const r = await request(API + path, { ...options, headers: { apikey: key, ...options.headers } });
  assert(r.ok, `FLIRT API check failed (${r.status})`);
  return r.status === 204 ? null : r.json();
}
async function page(path, cookie, options = {}) {
  return request(BASE + path, { ...options, headers: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
}
function session(response) {
  const set = response.headers.getSetCookie().find(v => v.startsWith('twin_creator_session='));
  assert(set && /HttpOnly/i.test(set) && /Secure/i.test(set) && /SameSite=lax/i.test(set), 'Secure creator cookie missing');
  return set.split(';')[0];
}
async function accountRows(email) { return api('/rest/v1/creator_accounts?select=id,auth_user_id&email=eq.' + encodeURIComponent(email)); }
async function signup(suffix) {
  const fixture = { email: `flirt-smoke-${Date.now()}-${randomBytes(6).toString('hex')}-${suffix}@example.com`, password: randomBytes(24).toString('hex') };
  fixtures.push(fixture);
  assert((await accountRows(fixture.email)).length === 0, 'Synthetic account already exists');
  const r = await page('/creator-auth/signup', null, { method: 'POST', body: new URLSearchParams({ display_name: 'FLIRT deployment check', email: fixture.email, password: fixture.password }) });
  const rows = await accountRows(fixture.email);
  if (rows.length === 1) Object.assign(fixture, rows[0]);
  assert(r.status === 303 && r.headers.get('location') === ORIGIN + '/creator', 'Creator signup did not reach onboarding');
  assert(fixture.id && fixture.auth_user_id, 'Creator signup did not persist');
  fixture.cookie = session(r);
  return fixture;
}
async function draft(fixture, name, revision = '', extra = {}) {
  return page('/creator-auth/onboarding/draft', fixture.cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'personal-contact', answers: { full_name: name, preferred_name: name }, revision, ...extra }) });
}
async function application(fixture) {
  const rows = await api('/rest/v1/creator_applications?select=answers,updated_at&creator_account_id=eq.' + fixture.id);
  assert(rows.length === 1, 'Onboarding draft missing');
  return rows[0];
}
async function main() {
  assert(process.env.FLIRT_SUPABASE_PROJECT_REF === PROJECT && process.env.SUPABASE_URL === API && process.env.DASHBOARD_PUBLIC_ORIGIN === ORIGIN, 'Refusing a non-FLIRT runtime');
  for (const path of ['/creator/signup', '/creator/login']) {
    const r = await page(path);
    assert(r.status === 200 && (await r.text()).includes('FLIRT'), 'FLIRT public auth page failed');
  }
  checks.push('FLIRT signup and login pages');
  const unauth = await page('/creator');
  assert([303,307,308].includes(unauth.status) && /creator\/login/.test(unauth.headers.get('location')), 'Anonymous dashboard access allowed');
  const forged = await page('/creator-auth/onboarding/draft', 'twin_creator_session=invalid.invalid', { method:'POST',headers:{'Content-Type':'application/json'},body:'{}' });
  assert([401,403].includes(forged.status), 'Forged creator cookie accepted');
  checks.push('Anonymous and forged-session access denied');
  const a = await signup('a'), b = await signup('b');
  checks.push('Two creator signups persisted in FLIRT only');
  for (const fixture of [a,b]) {
    const home = await page('/creator', fixture.cookie);
    assert([303,307,308].includes(home.status) && /creator\/onboarding/.test(home.headers.get('location')), 'New creator was not sent to onboarding');
    const onboarding = await page('/creator/onboarding', fixture.cookie);
    assert(onboarding.status === 200, 'Creator onboarding page failed');
    const login = await page('/creator-auth/login', null, { method:'POST',body:new URLSearchParams({email:fixture.email,password:fixture.password,next:'/creator'}) });
    assert(login.status === 303 && login.headers.get('location') === ORIGIN + '/creator', 'Creator password login failed');
    fixture.cookie = session(login);
  }
  checks.push('Password login and onboarding redirects');
  for (const [fixture,name] of [[a,'FLIRT test A'],[b,'FLIRT test B']]) {
    const saved = await draft(fixture,name);
    assert(saved.status === 200 && (await saved.json()).ok, 'Onboarding autosave failed');
  }
  const originalB = await application(b);
  const savedA = await application(a);
  const tamper = await draft(a,'FLIRT test A updated',savedA.updated_at,{creator_account_id:b.id,accountId:b.id});
  assert(tamper.status === 200, 'Creator own draft update failed');
  assert((await application(b)).answers.full_name === originalB.answers.full_name, 'Cross-creator draft modification detected');
  assert((await application(a)).answers.full_name === 'FLIRT test A updated', 'Own draft update missing');
  const cross = await page('/creator?clone=' + randomUUID(), a.cookie);
  assert(cross.status === 403, 'Unassigned clone access accepted');
  const stale = await draft(a,'Stale update',savedA.updated_at);
  assert(stale.status === 409, 'Stale onboarding update accepted');
  const origin = await page('/creator-auth/onboarding/draft', a.cookie, {method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});
  assert(origin.status === 403, 'Foreign-origin onboarding write accepted');
  checks.push('Onboarding persistence, account separation, stale-write and origin protection');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1cAAAAASUVORK5CYII=','base64');
  for (const bucket of ['media','onboarding-content','voice-samples']) {
    const path = `flirt-deployment-check/${randomUUID()}.png`;
    await api(`/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{'Content-Type':'image/png'},body:png});
    objects.push({bucket,path});
    const publicGet = await request(`${API}/storage/v1/object/public/${bucket}/${path}`);
    assert(!publicGet.ok,'A private bucket allowed public access');
    const signed = await api(`/storage/v1/object/sign/${bucket}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60})});
    assert(typeof signed.signedURL === 'string' && signed.signedURL.startsWith('/object/sign/'),'Storage signed URL missing');
    assert((await request(API+'/storage/v1'+signed.signedURL)).ok,'Signed private storage download failed');
  }
  checks.push('Three private buckets: upload, signed download, public access denied');
}
async function cleanup() {
  const errors=[];
  for(const object of objects) {
    try { await api(`/storage/v1/object/${object.bucket}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[object.path]})}); }
    catch { errors.push('Synthetic storage cleanup failed'); }
  }
  for(const fixture of fixtures) {
    try {
      if (!fixture.id) { const rows=await accountRows(fixture.email); if(rows.length===1) Object.assign(fixture,rows[0]); }
      if (fixture.id) {
        await api('/rest/v1/creator_accounts?id=eq.'+fixture.id+'&email=eq.'+encodeURIComponent(fixture.email),{method:'DELETE'});
        await api('/auth/v1/admin/users/'+fixture.auth_user_id,{method:'DELETE'});
        assert((await accountRows(fixture.email)).length===0,'Synthetic creator cleanup failed');
      }
    } catch { errors.push('Synthetic creator cleanup failed'); }
  }
  assert(errors.length===0,errors.join('; '));
}
(async()=>{
  let failure;
  try { await main(); } catch(error) { failure=error.message; }
  try { await cleanup(); } catch(error) { failure=(failure ? failure+'; ' : '')+error.message; }
  if(failure) { console.log(JSON.stringify({passed:false,checks,error:failure,credentials_logged:false}));process.exitCode=1; }
  else console.log(JSON.stringify({passed:true,checks,synthetic_fixtures_removed:true,credentials_logged:false}));
})();

