"use strict";
// Wire fake for deployment/creator-flow-live-check.cjs: the brand dashboard origin plus Supabase REST/Auth/Storage,
// trimmed from deployment/creator-flow-live-check.test.cjs to flow-only mode (no uploads, so ffmpeg is never reached).
// Every value is synthetic. Anything outside the two fake origins throws; a test must call blockNetwork() BEFORE
// requiring the runner so no real fetch can ever run. PostgREST filters are honoured exactly (eq./neq. only), so a
// widened cleanup delete really deletes what it matches; like pg-safeupdate, only a DELETE with zero filters is refused.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomInt, createHash } = require('node:crypto');

const SHA = 'a'.repeat(40);
const MOXY_AGENCY = '00000000-0000-4000-8000-0000000000a1';
const FIXTURE_EMAIL = /^contact\+creator-audit-.+@twinagency\.co$/;
const FIXTURE_LABEL = /^Creator audit /;
const RESERVED = new Set(['select', 'limit', 'order', 'offset']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function blocked() { throw new Error('network disabled in this test: only the wire fake may answer'); }
function blockNetwork() { global.fetch = blocked; }

function envFor(brand, BRANDS) {
  return { GIT_SHA: SHA, SUPABASE_URL: `https://${BRANDS[brand].project}.supabase.co`,
    SUPABASE_SERVICE_KEY: 'fake-service-key-synthetic', DASHBOARD_PASSWORD: 'fake-operator-password-synthetic',
    DASHBOARD_PUBLIC_ORIGIN: BRANDS[brand].origin,
    ...(brand === 'flirt' ? { FLIRT_BACKEND_ENABLED: 'true', FLIRT_SUPABASE_PROJECT_REF: BRANDS.flirt.project } : {}) };
}

function makeFake(brand, BRANDS, opts = {}) {
  const origin = BRANDS[brand].origin, env = envFor(brand, BRANDS), supabase = env.SUPABASE_URL;
  const agency = brand === 'flirt' ? BRANDS.flirt.agency : MOXY_AGENCY;
  const db = { creator_accounts: [], creator_agency_codes: [], creator_files: [], creator_agency_assignments: [], creator_applications: [],
    partner_agencies: [{ id: MOXY_AGENCY, slug: 'moxy', name: 'Moxy', active: true }],
    creator_consents: [], creator_clone_links: [], creator_upload_receipts: [], photos: [], videos: [], photo_bundle_items: [], video_sequence_jobs: [] };
  const auth = new Map(), objects = new Map(), sessions = new Map();
  const deleteViolations = [], fakeErrors = [], requests = [], orphanAuthEmails = [];
  const now = () => new Date().toISOString();
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const redirect = (target, cookie) => new Response(null, { status: 303, headers: { Location: new URL(target, origin).href, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
  const violation = message => { deleteViolations.push(message); throw new Error('fake refused: ' + message); };

  function filtersOf(url) {
    const out = [];
    for (const [key, value] of url.searchParams) {
      if (RESERVED.has(key)) continue;
      const match = /^(eq|neq)\.([\s\S]*)$/.exec(value);
      if (!match) throw new Error(`fake PostgREST: unsupported filter on ${key}`);
      out.push([key, match[1], match[2]]);
    }
    return out;
  }
  const matches = (row, filters) => filters.every(([key, op, value]) => (op === 'eq') === (String(row[key]) === value));
  const sessionOwner = headers => {
    const cookie = headers.get('cookie') || '';
    const value = /(?:^|;\s*)twin_creator_session=([^;]+)/.exec(cookie)?.[1];
    return value ? db.creator_accounts.find(row => row.id === sessions.get(value)) : undefined;
  };
  const newSession = accountId => { const value = 'fake-session-' + randomUUID(); sessions.set(value, accountId); return `twin_creator_session=${value}; HttpOnly; Secure`; };

  function appRoute(url, method, headers, body) {
    const p = url.pathname;
    if (p === '/admin-auth') return redirect('/agency/creator-invites', 'allie_admin_session=fake-operator-session; Secure; HttpOnly');
    if (p === '/agency-admin/creator-codes') return new Response(`<select name="agency"><option value="${agency}">Moxy</option></select>`);
    if (p === '/agency/creator-invites') return new Response('Generate invite link');
    if (['/agency-admin/creator-codes/manage', '/agency/creator-invites/manage'].includes(p)) {
      if (headers.get('cookie') !== 'allie_admin_session=fake-operator-session') throw new Error('fake: invite manage without operator session');
      let code = ''; for (let i = 0; i < 10; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      db.creator_agency_codes.push({ id: randomUUID(), agency_id: agency, label: body.get('label'), code, code_hash: createHash('sha256').update(code).digest('hex'), max_uses: 1, uses: 0 });
      return redirect('/agency/creator-invites?created=' + code);
    }
    if (p === '/creator-auth/signup') {
      const email = body.get('email'), name = body.get('display_name'), code = body.get('agency_code');
      if (!name || email === 'invalid') return json({ error: 'invalid' }, 400);
      if (db.creator_accounts.some(row => row.email === email)) return json({ error: 'exists' }, 409);
      const invite = code ? db.creator_agency_codes.find(row => row.code === code) : undefined;
      if (brand === 'moxy' && !invite) return json({ error: 'invite_required' }, 400);
      const authId = randomUUID();
      auth.set(authId, { id: authId, email, email_confirmed_at: now() });
      if (opts.orphanAuthOn?.(email)) {
        orphanAuthEmails.push(email);
        // app/creator-auth/signup/route.ts:118-128: provisioning failed and the ownership readback errored, so the
        // route keeps the Auth user (never deletes after a possibly committed transaction) and redirects "incomplete".
        const target = new URL('/creator/signup', origin); target.searchParams.set('error', 'incomplete'); if (code) target.searchParams.set('code', code);
        return redirect(target.pathname + target.search);
      }
      if (invite) invite.uses++;
      const id = randomUUID();
      db.creator_accounts.push({ id, auth_user_id: authId, email, display_name: name, created_at: now(), account_status: 'applicant' });
      db.creator_agency_assignments.push({ creator_account_id: id, agency_id: invite?.agency_id || agency });
      db.creator_applications.push({ creator_account_id: id, status: 'draft', submitted_at: null, updated_at: now(), answers: {} });
      return redirect('/creator/onboarding', newSession(id));
    }
    if (p === '/creator/signup') return new Response('This invitation has no places left.');
    if (p.startsWith('/creator-management')) return redirect(brand === 'moxy' ? '/moxy' : '/twin');
    if (p === '/creator-auth/login') {
      const row = db.creator_accounts.find(item => item.email === body.get('email'));
      if (!row) throw new Error('fake: login for unknown account');
      return redirect(body.get('next'), newSession(row.id));
    }
    if (p === '/creator-auth/logout') {
      const value = /twin_creator_session=([^;]+)/.exec(headers.get('cookie') || '')?.[1]; if (value) sessions.delete(value);
      return redirect(BRANDS[brand].login, 'twin_creator_session=; Max-Age=0; HttpOnly; Secure');
    }
    const owner = sessionOwner(headers);
    if (!owner) return redirect(BRANDS[brand].login);
    const application = db.creator_applications.find(row => row.creator_account_id === owner.id);
    if (p === '/creator-auth/onboarding/draft') {
      const input = JSON.parse(body);
      if (input.revision !== application.updated_at) return json({ error: 'stale' }, 409);
      Object.assign(application, { answers: { ...application.answers, ...input.answers }, updated_at: now() });
      return json({ ok: true, revision: application.updated_at });
    }
    if (p === '/creator-auth/onboarding') { Object.assign(application, { status: 'submitted', submitted_at: now(), updated_at: now() }); return redirect('/creator'); }
    if (p === '/creator/info') return new Response(application.status === 'draft' ? 'Draft / unfinished' : 'Submitted');
    if (['/creator', '/creator/ppvs', '/creator/edit', '/creator/earnings', '/creator/help'].includes(p)) {
      return new Response(`<div data-creator-studio="${brand}"></div><a data-return-to-onboarding>Return to onboarding</a><a data-creator-content-access href="/creator/onboarding?step=content">My uploaded content</a><a data-creator-onboarding-access href="/creator/onboarding">Onboarding details</a>`);
    }
    if (p === '/creator/onboarding') return new Response('<a data-return-to-onboarding>Return to onboarding</a><section>Saved content</section><button data-upload-content>Upload content</button>');
    throw new Error('fake: unexpected application request ' + method + ' ' + p);
  }

  function backendRoute(url, method, body) {
    const p = url.pathname;
    if (p.startsWith('/storage/v1/object/list/')) {
      const bucket = p.split('/').pop(), { prefix, offset, limit } = JSON.parse(body), children = new Map();
      for (const [key, bytes] of objects) {
        if (!key.startsWith(`${bucket}/${prefix}/`)) continue;
        const pieces = key.slice(bucket.length + prefix.length + 2).split('/');
        children.set(pieces[0], pieces.length > 1 ? { name: pieces[0], id: null, metadata: null } : { name: pieces[0], id: randomUUID(), metadata: { size: bytes.length } });
      }
      return json([...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit));
    }
    if (p.startsWith('/storage/v1/object/info/')) {
      const object = objects.get(decodeURIComponent(p.slice('/storage/v1/object/info/'.length)));
      return object ? json({ size: object.length }) : json({ statusCode: '404', error: 'not_found' }, 400);
    }
    if (p.startsWith('/storage/v1/object/') && method === 'DELETE') {
      const bucket = p.split('/').pop(), prefixes = JSON.parse(body || '{}').prefixes;
      if (!Array.isArray(prefixes) || !prefixes.length) violation(`Storage DELETE ${bucket} without any object name`);
      for (const item of prefixes) objects.delete(`${bucket}/${item}`);
      return json([]);
    }
    if (p === '/auth/v1/admin/generate_link') {
      const payload = JSON.parse(body);
      if (!db.creator_accounts.some(row => row.email === payload.email)) throw new Error('fake: recovery link for unknown account');
      return json({ redirect_to: url.searchParams.get('redirect_to') });
    }
    if (p === '/auth/v1/admin/users' && method === 'GET') {
      // GoTrue admin list: 1-based page, per_page (default 50), total in X-Total-Count.
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1), perPage = Math.max(1, Number(url.searchParams.get('per_page')) || 50);
      const all = [...auth.values()];
      return new Response(JSON.stringify({ aud: 'authenticated', users: all.slice((page - 1) * perPage, page * perPage) }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'X-Total-Count': String(all.length) } });
    }
    if (p.startsWith('/auth/v1/admin/users/')) {
      const id = p.split('/').pop();
      if (method === 'DELETE') { if (!auth.delete(id)) return json({ code: 'user_not_found' }, 404); return json({}); }
      if (method !== 'GET') throw new Error('fake: unexpected Auth method ' + method);
      return auth.has(id) ? json(auth.get(id)) : json({ code: 'user_not_found' }, 404);
    }
    if (!p.startsWith('/rest/v1/') || p.startsWith('/rest/v1/rpc/')) throw new Error('fake: unexpected backend request ' + method + ' ' + p);
    const table = p.slice('/rest/v1/'.length), rows = db[table];
    if (!rows) throw new Error('fake: unexpected table ' + table);
    const filters = filtersOf(url), hit = rows.filter(row => matches(row, filters));
    if (method === 'DELETE') {
      if (!filters.length) violation(`DELETE ${table} without any filter`);
      db[table] = rows.filter(row => !hit.includes(row));
      if (table === 'creator_accounts') {
        // ON DELETE CASCADE children of creator_accounts that the runner never deletes itself.
        const gone = new Set(hit.map(row => row.id));
        for (const child of ['creator_agency_assignments', 'creator_applications']) db[child] = db[child].filter(row => !gone.has(row.creator_account_id));
      }
      return new Response(null, { status: 204 });
    }
    if (method !== 'GET') throw new Error('fake: unexpected REST method ' + method);
    const limit = Number(url.searchParams.get('limit'));
    return json(limit > 0 ? hit.slice(0, limit) : hit);
  }

  async function fakeFetch(input, options = {}) {
    const url = new URL(input), method = options.method || 'GET', headers = new Headers(options.headers);
    requests.push({ origin: url.origin, path: url.pathname, method });
    try {
      if (url.origin === origin) return appRoute(url, method, headers, options.body);
      if (url.origin === supabase) {
        if (headers.get('apikey') !== env.SUPABASE_SERVICE_KEY) throw new Error('fake: backend call without the fake service key');
        return backendRoute(url, method, options.body);
      }
      throw new Error('fake: refusing non-fake origin');
    } catch (error) { fakeErrors.push(error.message); throw error; }
  }

  function seedCustomer() {
    const id = randomUUID(), authId = randomUUID(), storagePath = `creators/${id}/content_sfw_video/${randomUUID()}`;
    const customer = { id, authId, email: 'customer.synthetic@example.com', storagePath, label: 'Customer referral synthetic' };
    db.creator_accounts.push({ id, auth_user_id: authId, email: customer.email, display_name: 'Synthetic Customer', created_at: '2026-01-01T00:00:00.000Z', account_status: 'active' });
    auth.set(authId, { id: authId, email: customer.email, email_confirmed_at: '2026-01-01T00:00:00.000Z' });
    db.creator_agency_codes.push({ id: randomUUID(), agency_id: agency, label: customer.label, code: 'CUSTQMRSTV', code_hash: createHash('sha256').update('CUSTQMRSTV').digest('hex'), max_uses: 5, uses: 1 });
    db.creator_files.push({ id: randomUUID(), creator_account_id: id, kind: 'content_sfw_video', original_name: 'customer-clip.mp4', size_bytes: 2048, storage_transfer_status: 'verified', bucket: 'onboarding-content', storage_path: storagePath });
    objects.set(`onboarding-content/${storagePath}`, Buffer.alloc(2048, 7));
    db.creator_agency_assignments.push({ creator_account_id: id, agency_id: agency });
    db.creator_applications.push({ creator_account_id: id, status: 'submitted', submitted_at: '2026-01-02T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z', answers: { preferred_name: 'Synthetic' } });
    return customer;
  }
  function snapshotCustomer(customer) {
    const own = table => db[table].filter(row => row.creator_account_id === customer.id || row.id === customer.id).map(row => ({ ...row }));
    return { account: own('creator_accounts'), auth: auth.get(customer.authId) ? { ...auth.get(customer.authId) } : null,
      invite: db.creator_agency_codes.filter(row => row.label === customer.label).map(row => ({ ...row })),
      files: own('creator_files'), object: objects.get(`onboarding-content/${customer.storagePath}`)?.toString('hex') ?? null,
      assignments: own('creator_agency_assignments'), applications: own('creator_applications') };
  }
  function fixtureLeftovers(customer) {
    const foreign = row => !customer || row.creator_account_id !== customer.id;
    return { accounts: db.creator_accounts.filter(row => FIXTURE_EMAIL.test(row.email)).length,
      auth: [...auth.values()].filter(user => FIXTURE_EMAIL.test(user.email)).length,
      invites: db.creator_agency_codes.filter(row => FIXTURE_LABEL.test(row.label)).length,
      files: db.creator_files.filter(foreign).length,
      objects: [...objects.keys()].filter(key => !customer || !key.startsWith(`onboarding-content/creators/${customer.id}/`)).length,
      assignments: db.creator_agency_assignments.filter(foreign).length, applications: db.creator_applications.filter(foreign).length };
  }
  const fixtureAuthEmails = () => [...auth.values()].filter(user => FIXTURE_EMAIL.test(user.email)).map(user => user.email);
  return { env, db, auth, objects, requests, deleteViolations, fakeErrors, orphanAuthEmails, fetch: fakeFetch, seedCustomer, snapshotCustomer, fixtureLeftovers, fixtureAuthEmails };
}

// Runs one flow-only pass with the fake as global fetch, then puts the network block back and removes any retained
// private manifest directory (the runner keeps it on cleanup failure).
async function runFlowOnly(run, brand, fake) {
  const originalLog = console.log, outputs = [];
  console.log = value => outputs.push(String(value));
  global.fetch = fake.fetch;
  let result;
  try { result = await run({ run: true, brand, sha: SHA, mode: 'flow-only' }, fake.env); }
  finally { blockNetwork(); console.log = originalLog; }
  if (result?.cleanup_manifest && path.dirname(path.dirname(result.cleanup_manifest)) === os.tmpdir() && /^creator-flow-/.test(path.basename(path.dirname(result.cleanup_manifest)))) {
    fs.rmSync(path.dirname(result.cleanup_manifest), { recursive: true, force: true });
  }
  return { result, outputs };
}

module.exports = { SHA, blockNetwork, envFor, makeFake, runFlowOnly };
