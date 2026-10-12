const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const accountId = '4c1d6df9-4a40-453c-850a-dc838f6dea13';
const agencyId = 'bc670215-110b-4ea0-8f5c-af3dfe21d253';
const fixtureKey = 'a'.repeat(64);
const reissuedFixtureKey = 'c'.repeat(64);
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { if (key in mocks) return mocks[key]; throw Error(`Unexpected dependency: ${key}`); }, Buffer, URL, Date, Set, console }, { filename: file });
  return exports;
}
let account, assignment, link, calls, creates, deletes, signed;
function reset() { account = { id: accountId, auth_user_id: 'review-auth', account_status: 'applicant', source: 'admin' }; assignment = { agency_id: agencyId, partner_agencies: { name: 'Moxy', active: true } }; link = null; calls = []; creates = deletes = signed = 0; }
const db = {
  auth: { admin: {
    async createUser(args) { creates++; assert.equal(args.email_confirm, true); assert.match(args.email, /@example\.invalid$/); assert.ok(args.password.length > 40); return { data: { user: { id: 'review-auth' } }, error: null }; },
    async deleteUser() { deletes++; return { error: null }; }
  } },
  from(table) {
    const q = {
      select() { return q; }, eq(key, value) { calls.push([table, key, value]); return q; }, order() { return q; }, limit() { return q; },
      async maybeSingle() { return { data: table === 'creator_accounts' ? account : table === 'creator_agency_assignments' ? assignment : table === 'creator_clone_links' ? link : null, error: null }; },
      async insert(row) { assert.equal(table, 'creator_accounts'); assert.equal(row.id, accountId); account = row; return { error: null }; },
      async upsert(row, options) { assert.equal(row.creator_account_id, accountId); assert.equal(options.ignoreDuplicates, true); assert.ok(['creator_agency_assignments','creator_onboarding_progress'].includes(table)); return { error: null }; }
    }; return q;
  }
};
const identity = load('lib/creator-dashboard-identity.ts', {
  './creator-application-state': { creatorApplicationState: () => ({ label: 'Draft', submitted: false }) },
  './creator-session': { verifyCreatorSession: async () => ({ accountId, userId: 'review-auth' }) },
  './supabase-service': { serviceClient: () => db },
  './creator-demo-policy': { isZaneDemo: () => false },
  './creator-intake-policy': { creatorIntakeOptional: () => true },
  './creator-live-demo-policy': { isBriLiveDemoAccount: () => false }
});
const routeSource = fs.readFileSync('app/onboarding-review/[key]/route.ts','utf8');
const deployedDigest = routeSource.match(/const KEY_SHA256 = "([a-f0-9]{64})"/)[1];
const reissuedDigest = routeSource.match(/const REISSUED_KEY_SHA256 = "([a-f0-9]{64})"/)[1];
const route = load('app/onboarding-review/[key]/route.ts', {
  'node:crypto': { ...crypto, createHash: alg => ({ update: key => ({ digest: () => key === fixtureKey ? Buffer.from(deployedDigest,'hex') : key === reissuedFixtureKey ? Buffer.from(reissuedDigest,'hex') : crypto.createHash(alg).update(key).digest() }) }) },
  'next/server': { NextResponse },
  '@/lib/supabase-service': { serviceClient: () => db },
  '@/lib/creator-dashboard-identity': identity,
  '@/lib/creator-session': { CREATOR_SESSION_COOKIE: 'creator', creatorCookieOptions: () => ({ httpOnly: true, secure: true, path: '/', sameSite: 'lax' }), signCreatorSession: async (id,user) => { assert.equal(id,accountId); assert.equal(user,'review-auth'); signed++; return 'signed-review-session'; } },
  '@/lib/creator-routing': { CREATOR_PORTAL_COOKIE: 'portal', creatorPortalCookieOptions: () => ({ httpOnly: true, path: '/' }) },
  '@/lib/form-origin': { dashboardOrigin: () => 'https://dashboard.lynqai.co' },
  '@/lib/agency-policy': { AGENCY_COOKIE: 'agency' }, '@/lib/agency-brand': { AGENCY_PORTAL_COOKIE: 'agency_portal' },
  '@/lib/session': { SESSION_COOKIE: 'admin' }, '@/lib/clone-scope': { CLONE_SCOPE_COOKIE: 'clone' }
});
function get(key=fixtureKey, query='', headers={}) { return route.GET(new NextRequest(`https://dashboard.lynqai.co/onboarding-review/${key}${query}`,{headers}), { params: Promise.resolve({key}) }); }
(async () => {
  reset(); assert.equal((await get('b'.repeat(64))).status,404); assert.equal((await get('bad')).status,404); assert.equal((await get(fixtureKey,'',{'next-action':'forged'})).status,404); assert.equal((await route.HEAD()).status,404); assert.equal(calls.length,0); assert.equal(creates,0); assert.equal(signed,0);
  reset(); let r=await get(); assert.equal(r.status,303); assert.equal(r.headers.get('location'),'https://dashboard.lynqai.co/creator/onboarding'); assert.match(r.headers.get('set-cookie'),/HttpOnly/); assert.equal(r.headers.get('cache-control'),'private, no-store'); assert.equal(r.headers.get('referrer-policy'),'no-referrer'); assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow'); assert.equal(creates,0);
  r=await get(fixtureKey,'?step=content&next=https://evil.invalid'); assert.equal(r.headers.get('location'),'https://dashboard.lynqai.co/creator/onboarding?step=content'); assert.equal(creates,0); assert.equal(deletes,0);
  reset(); r=await get(reissuedFixtureKey,'?step=content'); assert.equal(r.status,303); assert.equal(r.headers.get('location'),'https://dashboard.lynqai.co/creator/onboarding?step=content'); assert.equal(creates,0); assert.equal(signed,1);
  reset(); account.account_status='archived'; assert.equal((await get(reissuedFixtureKey)).status,404); assert.equal(signed,0);
  reset(); account=null; r=await get(); assert.equal(r.status,303); assert.equal(creates,1); assert.equal(account.id,accountId); await get(); assert.equal(creates,1);
  reset(); account.account_status='archived'; assert.equal((await get()).status,404); assert.equal(creates,0); assert.equal(signed,0);
  reset(); account.source='twin'; assert.equal((await get()).status,404); assert.equal(signed,0);
  reset(); assignment={ agency_id:'some-other-agency', partner_agencies:{ name:'Other',active:true } }; assert.equal(await identity.creatorDashboardIdentity('token'),null); assert.equal((await get()).status,404);
  reset(); link={clone_id:'real-clone',clones:{id:'real-clone',name:'Real'}}; assert.equal(await identity.creatorDashboardIdentity('token'),null); assert.equal((await get()).status,404);
  reset(); const own=await identity.creatorDashboardIdentity('token'); assert.equal(own.accountId,accountId); assert.equal(own.cloneIds.length,0); assert.equal(own.name,'Moxy');
  console.log('PASS: permanent review entry, invalid key/method denial, one-account provisioning, session renewal, saved-data preservation, revocation and live-creator isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
