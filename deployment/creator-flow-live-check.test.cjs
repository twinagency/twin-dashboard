"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { contentNavigationAvailable, parseArgs, runtimeGuard, readCleanupManifest, optionForMoxy, padMp4, safeUploadResult, run, BRANDS } = require('./creator-flow-live-check.cjs');
const SHA = 'a'.repeat(40);
const args = ['--run', '--brand=flirt', `--expected-sha=${SHA}`, '--flow-only'];
const stdinInvocation = spawnSync(process.execPath, ['-', ...args], { input: fs.readFileSync(path.join(__dirname, 'creator-flow-live-check.cjs')), env: {}, encoding: 'utf8', timeout: 10000 });
assert.equal(stdinInvocation.status, 1, 'Stdin entrypoint must execute and reject absent runtime credentials');
assert.equal(JSON.parse(stdinInvocation.stdout).error, 'Refusing wrong backend');
assert.deepEqual(parseArgs(args), { run: true, brand: 'flirt', sha: SHA, mode: 'flow-only' });
assert.throws(() => parseArgs(args.concat('--large')));
assert.throws(() => parseArgs(args.filter(arg => arg !== '--run')));
assert.throws(() => parseArgs(args.concat('--removal-guards')));
assert.throws(() => parseArgs(args.concat('--allow-missing-gallery')));
assert.throws(() => parseArgs(args.concat('--cleanup-manifest=/tmp/creator-flow-flirt-x/cleanup-manifest.json')));
assert.equal(parseArgs(args.filter(arg => arg !== '--flow-only').concat('--cleanup-manifest=/tmp/creator-flow-flirt-x/cleanup-manifest.json')).mode, 'cleanup-only');
const envFor = brand => ({ GIT_SHA: SHA, SUPABASE_URL: `https://${BRANDS[brand].project}.supabase.co`, SUPABASE_SERVICE_KEY: 'runtime-secret-do-not-log',
  DASHBOARD_PASSWORD: 'runtime-password-do-not-log', DASHBOARD_PUBLIC_ORIGIN: brand === 'flirt' ? BRANDS.flirt.origin : 'https://dashboard.tgaiclone.xyz',
  ...(brand === 'flirt' ? { FLIRT_BACKEND_ENABLED: 'true', FLIRT_SUPABASE_PROJECT_REF: BRANDS.flirt.project } : {}),
});
assert.equal(runtimeGuard(parseArgs(args), envFor('flirt')).project, BRANDS.flirt.project);
assert.throws(() => runtimeGuard(parseArgs(args), envFor('moxy')));
assert.throws(() => runtimeGuard(parseArgs(args), { ...envFor('flirt'), GIT_SHA: 'b'.repeat(40) }));
const moxyId = randomUUID();
assert.equal(optionForMoxy(`<select name="agency"><option value="${moxyId}">Moxy</option></select>`), moxyId);
assert.throws(() => optionForMoxy(`<select name="agency"><option value="${moxyId}">Other</option></select>`));
assert.throws(() => optionForMoxy(`<select name="agency"><option value="${moxyId}">Moxy</option><option value="${randomUUID()}">Moxy Management</option></select>`));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-flow-runner-unit-'));
try {
  const original = path.join(temporary, 'source.mp4'), padded = path.join(temporary, 'padded.mp4');
  fs.writeFileSync(original, Buffer.from('source-data'));
  padMp4(original, padded, 1024);
  const bytes = fs.readFileSync(padded);
  assert.equal(bytes.length, 1024); assert.equal(bytes.readUInt32BE(11), 1013); assert.equal(bytes.toString('ascii', 15, 19), 'free');
  assert.throws(() => padMp4(original, padded, 12));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
const safe = safeUploadResult(new Response('{}', { status: 503 }), { status: 'https://private/signed?token=secret', requestId: 'secret-cookie', stage: 'bad\nprivate' }, 20, 'fixture.mp4');
assert.deepEqual(safe, { fixture: 'fixture.mp4', http_status: 503, outcome: 'unclassified', total_request_ms: 20 });

// Complete runner executes against a deterministic network double; no live calls.
async function mockedFlow(brand, uploadMode = false, missingGallery = false, wrongLogout = false, cleanupRetry = false, orphanBlock = null) {
  const config = { run: true, brand, sha: SHA, mode: uploadMode ? 'small-only' : 'flow-only', ...(uploadMode ? missingGallery ? { allowMissingGallery: true } : { removalGuards: true } : {}) };
  const env = envFor(brand), accounts = new Map(), auth = new Map(), invites = new Map(), applications = new Map(), files = new Map(), objects = new Map(), reservations = new Map(), requests = [];
  const agency = brand === 'flirt' ? BRANDS.flirt.agency : moxyId;
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const redirect = (url, cookie) => new Response(null, { status: 303, headers: { Location: BRANDS[brand].origin + url, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
  const originalFetch = global.fetch, originalLog = console.log, outputs = [];
  let failCleanupOnce = cleanupRetry;
  let insertedOrphan = false, orphanPath = null;
  console.log = value => outputs.push(value);
  global.fetch = async (input, options) => {
    const url = new URL(input), method = options.method || 'GET', headers = new Headers(options.headers), body = options.body;
    requests.push({ host: url.host, path: url.pathname, method, redirect: options.redirect });
    assert.equal(options.redirect, url.pathname === '/creator-auth/upload' ? 'error' : 'manual');
    const owner = [...accounts.values()].find(account => headers.get('cookie') === `twin_creator_session=${account.id}`);
    if (url.origin === BRANDS[brand].origin) {
      assert.equal(headers.get('apikey'), null); assert.equal(headers.get('authorization'), null);
      if (url.pathname === '/admin-auth') return redirect('/agency/creator-invites', 'allie_admin_session=normal-auth-token; Secure; HttpOnly');
      if (url.pathname === '/agency-admin/creator-codes') return new Response(`<select name="agency"><option value="${agency}">Moxy</option></select>`);
      if (url.pathname === '/agency/creator-invites') return new Response('Generate invite link');
      if (['/agency-admin/creator-codes/manage', '/agency/creator-invites/manage'].includes(url.pathname)) {
        assert.equal(headers.get('cookie'), 'allie_admin_session=normal-auth-token');
        const code = 'ABCDEFG' + String(invites.size + 222), id = randomUUID();
        invites.set(id, { id, agency_id: agency, label: body.get('label'), code, code_hash: createHash('sha256').update(code).digest('hex'), max_uses: 1, uses: 0 });
        return redirect('/agency/creator-invites?created=' + code);
      }
      if (url.pathname === '/creator-auth/signup') {
        if (!body.get('display_name') || body.get('email') === 'invalid') return json({ error: 'invalid' }, 400);
        if ([...accounts.values()].some(item => item.email === body.get('email'))) return json({ error: 'exists' }, 409);
        const invite = [...invites.values()].find(item => item.code === body.get('agency_code'));
        if (brand === 'moxy') assert.ok(invite);
        if (invite) invite.uses++;
        const id = randomUUID(), authId = randomUUID();
        const record = { id, auth_user_id: authId, email: body.get('email'), display_name: body.get('display_name'), created_at: new Date().toISOString(), account_status: 'applicant' };
        accounts.set(id, record); auth.set(authId, { id: authId, email: record.email, email_confirmed_at: new Date().toISOString() });
        applications.set(id, { status: 'draft', submitted_at: null });
        return redirect('/creator/onboarding', `twin_creator_session=${id}; HttpOnly; Secure`);
      }
      if (url.pathname === '/creator/signup') return new Response('This invitation has no places left.');
      if (url.pathname.startsWith('/creator-management')) return redirect(brand === 'moxy' ? '/moxy' : '/twin');
      if (url.pathname === '/creator-auth/login') {
        const account = [...accounts.values()].find(item => item.email === body.get('email')); assert.ok(account);
        return redirect(body.get('next'), `twin_creator_session=${account.id}; HttpOnly; Secure`);
      }
      if (url.pathname === '/creator-auth/logout') return redirect(wrongLogout ? '/creator/wrong-login' : BRANDS[brand].login, 'twin_creator_session=; Max-Age=0; HttpOnly; Secure');
      if (!owner) return url.pathname.startsWith('/creator-auth/files') ? json({ error: 'session_expired' }, 401) : redirect(BRANDS[brand].login);
      if (url.pathname === '/creator-auth/onboarding') {
        if ([...reservations.values()].some(item => item.creator_account_id === owner.id && item.state === 'removing')) return redirect('/creator/onboarding?step=consent&status=file_removal_pending');
        applications.set(owner.id, { status: 'submitted', submitted_at: new Date().toISOString() }); return redirect('/creator');
      }
      if (url.pathname === '/creator-auth/upload') {
        const id = headers.get('x-creator-upload-id'), blob = body.get('files');
        assert.ok(id);
        if (!files.has(id)) {
          const storagePath = `creators/${owner.id}/${body.get('kind')}/${id}`, bytes = Buffer.from(await blob.arrayBuffer());
          files.set(id, { id, creator_account_id: owner.id, kind: body.get('kind'), original_name: blob.name, size_bytes: bytes.length, storage_transfer_status: 'verified', bucket: 'onboarding-content', storage_path: storagePath });
          objects.set(storagePath, bytes);
        }
        return json({ status: 'content_saved', requestId: randomUUID(), stage: 'progress', elapsedMs: 1 });
      }
      if (url.pathname === '/creator-auth/files') return missingGallery ? json({ error: 'not_deployed' }, 404) : json({ files: [...files.values()].filter(file => file.creator_account_id === owner.id) });
      if (url.pathname.startsWith('/creator-auth/files/')) {
        const id = url.pathname.split('/')[3], file = files.get(id);
        if (method === 'DELETE') {
          if (file?.creator_account_id === owner.id) { objects.delete(file.storage_path); files.delete(id); if (reservations.has(id)) reservations.get(id).state = 'removed'; }
          return json({ removed: true });
        }
        if (!file || file.creator_account_id !== owner.id) return json({ error: 'file_not_found' }, 404);
        return json({ url: env.SUPABASE_URL + '/storage/v1/object/sign/' + file.storage_path + '?token=private-do-not-log' });
      }
      if (url.pathname === '/creator/info') return new Response(applications.get(owner.id).status === 'draft' ? 'Draft / unfinished' : 'Submitted');
      if (url.pathname === '/creator/ppvs' && brand === 'flirt') return new Response(null, { status: 307, headers: { Location: BRANDS.flirt.origin + '/creator' } });
      if (['/creator', '/creator/ppvs', '/creator/edit'].includes(url.pathname)) return new Response('<a data-return-to-onboarding>Return to onboarding</a><a data-creator-content-access href="/creator/onboarding?step=content">My uploaded content</a><a data-creator-onboarding-access href="/creator/onboarding">Onboarding details</a>');
      if (url.pathname === '/creator/onboarding') return new Response('<a data-return-to-onboarding>Return to onboarding</a><section>Saved content</section><button data-upload-content>Upload content</button>');
      throw new Error('Unexpected application request');
    }
    assert.equal(url.origin, env.SUPABASE_URL);
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      assert.equal(headers.get('apikey'), null); assert.equal(headers.get('range'), 'bytes=0-1023');
      const object = objects.get(url.pathname.slice('/storage/v1/object/sign/'.length)); assert.ok(object);
      return new Response(object.subarray(0, 1024), { status: 206, headers: { 'Content-Range': `bytes 0-1023/${object.length}` } });
    }
    assert.equal(headers.get('apikey'), env.SUPABASE_SERVICE_KEY);
    if (url.pathname.startsWith('/storage/v1/object/list/')) {
      const bucket = url.pathname.split('/').pop(), { prefix, offset, limit } = JSON.parse(body);
      if (bucket === 'voice-samples') return json([]);
      if (orphanBlock && !insertedOrphan) {
        insertedOrphan = true;
        const name = orphanBlock === 'unknown' ? 'customer-upload.mp4' : 'moving-one.mp4';
        orphanPath = prefix + '/content_sfw_video/' + Date.now() + '-' + randomUUID() + '-' + name;
        objects.set(orphanPath, Buffer.alloc(1024));
      }
      const children = new Map();
      for (const [key, value] of objects) {
        if (!key.startsWith(prefix + '/')) continue;
        const rest = key.slice(prefix.length + 1), pieces = rest.split('/');
        children.set(pieces[0], pieces.length > 1 ? { name: pieces[0], id: null, metadata: null } : { name: pieces[0], id: randomUUID(), metadata: { size: value.length } });
      }
      return json([...children.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(offset, offset + limit));
    }
    if (url.pathname === '/auth/v1/admin/generate_link') {
      const payload = JSON.parse(body), target = BRANDS[brand].origin + '/creator/reset-password';
      assert.equal(payload.type, 'recovery'); assert.equal(payload.redirect_to, undefined);
      assert.ok([...accounts.values()].some(account => account.email === payload.email));
      assert.equal(url.searchParams.get('redirect_to'), target);
      return json({ redirect_to: target, action_link: 'https://private.test/verify?token=private-do-not-log', hashed_token: 'private-do-not-log' });
    }
    if (url.pathname.startsWith('/storage/v1/object/info/onboarding-content/')) {
      const object = objects.get(url.pathname.slice('/storage/v1/object/info/onboarding-content/'.length));
      return object ? json({ size: object.length }) : json({ statusCode: '404', error: 'not_found' }, 400);
    }
    if (url.pathname === '/storage/v1/object/onboarding-content' && method === 'DELETE') {
      for (const prefix of JSON.parse(body).prefixes) objects.delete(prefix);
      return json([]);
    }
    if (url.pathname === '/rest/v1/rpc/begin_creator_file_removal') {
      const { p_creator_id: ownerId, p_file_id: fileId } = JSON.parse(body), file = files.get(fileId);
      if (file?.creator_account_id !== ownerId) return json({ state: 'removed' });
      const reservation = { state: 'removing', creator_account_id: ownerId, file_id: fileId }; reservations.set(fileId, reservation); return json(reservation);
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      const id = url.pathname.split('/').pop();
      if (method === 'DELETE') { auth.delete(id); return json({}); }
      return auth.has(id) ? json(auth.get(id)) : json({ code: 'user_not_found' }, 404);
    }
    const table = url.pathname.split('/').pop(), id = url.searchParams.get('creator_account_id')?.slice(3);
    if (table === 'creator_accounts') {
      const email = url.searchParams.get('email')?.slice(3);
      const accountId = url.searchParams.get('id')?.slice(3);
      const rows = [...accounts.values()].filter(item => (!email || item.email === email) && (!accountId || item.id === accountId));
      if (method === 'DELETE') {
        if (failCleanupOnce) { failCleanupOnce = false; return json({ error: 'temporary_metadata_failure' }, 503); }
        rows.forEach(item => accounts.delete(item.id)); return new Response(null, { status: 204 });
      }
      return json(rows);
    }
    if (table === 'partner_agencies') return json([{ id: agency, slug: 'moxy', name: 'Moxy', active: true }]);
    if (table === 'creator_agency_codes') {
      let rows = [...invites.values()];
      for (const field of ['id', 'code_hash', 'label', 'agency_id']) {
        const value = url.searchParams.get(field); if (value) rows = rows.filter(item => item[field] === value.slice(3));
      }
      if (method === 'DELETE') { rows.forEach(item => invites.delete(item.id)); return new Response(null, { status: 204 }); }
      return json(rows);
    }
    if (['photos', 'videos', 'photo_bundle_items', 'video_sequence_jobs'].includes(table)) return json(orphanBlock === 'downstream' && table === 'photos' && url.searchParams.get('storage_path') === 'eq.' + orphanPath ? [{ id: randomUUID() }] : []);
    if (table === 'creator_files') {
      let rows = [...files.values()];
      const ownerFilter = url.searchParams.get('creator_account_id');
      if (ownerFilter?.startsWith('eq.')) rows = rows.filter(file => file.creator_account_id === ownerFilter.slice(3));
      if (ownerFilter?.startsWith('neq.')) rows = rows.filter(file => file.creator_account_id !== ownerFilter.slice(4));
      if (url.searchParams.get('storage_path')) rows = rows.filter(file => file.storage_path === url.searchParams.get('storage_path').slice(3));
      if (orphanBlock === 'foreign' && ownerFilter?.startsWith('neq.') && url.searchParams.get('storage_path') === 'eq.' + orphanPath) rows = [{ id: randomUUID() }];
      if (method === 'DELETE') {
        for (const file of rows) { assert.equal(objects.has(file.storage_path), false, 'Metadata removal must follow verified Storage removal'); files.delete(file.id); }
        return new Response(null, { status: 204 });
      }
      return json(rows);
    }
    assert.ok(id);
    if (table === 'creator_agency_assignments') return json([{ agency_id: agency }]);
    if (table === 'creator_applications') return json([applications.get(id)]);
    if (['creator_consents', 'creator_clone_links', 'creator_upload_receipts'].includes(table)) return json([]);
    throw new Error('Unexpected backend request');
  };
  let result;
  try {
    result = await run(config, env);
    if (cleanupRetry) {
      assert.equal(result.passed, false); assert.ok(result.cleanup_failure);
      const normalSignupCalls = requests.filter(request => request.path === '/creator-auth/signup').length;
      const cleanupConfig = { run: true, brand, sha: 'b'.repeat(40), mode: 'cleanup-only', cleanupManifest: result.cleanup_manifest };
      const manifest = readCleanupManifest(cleanupConfig);
      assert.equal(manifest.expected_sha, SHA, 'Preserve original manifest revision after deployment advances');
      const unsafe = JSON.parse(fs.readFileSync(result.cleanup_manifest, 'utf8'));
      unsafe.fixtures[0].email = 'customer@example.com';
      fs.writeFileSync(result.cleanup_manifest, JSON.stringify(unsafe), { mode: 0o600 });
      assert.throws(() => readCleanupManifest(cleanupConfig), /outside the recorded run/);
      fs.writeFileSync(result.cleanup_manifest, JSON.stringify(manifest), { mode: 0o600 });
      // Reproduce a prior interrupted cleanup: account/Auth are already gone,
      // while an unrecorded known synthetic Storage object remains in its prefix.
      accounts.delete(manifest.fixtures[0].id); auth.delete(manifest.fixtures[0].auth_user_id);
      objects.set(`creators/${manifest.fixtures[0].id}/content_sfw_video/${manifest.startedAt}-${randomUUID()}-moving-one.mp4`, Buffer.alloc(1024));
      result = await run(cleanupConfig, { ...env, GIT_SHA: cleanupConfig.sha });
      assert.equal(requests.filter(request => request.path === '/creator-auth/signup').length, normalSignupCalls, 'Cleanup-only must not sign up new accounts');
      assert.equal(result.cleanup_source_commit, SHA);
      assert.equal(result.mode, 'cleanup-only');
    }
  }
  finally { global.fetch = originalFetch; console.log = originalLog; }
  assert.equal(result.passed, !wrongLogout && !orphanBlock, JSON.stringify(result));
  if (orphanBlock) {
    assert.ok(result.cleanup_failure, 'Unexpected or referenced orphan must block cleanup');
    assert.ok(objects.has(orphanPath), 'Blocked cleanup must retain the stored object');
    assert.ok(accounts.size > 0 && auth.size > 0, 'Blocked cleanup must retain its disposable identity');
    assert.equal(requests.some(request => request.path.startsWith('/storage/v1/object/') && request.method === 'DELETE'), false, 'Preflight must finish before deleting any object');
    fs.rmSync(path.dirname(result.cleanup_manifest), { recursive: true, force: true });
    return;
  }
  if (wrongLogout) {
    assert.ok(result.blocked.some(item => item.includes('Logout redirects within the same brand')));
    assert.ok(result.uploads.length >= 3, 'Wrong logout landing must not hide independent upload verification');
    assert.ok(result.checks.some(item => item.startsWith('Additional normal upload after final submission')));
  }
  if (brand === 'flirt' && !cleanupRetry) assert.ok(result.checks.some(item => item.startsWith('Removed PPV page redirects to Earnings')));
  assert.equal(result.identified_fixtures_removed, true); assert.equal(result.browser_journey_verified, false);
  assert.equal(result.unverified.length > 0, missingGallery, 'Missing-gallery allowance must retain explicit unverified evidence');
  if (!cleanupRetry) assert.deepEqual(result.recovery_redirect, { accepted: true, brand, path: '/creator/reset-password', email_sent: false });
  assert.equal(accounts.size, 0); assert.equal(auth.size, 0); assert.equal(invites.size, 0);
  assert.equal(files.size, 0); assert.equal(objects.size, 0);
  assert.ok(requests.filter(request => request.path === '/creator-auth/signup' && request.method === 'POST').length >= 4);
  assert.equal(requests.some(request => request.path.includes('/auth/v1/admin/users') && request.method === 'POST'), false, 'Runner must never directly create Auth accounts');
  assert.equal(requests.some(request => request.path === '/rest/v1/creator_accounts' && request.method === 'POST'), false, 'Runner must never insert creator rows');
  const rendered = outputs.join('\n');
  assert.ok(!rendered.includes(env.SUPABASE_SERVICE_KEY) && !rendered.includes(env.DASHBOARD_PASSWORD) && !rendered.includes('normal-auth-token') && !rendered.includes('private-do-not-log'));
}
(async () => { await mockedFlow('flirt'); await mockedFlow('moxy'); await mockedFlow('flirt', true); await mockedFlow('moxy', true, true); await mockedFlow('moxy', true, true, true); await mockedFlow('flirt', false, false, false, true); for (const block of ['unknown','downstream','foreign']) await mockedFlow('flirt', false, false, false, false, block); console.log('Creator live runner: stdin invocation, runtime isolation, normal signup/invites, correct-query unsent recovery, upload persistence/private ranges, removal guards, explicit missing-gallery/logout-regression scope, interrupted/orphan manifest cleanup, unknown/reference guards, Storage-first cleanup and redacted output tests pass; no live requests made.'); })().catch(error => { console.error(error); process.exitCode = 1; });

assert.equal(contentNavigationAvailable('data-upload-content data-combined-content-intake creator-content-files', false), true);
assert.equal(contentNavigationAvailable('data-upload-content data-combined-content-intake creator-content-files', true), false);
assert.equal(contentNavigationAvailable('Saved content data-upload-content', true), true);
assert.equal(contentNavigationAvailable('data-upload-content data-combined-content-intake', false), false);
