"use strict";
/* Supplemental normal-HTTP acceptance. No account/Auth inserts or forged cookies.
 * Read-only fixture checks and exact fixture cleanup use this runtime's own key.
 * Never print raw responses, cookies, passwords, invitation codes or signed URLs.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const BRANDS = Object.freeze({
  flirt: { project: 'lkmfwpqegjluirfusnaw', origin: 'https://dashboard.flirtaiagency.com', agency: '66263f7f-77c6-4d9b-a828-e7c9d1ce3597', login: '/creator/login' },
  moxy: { project: 'aouaenqayfltoqrmpitg', origin: 'https://dashboard.lynqai.co', login: '/creator/moxy/login' },
});
const LIMIT = 536870912;
const PHOTO_LIMIT = 78643200;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FIXTURE_FILES = Object.freeze({
  'photo-near-limit.png': { kind: 'content_nsfw_image', bytes: PHOTO_LIMIT - 1024 },
  'photo-exact-limit.png': { kind: 'content_sfw_image', bytes: PHOTO_LIMIT },
  'photo-over-limit.png': { kind: 'content_sfw_image', bytes: PHOTO_LIMIT + 1 },
  'moving-one.mp4': { kind: 'content_sfw_video' }, 'moving-two.mp4': { kind: 'content_nsfw_video' },
  'near-limit-padded.mp4': { kind: 'content_sfw_video', bytes: LIMIT - 1024 },
  'exact-limit-padded.mp4': { kind: 'content_sfw_video', bytes: LIMIT },
  'over-limit-padded.mp4': { kind: 'content_sfw_video', bytes: LIMIT + 1 },
  'additional-after-submit.mp4': { kind: 'content_sfw_video' }, 'removal-guard-fixture.mp4': { kind: 'content_sfw_video' },
});
class CheckError extends Error {}
class BlockedError extends CheckError {}
function assert(ok, label) { if (!ok) throw new CheckError(label); }
function parseArgs(argv) {
  const config = {};
  for (const arg of argv) {
    if (arg.startsWith('--brand=')) config.brand = arg.slice(8);
    else if (arg.startsWith('--expected-sha=')) config.sha = arg.slice(15);
    else if (arg === '--flow-only' || arg === '--small-only' || arg === '--large' || arg === '--photo-boundaries') {
      assert(!config.mode, 'Specify one run mode'); config.mode = arg.slice(2);
    } else if (arg === '--run') config.run = true;
    else if (arg === '--removal-guards') config.removalGuards = true;
    else if (arg === '--allow-missing-gallery') config.allowMissingGallery = true;
    else if (arg.startsWith('--cleanup-manifest=')) config.cleanupManifest = arg.slice(19);
    else throw new CheckError('Unknown runner argument');
  }
  if (config.cleanupManifest) { assert(!config.mode, 'Cleanup-only cannot be combined with signup/upload mode'); config.mode = 'cleanup-only'; }
  assert(config.run && BRANDS[config.brand] && /^[a-f0-9]{40}$/i.test(config.sha || '') && config.mode, 'Require --run, --brand, --expected-sha and exactly one run mode');
  assert(config.mode !== 'cleanup-only' || (!config.removalGuards && !config.allowMissingGallery), 'Cleanup-only cannot change verification options');
  assert(!config.removalGuards || config.mode !== 'flow-only', '--removal-guards requires an upload mode');
  assert(!config.allowMissingGallery || (!config.removalGuards && config.mode !== 'flow-only'), '--allow-missing-gallery requires an upload mode without removal guards');
  return config;
}
function runtimeGuard(config, env) {
  const brand = BRANDS[config.brand];
  assert(brand && env.SUPABASE_URL === `https://${brand.project}.supabase.co`, 'Refusing wrong backend');
  assert(env.GIT_SHA === config.sha, 'Runtime commit does not equal externally expected commit');
  assert(!!env.SUPABASE_SERVICE_KEY && !/[\r\n]/.test(env.SUPABASE_SERVICE_KEY), 'Runtime service credential unavailable');
  if (config.brand === 'flirt') assert(env.FLIRT_BACKEND_ENABLED === 'true' && env.FLIRT_SUPABASE_PROJECT_REF === brand.project && env.DASHBOARD_PUBLIC_ORIGIN === brand.origin, 'Refusing non-FLIRT runtime');
  else {
    assert(env.FLIRT_BACKEND_ENABLED !== 'true', 'Refusing FLIRT runtime for Moxy');
    // The shared Twin process serves the explicitly allowlisted Moxy host too.
    assert(!env.DASHBOARD_PUBLIC_ORIGIN || ['https://dashboard.tgaiclone.xyz', brand.origin].includes(env.DASHBOARD_PUBLIC_ORIGIN), 'Unexpected shared-runtime canonical origin');
  }
  return brand;
}
function readCleanupManifest(config) {
  const location = config.cleanupManifest;
  assert(new RegExp(`^/tmp/creator-flow-${config.brand}-[A-Za-z0-9]+/cleanup-manifest[.]json$`).test(location || ''), 'Cleanup manifest must be an exact private runner manifest path');
  const directory = path.dirname(location), fileStat = fs.lstatSync(location), directoryStat = fs.lstatSync(directory);
  assert(fileStat.isFile() && !fileStat.isSymbolicLink() && directoryStat.isDirectory() && !directoryStat.isSymbolicLink()
    && fileStat.size < 1024 * 1024 && (fileStat.mode & 0o777) === 0o600 && (directoryStat.mode & 0o777) === 0o700
    && fileStat.uid === process.getuid() && directoryStat.uid === process.getuid() && fs.realpathSync(location) === location, 'Unsafe cleanup manifest file');
  const manifest = JSON.parse(fs.readFileSync(location, 'utf8'));
  // The serving version may have advanced after the interrupted run. The
  // current runtime still has its independent exact SHA guard; preserve the
  // original manifest revision as evidence instead of requiring a rollback.
  assert(manifest.brand === config.brand && /^[a-f0-9]{40}$/.test(manifest.expected_sha || '') && /^\d{13}-[a-f0-9]{12}$/.test(manifest.stamp || ''), 'Cleanup manifest brand or original revision is invalid');
  const startedAt = Number(manifest.stamp.split('-')[0]);
  assert(Number.isSafeInteger(startedAt) && startedAt <= Date.now() + 5000, 'Invalid cleanup creation window');
  assert(Array.isArray(manifest.fixtures) && manifest.fixtures.length <= 4 && Array.isArray(manifest.invitations) && manifest.invitations.length <= 4, 'Unexpected cleanup manifest scope');
  for (const fixture of manifest.fixtures) {
    const suffix = ['complete', 'skip'].find(value => fixture.email === `contact+creator-audit-${manifest.stamp}-${config.brand}-${value}@twinagency.co`);
    assert(suffix && fixture.name === `Disposable creator audit ${config.brand} ${suffix} ${manifest.stamp}`
      && (!fixture.id || UUID.test(fixture.id)) && (!fixture.auth_user_id || UUID.test(fixture.auth_user_id)), 'Cleanup fixture identity is outside the recorded run');
  }
  for (const invitation of manifest.invitations) assert(UUID.test(invitation.agency_id || '') && (!invitation.id || UUID.test(invitation.id))
    && ['complete', 'skip', 'duplicate-validation'].some(suffix => invitation.label === `Creator audit ${manifest.stamp} ${suffix}`)
    && (config.brand !== 'flirt' || invitation.agency_id === BRANDS.flirt.agency), 'Cleanup invitation is outside the recorded run');
  assert(!manifest.uploads || (Array.isArray(manifest.uploads) && manifest.uploads.length <= 100), 'Unexpected manifest upload scope');
  for (const upload of manifest.uploads || []) assert(UUID.test(upload.id || '') && manifest.fixtures.some(fixture => fixture.id === upload.creator_account_id)
    && FIXTURE_FILES[upload.name]?.kind === upload.kind && Number.isSafeInteger(upload.bytes) && upload.bytes > 0 && upload.bytes <= LIMIT + 1, 'Manifest upload is outside known fixture scope');
  return { ...manifest, startedAt };
}
function runnerFixtureObjectAllowed(fixture, object, startedAt, knownRows = [], attempts = []) {
  if (!UUID.test(fixture.id || '') || object.bucket !== 'onboarding-content') return false;
  const parts = object.storage_path?.split('/') || [];
  if (parts.length !== 4 || parts[0] !== 'creators' || parts[1] !== fixture.id || parts.some(part => !part || part === '.' || part === '..')) return false;
  const [, , kind, basename] = parts;
  const expectedSize = Number(object.size_bytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) return false;
  function allowedName(name, bytes) {
    const rule = FIXTURE_FILES[name];
    return rule?.kind === kind && (rule.bytes ? expectedSize === rule.bytes : expectedSize < 2 * 1024 * 1024)
      && (bytes == null || Number(bytes) === expectedSize);
  }
  const legacy = basename.match(/^(\d{13})-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})-(.+)$/i);
  if (legacy) return Number(legacy[1]) >= startedAt - 5000 && Number(legacy[1]) <= startedAt + 2 * 60 * 60 * 1000 && allowedName(legacy[3]);
  if (!UUID.test(basename)) return false;
  const proof = knownRows.find(row => row.bucket === object.bucket && row.storage_path === object.storage_path && row.kind === kind && allowedName(row.original_name, row.size_bytes))
    || attempts.find(attempt => attempt.creator_account_id === fixture.id && attempt.id === basename && attempt.kind === kind && allowedName(attempt.name, attempt.bytes));
  return !!proof;
}
async function enumerateFixtureStorage(backend, fixture) {
  assert(UUID.test(fixture.id || ''), 'Cannot enumerate unresolved fixture storage');
  const rootPrefix = `creators/${fixture.id}`, found = [];
  let entries = 0;
  const allowedKinds = new Set(['content', 'content_sfw_image', 'content_nsfw_image', 'content_sfw_video', 'content_nsfw_video', 'voice']);
  for (const bucket of ['onboarding-content', 'voice-samples']) {
    const queue = [{ prefix: rootPrefix, depth: 0 }];
    while (queue.length) {
      const item = queue.shift();
      let complete = false;
      for (let page = 0; page < 6; page++) {
        const rows = await backend(`/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: item.prefix, limit: 100, offset: page * 100, sortBy: { column: 'name', order: 'asc' } }) });
        assert(Array.isArray(rows) && rows.length <= 100, 'Unexpected fixture Storage listing');
        for (const row of rows) {
          entries++; assert(entries <= 500, 'Fixture storage enumeration exceeded bounded scope');
          assert(typeof row.name === 'string' && row.name.length <= 240 && !/[\\/%\x00-\x1f]/.test(row.name) && !['.', '..', ''].includes(row.name), 'Cleanup stopped: stored name contains an unsafe path');
          if (row.id == null && row.metadata == null) {
            assert(item.depth === 0 && allowedKinds.has(row.name) && (bucket !== 'voice-samples' || row.name === 'voice'), 'Cleanup stopped: unexpected storage folder or depth');
            queue.push({ prefix: item.prefix + '/' + row.name, depth: item.depth + 1 });
          } else {
            assert(item.depth === 1 && UUID.test(row.id || '') && Number.isSafeInteger(Number(row.metadata?.size)) && Number(row.metadata?.size) > 0, 'Cleanup stopped: unexpected stored object location or size');
            found.push({ bucket, storage_path: item.prefix + '/' + row.name, size_bytes: Number(row.metadata?.size) });
          }
        }
        if (rows.length < 100) { complete = true; break; }
      }
      assert(complete, 'Fixture storage enumeration did not finish within bounded scope');
    }
  }
  return found;
}
function cookieFrom(response, name) {
  const found = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  assert(found && /;\s*HttpOnly/i.test(found) && /;\s*Secure/i.test(found), 'Secure authenticated cookie missing');
  return found.split(';')[0];
}
function optionForMoxy(html) {
  const select = html.match(/<select\b[^>]*name="agency"[^>]*>([\s\S]*?)<\/select>/i)?.[1] || '';
  const matches = [...select.matchAll(/<option\b[^>]*value="([a-f0-9-]+)"[^>]*>([^<]*)<\/option>/gi)]
    .filter(match => /^moxy(?:\s+management)?$/i.test(match[2].trim()));
  assert(matches.length === 1 && UUID.test(matches[0][1]), 'Exactly one visible Moxy agency option required');
  return matches[0][1];
}
function padMp4(source, destination, size) {
  const base = fs.readFileSync(source);
  assert(size > base.length + 8 && size <= LIMIT + 1, 'Invalid padded fixture size');
  fs.writeFileSync(destination, base, { mode: 0o600 });
  const free = Buffer.alloc(8); free.writeUInt32BE(size - base.length); free.write('free', 4);
  const fd = fs.openSync(destination, 'r+');
  try { fs.writeSync(fd, free, 0, 8, base.length); fs.ftruncateSync(fd, size); }
  finally { fs.closeSync(fd); }
  assert(fs.statSync(destination).size === size, 'Padded fixture has wrong bytes');
}
// Synthetic 320x180 RGB PNG with valid private ancillary chunks. Padding tests
// byte handling only; it is not representative of a normal camera photo.
function paddedPhoto(destination, size) {
  assert(Number.isSafeInteger(size) && size >= 65536 && size <= PHOTO_LIMIT + 1, 'Invalid photo fixture size');
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  function chunk(type, data) {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); result.write(type, 4); data.copy(result, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < result.length - 4; i++) crc = table[(crc ^ result[i]) & 255] ^ (crc >>> 8);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const width = 320, height = 180, raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * (width * 3 + 1) + 1 + x * 3;
    raw[p] = x % 256; raw[p + 1] = y; raw[p + 2] = 120;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const head = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', require('node:zlib').deflateSync(raw))]);
  const end = chunk('IEND', Buffer.alloc(0));
  let remaining = size - head.length - end.length;
  assert(remaining >= 12, 'Photo fixture too small');
  const fd = fs.openSync(destination, 'w', 0o600);
  try {
    fs.writeSync(fd, head);
    const full = chunk('npAd', Buffer.alloc(1024 * 1024));
    while (remaining > 0) {
      let payload = Math.min(1024 * 1024, remaining - 12);
      if (remaining > payload + 12 && remaining - payload - 12 < 12) payload -= 12;
      const part = payload === 1024 * 1024 ? full : chunk('npAd', Buffer.alloc(payload));
      fs.writeSync(fd, part); remaining -= part.length;
    }
    fs.writeSync(fd, end);
  } finally { fs.closeSync(fd); }
  assert(fs.statSync(destination).size === size, 'Photo fixture byte count mismatch');
}

function safeUploadResult(response, body, durationMs, fixture) {
  const tag = typeof body?.status === 'string' && /^[a-z_]{1,60}$/.test(body.status) ? body.status : 'unclassified';
  const requestId = body?.requestId || response.headers.get('x-upload-request-id');
  return { fixture, http_status: response.status, outcome: tag, total_request_ms: durationMs,
    ...(UUID.test(requestId || '') ? { request_id: requestId } : {}),
    ...(typeof body?.stage === 'string' && /^[a-z_]{1,40}$/.test(body.stage) ? { failed_or_final_stage: body.stage } : {}),
    ...(Number.isFinite(body?.elapsedMs) ? { server_elapsed_ms: body.elapsedMs } : {}),
  };
}
async function run(config, env = process.env) {
  const brand = runtimeGuard(config, env);
  const apiOrigin = `https://${brand.project}.supabase.co`;
  const cleanupManifest = config.cleanupManifest ? readCleanupManifest(config) : null;
  const stamp = cleanupManifest?.stamp || `${Date.now()}-${randomBytes(6).toString('hex')}`;
  const startedAt = cleanupManifest?.startedAt || Date.now();
  const directory = cleanupManifest ? path.dirname(config.cleanupManifest) : fs.mkdtempSync(path.join(os.tmpdir(), `creator-flow-${config.brand}-`));
  if (!cleanupManifest) fs.chmodSync(directory, 0o700);
  const manifestPath = path.join(directory, 'cleanup-manifest.json');
  const fixtures = cleanupManifest?.fixtures || [], invitations = cleanupManifest?.invitations || [], checks = [], blocked = [], unverified = [], uploads = [], uploadAttempts = cleanupManifest?.uploads || [], cleanupIssues = [];
  let operatorCookie = '', agencyId = brand.agency, failure, cleanupFailure, recoveryRedirect;
  function checkpoint() {
    fs.writeFileSync(manifestPath, JSON.stringify({ brand: config.brand, stamp, expected_sha: cleanupManifest?.expected_sha || config.sha,
      fixtures: fixtures.map(({ email, name, id, auth_user_id }) => ({ email, name, id, auth_user_id })),
      invitations: invitations.map(({ label, id, agency_id }) => ({ label, id, agency_id })),
      uploads: uploadAttempts,
    }), { mode: 0o600 });
  }
  function passed(label) { checks.push(label); }
  async function request(url, options = {}) {
    // Ordinary requests never follow redirects across an authentication boundary.
    // Multipart uploads explicitly request 'error': Node can retain replay data
    // even in 'manual' mode, defeating a file-backed body's bounded memory.
    return fetch(url, { ...options, redirect: options.redirect === 'error' ? 'error' : 'manual', signal: options.signal || AbortSignal.timeout(45000) });
  }
  async function backend(resource, options = {}, allowed = []) {
    const response = await request(apiOrigin + resource, { ...options, headers: {
      apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...options.headers,
    } });
    if (allowed.includes(response.status)) { await response.body?.cancel(); return { allowedStatus: response.status }; }
    if (!response.ok && resource.startsWith('/storage/') && allowed.includes(404)) {
      const error = await response.json().catch(() => ({}));
      if (Number(error.statusCode) === 404) return { allowedStatus: 404 };
    }
    assert(response.ok, `Fixture backend request failed with HTTP ${response.status}`);
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  function app(resource, fixture, options = {}) {
    assert(resource.startsWith('/') && !resource.startsWith('//'), 'Unexpected application path');
    return request(brand.origin + resource, { ...options, headers: { Origin: brand.origin,
      ...(fixture?.cookie ? { Cookie: fixture.cookie } : {}), ...options.headers } });
  }
  function post(resource, fixture, fields, headers) { return app(resource, fixture, { method: 'POST', body: new URLSearchParams(fields), headers }); }
  function location(response) {
    const value = response.headers.get('location');
    assert(value, 'Required redirect missing');
    const url = new URL(value, brand.origin);
    assert(url.origin === brand.origin, 'Redirect left intended brand'); return url;
  }
  async function account(email) {
    const rows = await backend(`/rest/v1/creator_accounts?select=id,auth_user_id,email,display_name,created_at,account_status&email=eq.${encodeURIComponent(email)}`);
    assert(rows.length <= 1, 'Duplicate fixture account rows'); return rows[0];
  }
  function ownRows(table, fixture, select = '*') {
    assert(UUID.test(fixture.id || ''), 'Fixture identity unresolved');
    return backend(`/rest/v1/${table}?select=${encodeURIComponent(select)}&creator_account_id=eq.${fixture.id}`);
  }
  async function normalInvite(suffix) {
    if (!operatorCookie) {
      if (!env.DASHBOARD_PASSWORD) throw new BlockedError('Normal operator password login unavailable for disposable invitation');
      const signed = await post('/admin-auth', null, { password: env.DASHBOARD_PASSWORD, next: config.brand === 'moxy' ? '/agency-admin/creator-codes' : '/agency/creator-invites' });
      if (signed.status !== 303) throw new BlockedError('Normal operator sign-in unavailable');
      operatorCookie = cookieFrom(signed, 'allie_admin_session');
      await signed.body?.cancel();
      const page = await app(config.brand === 'moxy' ? '/agency-admin/creator-codes' : '/agency/creator-invites', { cookie: operatorCookie });
      if (page.status !== 200) throw new BlockedError('Authorized normal invitation interface unavailable');
      const html = await page.text();
      if (config.brand === 'moxy') {
        agencyId = optionForMoxy(html);
        const agencies = await backend(`/rest/v1/partner_agencies?select=id,name,slug,active&id=eq.${agencyId}`);
        assert(agencies.length === 1 && agencies[0].active && agencies[0].slug === 'moxy' && /^moxy(?:\s+management)?$/i.test(agencies[0].name), 'Visible Moxy option does not match active persisted Moxy agency');
      } else assert(html.includes('Generate invite link'), 'FLIRT invitation interface missing');
    }
    const invitation = { label: `Creator audit ${stamp} ${suffix}`, agency_id: agencyId };
    invitations.push(invitation); checkpoint();
    const route = config.brand === 'moxy' ? '/agency-admin/creator-codes/manage' : '/agency/creator-invites/manage';
    const response = await post(route, { cookie: operatorCookie }, { action: 'generate', label: invitation.label, max_uses: '1', expires_days: '1', ...(config.brand === 'moxy' ? { agency: agencyId } : {}) });
    assert(response.status === 303, 'Normal invitation creation failed');
    const code = location(response).searchParams.get('created'); await response.body?.cancel();
    assert(/^[A-Z2-9]{10}$/.test(code || ''), 'Normal invitation did not return a usable code');
    const hash = createHash('sha256').update(code).digest('hex');
    const saved = await backend(`/rest/v1/creator_agency_codes?select=id,agency_id,label,max_uses,uses&code_hash=eq.${hash}&label=eq.${encodeURIComponent(invitation.label)}`);
    assert(saved.length === 1 && saved[0].agency_id === agencyId && saved[0].max_uses === 1 && saved[0].uses === 0, 'Disposable invitation persisted incorrectly');
    Object.assign(invitation, saved[0], { code }); checkpoint(); return invitation;
  }
  async function signup(suffix, invitation) {
    const fixture = { email: `contact+creator-audit-${stamp}-${config.brand}-${suffix}@twinagency.co`,
      name: `Disposable creator audit ${config.brand} ${suffix} ${stamp}`, password: randomBytes(24).toString('base64url') };
    fixtures.push(fixture); checkpoint();
    assert(!await account(fixture.email), 'Disposable email collision');
    const response = await post('/creator-auth/signup', null, { email: fixture.email, password: fixture.password, display_name: fixture.name, ...(invitation ? { agency_code: invitation.code } : {}) });
    const saved = await account(fixture.email);
    if (saved) { Object.assign(fixture, saved); checkpoint(); }
    assert(response.status === 303 && fixture.id && fixture.auth_user_id && location(response).pathname === '/creator/onboarding', 'Normal signup did not create account and reach onboarding');
    fixture.cookie = cookieFrom(response, 'twin_creator_session'); await response.body?.cancel();
    const assignment = await ownRows('creator_agency_assignments', fixture, 'agency_id');
    assert(assignment.length === 1 && assignment[0].agency_id === agencyId, 'Signup has incorrect agency assignment');
    const auth = await backend(`/auth/v1/admin/users/${fixture.auth_user_id}`);
    assert(auth.id === fixture.auth_user_id && auth.email?.toLowerCase() === fixture.email.toLowerCase(), 'Persisted Auth identity differs from normal registration');
    if (!checks.some(label => label.startsWith('Configured signup'))) passed(auth.email_confirmed_at
      ? 'Configured signup policy issues an immediate creator session and marks email confirmed; this does not verify mailbox ownership'
      : 'Configured signup policy issued a creator session without a confirmed Auth email; investigate verification policy');
    if (invitation) {
      const current = await backend(`/rest/v1/creator_agency_codes?select=uses&id=eq.${invitation.id}`);
      assert(current.length === 1 && current[0].uses === 1, 'Disposable invite consumption incorrect');
    }
    return fixture;
  }
  async function page200(resource, fixture) {
    const response = await app(resource, fixture); assert(response.status === 200, `Creator page failed: ${resource}`); return response.text();
  }
  async function savedContentNavigation(fixture) {
    const routes = config.brand === 'flirt' ? ['/creator', '/creator/edit'] : ['/creator', '/creator/ppvs', '/creator/edit'];
    if (config.brand === 'flirt') {
      const response = await app('/creator/ppvs', fixture);
      assert(response.status === 307 && location(response).pathname === '/creator', 'Removed FLIRT PPV page must redirect to Earnings');
      await response.body?.cancel();
    }
    for (const route of routes) {
      const html = await page200(route, fixture);
      if (config.brand === 'flirt') assert(!html.includes('href="/creator/ppvs"'), 'Removed FLIRT PPV navigation is still visible');
      assert(html.includes('data-creator-content-access') && html.includes('href="/creator/onboarding?step=content"'), 'Saved-content navigation missing on ' + route);
      assert(html.includes('data-creator-onboarding-access'), 'Onboarding details navigation missing on ' + route);
      assert(!html.includes('Your onboarding is complete.'), 'Optional onboarding wrongly marked complete');
    }
    const content = await page200('/creator/onboarding?step=content', fixture);
    assert(content.includes('Saved content') && content.includes('data-upload-content'), 'Saved gallery or additional upload controls missing');
  }
  async function draftState(fixture) {
    const applications = await ownRows('creator_applications', fixture, 'status,submitted_at');
    assert(applications.every(item => item.status === 'draft' && !item.submitted_at), 'Skip or navigation submitted onboarding');
    assert((await ownRows('creator_consents', fixture, 'id')).length === 0, 'Skip or navigation recorded consent');
    const info = await page200('/creator/info', fixture);
    assert(info.includes('Draft / unfinished') && !info.includes('Onboarding submitted'), 'Draft Info has misleading submission wording');
  }
  async function recoveryConfiguration(fixture) {
    const target = brand.origin + '/creator/reset-password';
    // Match the installed Auth SDK: redirect_to is a query parameter, not a
    // JSON body property. This generates an unsent recovery link for this
    // normally registered disposable user only; never print or follow tokens.
    const generated = await backend('/auth/v1/admin/generate_link?redirect_to=' + encodeURIComponent(target), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recovery', email: fixture.email }),
    });
    let actual = generated?.redirect_to;
    if (!actual && typeof generated?.action_link === 'string') {
      try { actual = new URL(generated.action_link).searchParams.get('redirect_to'); } catch { actual = null; }
    }
    recoveryRedirect = { accepted: actual === target, brand: config.brand, path: '/creator/reset-password', email_sent: false };
    if (recoveryRedirect.accepted) passed('Correct-query unsent recovery link accepts this brand reset path; email delivery and browser reset remain unverified');
    else blocked.push('Correct-query recovery link did not retain the intended brand reset path; investigate Auth URL allowlist before claiming recovery works');
  }
  async function loginAgain(fixture) {
    const logout = await post('/creator-auth/logout', fixture, {});
    assert(logout.status === 303, 'Logout did not return its required redirect');
    // A wrong same-brand landing page is a reported regression, but it must
    // not hide independent upload results when the session is actually cleared
    // and the normal login route remains usable. External redirects still fail.
    if (location(logout).pathname !== brand.login) blocked.push('Logout redirects within the same brand to an incorrect login page; normal fresh-login checks continued');
    assert(logout.headers.getSetCookie().some(value => value.startsWith('twin_creator_session=;') && /Max-Age=0/i.test(value)), 'Logout did not expire creator cookie');
    await logout.body?.cancel(); fixture.cookie = '';
    const direct = await app('/creator/onboarding?step=content', fixture);
    assert([303, 307, 308].includes(direct.status), 'Signed-out private onboarding not redirected'); await direct.body?.cancel();
    const login = await post('/creator-auth/login', null, { email: fixture.email, password: fixture.password, portal: config.brand, next: '/creator/onboarding?step=content' });
    assert(login.status === 303 && location(login).pathname === '/creator/onboarding' && location(login).searchParams.get('step') === 'content', 'Fresh login lost requested destination');
    fixture.cookie = cookieFrom(login, 'twin_creator_session'); await login.body?.cancel();
    await page200('/creator/onboarding?step=content', fixture);
  }
  async function adminDenied(fixture) {
    for (const resource of ['/creator-management', `/creator-management/${fixture.id}`]) {
      const response = await app(resource, fixture);
      assert([303, 307, 308, 401, 403, 404].includes(response.status), 'Creator reached internal management route'); await response.body?.cancel();
      const anonymous = await app(resource, null);
      assert([303, 307, 308, 401, 403, 404].includes(anonymous.status), 'Signed-out user reached internal management route'); await anonymous.body?.cancel();
    }
  }
  async function galleryAvailable(fixture) {
    const response = await app('/creator-auth/files?kind=content_sfw_video', fixture, { headers: { Accept: 'application/json' } });
    const enabled = response.status === 200 && (response.headers.get('content-type') || '').includes('application/json');
    await response.body?.cancel();
    if (!enabled) (config.allowMissingGallery ? unverified : blocked).push('Gallery API is not deployed or not available; browser playback and gallery isolation were not established');
    return enabled;
  }
  async function upload(fixture, file, kind, name, uploadId = randomUUID()) {
    if (!uploadAttempts.some(attempt => attempt.id === uploadId)) {
      uploadAttempts.push({ id: uploadId, creator_account_id: fixture.id, kind, name, bytes: fs.statSync(file).size }); checkpoint();
    }
    const form = new FormData(); form.set('kind', kind);
    form.append('files', await fs.openAsBlob(file, { type: name.endsWith('.mp4') ? 'video/mp4' : 'image/png' }), name);
    const started = performance.now();
    const response = await app('/creator-auth/upload', fixture, { method: 'POST', body: form, redirect: 'error', headers: { Accept: 'application/json', 'X-Creator-Upload-Id': uploadId }, signal: AbortSignal.timeout(600000) });
    let body; try { body = await response.json(); } catch { body = {}; }
    const result = safeUploadResult(response, body, Math.round(performance.now() - started), name);
    uploads.push(result); console.log(JSON.stringify({ event: 'upload_result', ...result }));
    return { response, body, uploadId };
  }
  async function savedFile(fixture, name, bytes) {
    const files = await ownRows('creator_files', fixture, 'id,creator_account_id,bucket,storage_path,original_name,size_bytes,storage_transfer_status');
    const found = files.filter(item => item.original_name === name);
    assert(found.length === 1 && Number(found[0].size_bytes) === bytes && found[0].storage_transfer_status === 'verified', 'Expected exactly one persisted verified file');
    const file = found[0];
    assert(file.bucket === 'onboarding-content' && file.storage_path.startsWith(`creators/${fixture.id}/`), 'Saved file escaped fixture storage prefix');
    const info = await backend(`/storage/v1/object/info/${file.bucket}/${file.storage_path.split('/').map(encodeURIComponent).join('/')}`);
    assert(Number(info.size ?? info.metadata?.size) === bytes, 'Stored object missing or wrong byte count');
    return file;
  }
  async function privateRetrieval(fixture, other, file) {
    const access = await app(`/creator-auth/files/${file.id}/access`, fixture);
    assert(access.status === 200, 'Owner playback access unavailable'); const payload = await access.json();
    assert(typeof payload.url === 'string' && new URL(payload.url).origin === apiOrigin, 'Unexpected private playback origin');
    const media = await request(payload.url, { headers: { Range: 'bytes=0-1023' } });
    assert(media.status === 206 && /^bytes 0-1023\//.test(media.headers.get('content-range') || ''), 'Saved file retrieval does not support requested range');
    const bytes = await media.arrayBuffer(); assert(bytes.byteLength === 1024, 'Private range byte count mismatch');
    for (const actor of [null, other]) {
      const denied = await app(`/creator-auth/files/${file.id}/access`, actor);
      assert([401, 403, 404].includes(denied.status), 'Private playback accessible outside owning account'); await denied.body?.cancel();
    }
    const foreignDelete = await app(`/creator-auth/files/${file.id}`, other, { method: 'DELETE' });
    // A generic already-removed reply deliberately hides whether a foreign ID exists.
    if (foreignDelete.status === 200) assert((await foreignDelete.json()).removed === true, 'Foreign deletion response leaked file detail');
    else { assert([403, 404].includes(foreignDelete.status), 'Other creator could remove saved file'); await foreignDelete.body?.cancel(); }
    await savedFile(fixture, file.original_name, Number(file.size_bytes));
  }
  async function removalGuards(a, b, source) {
    assert(await galleryAvailable(a), 'Removal guards require the deployed gallery');
    const name = 'removal-guard-fixture.mp4';
    const uploaded = await upload(a, source, 'content_sfw_video', name);
    assert(uploaded.response.status === 200 && uploaded.body.status === 'content_saved', 'Removal guard fixture upload failed');
    const file = await savedFile(a, name, fs.statSync(source).size);
    const rpc = (creatorId, fileId) => backend('/rest/v1/rpc/begin_creator_file_removal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_creator_id: creatorId, p_file_id: fileId }) });
    const denied = await rpc(b.id, file.id);
    assert(denied?.state === 'removed' && Object.keys(denied).length === 1, 'Foreign-owner reservation revealed details or claimed file');
    await savedFile(a, name, fs.statSync(source).size);
    const reserved = await rpc(a.id, file.id);
    assert(reserved?.state === 'removing' && reserved.creator_account_id === a.id && reserved.file_id === file.id, 'Own removal reservation failed');
    const premature = await post('/creator-auth/onboarding', a, { action: 'submit' });
    assert(premature.status === 303 && location(premature).searchParams.get('status') === 'file_removal_pending', 'Pending removal did not block submission with a useful state');
    await premature.body?.cancel(); await draftState(a);
    const removed = await app(`/creator-auth/files/${file.id}`, a, { method: 'DELETE' });
    assert(removed.status === 200 && (await removed.json()).removed === true, 'Creator removal retry failed to finish');
    assert((await ownRows('creator_files', a, 'id')).every(row => row.id !== file.id), 'Removed fixture metadata remains');
    const absent = await backend(`/storage/v1/object/info/${file.bucket}/${file.storage_path.split('/').map(encodeURIComponent).join('/')}`, {}, [404]);
    assert(absent?.allowedStatus === 404, 'Removed fixture object remains');
    // The normal main flow submits immediately after this and proves it unlocks.
    passed('Supplemental internal removal guard: foreign-owner reservation hides existence; own pending removal blocks HTTP submission; creator DELETE retry removes actual object and metadata');
  }
  async function photoBoundaryChecks(a, b) {
    assert(await galleryAvailable(a), 'Photo acceptance requires the persisted gallery');
    const cases = [
      { name: 'photo-near-limit.png', kind: 'content_nsfw_image', bytes: PHOTO_LIMIT - 1024 },
      { name: 'photo-exact-limit.png', kind: 'content_sfw_image', bytes: PHOTO_LIMIT },
    ];
    for (const item of cases) { item.path = path.join(directory, item.name); paddedPhoto(item.path, item.bytes); }
    const outcomes = await Promise.all(cases.map(item => upload(a, item.path, item.kind, item.name)));
    for (let index = 0; index < cases.length; index++) {
      assert(outcomes[index].response.status === 200 && outcomes[index].body.status === 'content_saved', 'At/below 75 MiB valid photo failed');
      const item = cases[index]; await savedFile(a, item.name, item.bytes);
    }
    const over = path.join(directory, 'photo-over-limit.png'); paddedPhoto(over, PHOTO_LIMIT + 1);
    const rejected = await upload(a, over, 'content_sfw_image', 'photo-over-limit.png');
    assert(rejected.response.status === 400 && ['upload_too_large', 'upload_size'].includes(rejected.body.status), 'Photo over 75 MiB must have a distinct size error');
    assert(!(await ownRows('creator_files', a, 'original_name')).some(row => row.original_name === 'photo-over-limit.png'), 'Rejected photo acquired a saved record');
    await loginAgain(a);
    for (const item of cases) {
      const file = await savedFile(a, item.name, item.bytes);
      await privateRetrieval(a, b, file);
      const gallery = await app('/creator-auth/files?kind=' + item.kind, a, { headers: { Accept: 'application/json' } });
      assert(gallery.status === 200 && (await gallery.text()).includes(file.id), 'Saved photo missing from its gallery category');
      const access = await app(`/creator-auth/files/${file.id}/access`, a);
      assert(access.status === 200, 'Saved photo download unavailable');
      const { url } = await access.json(); assert(new URL(url).origin === apiOrigin, 'Unexpected photo download origin');
      const downloaded = await request(url);
      assert(downloaded.status === 200 && downloaded.body, 'Saved photo download failed');
      const actual = createHash('sha256'); let count = 0;
      for await (const part of downloaded.body) { actual.update(part); count += part.byteLength; }
      const expected = createHash('sha256');
      for await (const part of fs.createReadStream(item.path)) expected.update(part);
      assert(count === item.bytes && actual.digest('hex') === expected.digest('hex'), 'Saved photo full-download bytes differ from uploaded fixture');
    }
    passed('Photo bytes: 78642176 and 78643200 accepted simultaneously in both image categories; 78643201 rejected; persisted private objects and complete SHA-256-matched retrieval verified after fresh login. Synthetic padded PNGs are 320x180 RGB, not camera-speed tests.');
  }

  async function uploadChecks(a, b) {
    const source = path.join(directory, 'moving-1s.mp4');
    execFileSync('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10', '-t', '1', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', source], { timeout: 30000, stdio: 'ignore' });
    const probe = JSON.parse(execFileSync('/usr/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height', '-of', 'json', source], { timeout: 10000, maxBuffer: 65536 }).toString());
    assert(Number(probe.format.duration) === 1 && probe.streams[0].codec_name === 'h264', 'Synthetic moving video invalid');
    const gallery = await galleryAvailable(a);
    const names = ['moving-one.mp4', 'moving-two.mp4'];
    const results = await Promise.all(names.map((name, index) => upload(a, source, index ? 'content_nsfw_video' : 'content_sfw_video', name)));
    for (let index = 0; index < results.length; index++) {
      assert(results[index].response.status === 200 && results[index].body.status === 'content_saved', 'Small moving video upload failed');
      const file = await savedFile(a, names[index], fs.statSync(source).size);
      if (gallery) await privateRetrieval(a, b, file);
    }
    passed('Two normal HTTPS moving-video uploads across categories saved with actual private objects; fixture is H.264 320x180, 1 second');
    if (gallery) {
      const replay = await upload(a, source, 'content_sfw_video', names[0], results[0].uploadId);
      assert(replay.response.status === 200, 'Idempotent saved retry failed'); await savedFile(a, names[0], fs.statSync(source).size);
      passed('Saved upload retry returns one persisted record; owner range retrieval and cross-account playback/removal denial pass');
    }
    if (config.mode === 'photo-boundaries') await photoBoundaryChecks(a, b);
    if (config.mode === 'large') {
      const disk = fs.statfsSync(directory);
      assert(disk.bavail * disk.bsize > 1200 * 1024 * 1024, 'Insufficient temporary disk for client and server boundary fixtures');
      for (const [name, size] of [['near-limit-padded.mp4', LIMIT - 1024], ['exact-limit-padded.mp4', LIMIT], ['over-limit-padded.mp4', LIMIT + 1]]) {
        const fixturePath = path.join(directory, name); padMp4(source, fixturePath, size);
        try {
          const result = await upload(a, fixturePath, 'content_sfw_video', name);
          if (size > LIMIT) assert(result.response.status === 400 && ['upload_too_large', 'upload_size'].includes(result.body.status), 'Over-limit file not rejected with distinct size error');
          else {
            assert(result.response.status === 200 && result.body.status === 'content_saved', 'At/below-size-limit valid padded video failed');
            const file = await savedFile(a, name, size); if (gallery) await privateRetrieval(a, b, file);
          }
        } finally { fs.rmSync(fixturePath, { force: true }); }
      }
      passed('Padded MP4 byte boundaries: 536869888 and 536870912 accepted and persisted; 536870913 rejected');
    }
    await loginAgain(a);
    for (const name of names) { const file = await savedFile(a, name, fs.statSync(source).size); if (gallery) await privateRetrieval(a, b, file); }
    passed('Saved records, actual objects and available private retrieval survive fresh creator login');
    return source;
  }
  async function cleanupFixtureStorage(fixture) {
    assert((await ownRows('creator_clone_links', fixture, 'creator_account_id')).length === 0, 'Cleanup stopped: disposable account gained a connected profile');
    const files = await ownRows('creator_files', fixture, 'id,bucket,storage_path,kind,original_name,size_bytes');
    const receiptResponse = await backend(`/rest/v1/creator_upload_receipts?select=bucket,storage_path,kind,original_name,size_bytes&creator_account_id=eq.${fixture.id}`, {}, [404]);
    const receipts = Array.isArray(receiptResponse) ? receiptResponse : [];
    const known = [...files, ...receipts];
    const stored = await enumerateFixtureStorage(backend, fixture);
    const all = new Map([...known, ...stored].map(file => [`${file.bucket}/${file.storage_path}`, file]));
    const toRemove = [];
    // Preflight the complete bounded prefix before removing anything. An unknown
    // object or downstream reference preserves the account and all its objects.
    for (const file of all.values()) {
      assert(['onboarding-content', 'voice-samples'].includes(file.bucket) && file.storage_path?.startsWith(`creators/${fixture.id}/`)
        && !file.storage_path.split('/').some(part => ['.', '..', ''].includes(part)), 'Cleanup object prefix mismatch');
      const resource = `/storage/v1/object/info/${file.bucket}/${file.storage_path.split('/').map(encodeURIComponent).join('/')}`;
      const info = await backend(resource, {}, [404]);
      if (info?.allowedStatus !== 404) {
        const actual = { ...file, size_bytes: Number(info.size ?? info.metadata?.size) };
        assert(runnerFixtureObjectAllowed(fixture, actual, startedAt, known, uploadAttempts), 'Cleanup stopped: unexpected stored object under disposable prefix');
        assert(stored.some(item => item.bucket === file.bucket && item.storage_path === file.storage_path), 'Cleanup stopped: Storage listing changed during verification');
        toRemove.push(actual);
      }
      for (const [table, column] of [['photos', 'storage_path'], ['videos', 'storage_path'], ['photo_bundle_items', 'storage_path'], ['video_sequence_jobs', 'source_storage_path']]) {
        const references = await backend(`/rest/v1/${table}?select=id&${column}=eq.${encodeURIComponent(file.storage_path)}&limit=1`);
        assert(references.length === 0, 'Cleanup stopped: downstream content reference appeared');
      }
      const duplicate = await backend(`/rest/v1/creator_files?select=id&storage_path=eq.${encodeURIComponent(file.storage_path)}&creator_account_id=neq.${fixture.id}&limit=1`);
      assert(duplicate.length === 0, 'Cleanup stopped: foreign file references object');
    }
    for (const file of toRemove) {
      await backend(`/storage/v1/object/${file.bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [file.storage_path] }) });
      const absent = await backend(`/storage/v1/object/info/${file.bucket}/${file.storage_path.split('/').map(encodeURIComponent).join('/')}`, {}, [404]);
      assert(absent?.allowedStatus === 404, 'Cleanup object remains; retaining database references');
    }
    assert((await enumerateFixtureStorage(backend, fixture)).length === 0, 'Cleanup stopped: disposable storage prefix is not empty');
    // All durable references remain until both known and orphaned objects are absent.
    await backend(`/rest/v1/creator_files?creator_account_id=eq.${fixture.id}`, { method: 'DELETE' });
  }
  async function cleanup() {
    let errors = 0;
    for (const fixture of fixtures) {
      try {
        const current = await account(fixture.email);
        if (current) {
          assert(current.display_name === fixture.name && Date.parse(current.created_at) >= startedAt - 5000 && Date.parse(current.created_at) <= startedAt + 2 * 60 * 60 * 1000, 'Cleanup account identity or creation window mismatch');
          if (fixture.id) assert(current.id === fixture.id, 'Cleanup account identity changed');
          const expectedAuthId = fixture.auth_user_id;
          if (expectedAuthId && current.auth_user_id) assert(current.auth_user_id === expectedAuthId, 'Cleanup Auth identity changed');
          Object.assign(fixture, current, { auth_user_id: expectedAuthId || current.auth_user_id }); checkpoint();
        } else if (fixture.id) {
          const collision = await backend(`/rest/v1/creator_accounts?select=id&id=eq.${fixture.id}`);
          assert(collision.length === 0, 'Cleanup stopped: recorded account ID has a different email');
        }
        // A previously removed account can still have an orphaned private
        // object. Validate its original manifest IDs and Auth identity first,
        // then inspect exactly that prefix without recreating an account.
        let authAbsent = true;
        if (fixture.auth_user_id) {
          const auth = await backend(`/auth/v1/admin/users/${fixture.auth_user_id}`, {}, [404]);
          authAbsent = auth?.allowedStatus === 404;
          if (!authAbsent) assert(auth.id === fixture.auth_user_id && auth.email?.toLowerCase() === fixture.email.toLowerCase(), 'Cleanup Auth identity mismatch');
        }
        if (fixture.id) await cleanupFixtureStorage(fixture);
        if (fixture.auth_user_id && !authAbsent) await backend(`/auth/v1/admin/users/${fixture.auth_user_id}`, { method: 'DELETE' });
        if (fixture.auth_user_id) assert((await backend(`/auth/v1/admin/users/${fixture.auth_user_id}`, {}, [404]))?.allowedStatus === 404, 'Disposable Auth account remains after cleanup');
        if (current) await backend(`/rest/v1/creator_accounts?id=eq.${fixture.id}&email=eq.${encodeURIComponent(fixture.email)}`, { method: 'DELETE' });
        assert(!await account(fixture.email), 'Disposable creator remains after cleanup');
      } catch (error) {
        errors++;
        cleanupIssues.push(error instanceof CheckError ? error.message : 'Cleanup backend unavailable; raw details suppressed');
      }
    }
    // Only labels allocated by this process, never shared invitation counters.
    for (const invitation of invitations) {
      try {
        const filter = `agency_id=eq.${invitation.agency_id}&label=eq.${encodeURIComponent(invitation.label)}`;
        const rows = await backend(`/rest/v1/creator_agency_codes?select=id&${filter}`);
        assert(rows.length <= 1 && (!invitation.id || rows.every(row => row.id === invitation.id)), 'Cleanup invite identity mismatch');
        if (!errors) {
          await backend(`/rest/v1/creator_agency_codes?${filter}`, { method: 'DELETE' });
          assert((await backend(`/rest/v1/creator_agency_codes?select=id&${filter}`)).length === 0, 'Disposable invitation remains');
        }
      } catch { errors++; }
    }
    assert(!errors, 'Exact fixture cleanup incomplete; private runtime manifest retained');
  }
  checkpoint();
  console.log(JSON.stringify({ event: 'fixture_manifest', brand: config.brand, path: manifestPath, expected_commit: config.sha }));
  try {
    if (!cleanupManifest) {
    const invalid = await post('/creator-auth/signup', null, { display_name: '', email: 'invalid', password: 'short' }, { Accept: 'application/json' });
    assert(invalid.status === 400 && (await invalid.json()).error === 'invalid', 'Invalid signup input not rejected');
    const firstInvite = config.brand === 'moxy' ? await normalInvite('complete') : null;
    const a = await signup('complete', firstInvite);
    const secondInvite = await normalInvite('skip');
    const b = await signup('skip', secondInvite);
    await recoveryConfiguration(a);
    passed('Two fresh disposable accounts registered through normal signup with correct agency assignment; invitation generated through normal authorized interface');
    const duplicate = await post('/creator-auth/signup', null, { display_name: a.name, email: a.email, password: a.password, ...(firstInvite ? { agency_code: (await normalInvite('duplicate-validation')).code } : {}) }, { Accept: 'application/json' });
    assert(duplicate.status === 409 && (await duplicate.json()).error === 'exists', 'Duplicate signup not rejected correctly');
    const exhausted = await app(`/creator/signup?code=${secondInvite.code}`, null);
    assert(exhausted.status === 200 && /no places left|used up|exhausted|reached.*limit/i.test(await exhausted.text()), 'Exhausted invitation not clearly explained');
    passed('Invalid and duplicate signup validation and exhausted invitation presentation pass');
    for (const fixture of [a, b]) {
      await page200('/creator/onboarding', fixture); const dashboard = await page200('/creator', fixture);
      assert(dashboard.includes('data-return-to-onboarding') || /Return to onboarding|Finish onboarding|Continue onboarding/i.test(dashboard), 'Dashboard has no return-to-onboarding action');
      await page200('/creator/onboarding?step=content', fixture); await draftState(fixture); await savedContentNavigation(fixture); await adminDenied(fixture);
    }
    passed('GET skip-to-dashboard and return preserve draft state and absence of consent; creator and signed-out management list/detail denied');
    await loginAgain(b); await draftState(b); passed('Fresh login retains skip/unfinished state and intended upload destination');
    const source = config.mode === 'flow-only' ? null : await uploadChecks(a, b);
    if (config.removalGuards) await removalGuards(a, b, source);
    const submit = await post('/creator-auth/onboarding', a, { action: 'submit' });
    assert(submit.status === 303 && location(submit).pathname === '/creator', 'Optional onboarding submit failed'); await submit.body?.cancel();
    const applications = await ownRows('creator_applications', a, 'status,submitted_at');
    assert(applications.length === 1 && applications[0].status === 'submitted' && applications[0].submitted_at, 'Submission not persisted');
    assert((await ownRows('creator_consents', a, 'id')).length === 0, 'Optional submission fabricated consent');
    assert((await page200('/creator/info', a)).includes('Submitted'), 'Submitted Info wording missing');
    await page200('/creator/onboarding?step=content', a); await loginAgain(a);
    assert((await ownRows('creator_applications', a, 'status'))[0].status === 'submitted', 'Fresh login lost submitted state');
    await savedContentNavigation(a);
    passed(config.brand === 'flirt'
      ? 'Removed PPV page redirects to Earnings; saved-content and onboarding navigation remains available on Earnings and Edit'
      : 'Saved-content and onboarding navigation is available on Earnings, Pay Per View and Edit before AI connection, including after submission and fresh login');
    await draftState(b); passed('Explicit optional submission persists without fabricated consent; second creator remains unfinished; submitted account returns and signs in freshly');
    if (source) {
      const additional = await upload(a, source, 'content_sfw_video', 'additional-after-submit.mp4');
      assert(additional.response.status === 200 && additional.body.status === 'content_saved', 'Post-submission upload failed');
      const saved = await savedFile(a, 'additional-after-submit.mp4', fs.statSync(source).size);
      if (await galleryAvailable(a)) await privateRetrieval(a, b, saved);
      passed('Additional normal upload after final submission persists with actual stored object');
    }
    }
  } catch (error) {
    if (error instanceof BlockedError) blocked.push(error.message);
    else failure = error instanceof CheckError ? error.message : 'Unexpected runtime/transport failure; raw details suppressed';
  }
  try { await cleanup(); if (cleanupManifest) passed('Exact interrupted-run manifest cleanup completed without signup or upload actions'); } catch (error) { cleanupFailure = error instanceof CheckError ? error.message : 'Fixture cleanup unavailable'; }
  if (!cleanupFailure) fs.rmSync(directory, { recursive: true, force: true });
  const result = { passed: !failure && !cleanupFailure && blocked.length === 0, brand: config.brand, mode: config.mode,
    expected_commit: config.sha, method: 'normal public HTTPS plus fixture-scoped persistence checks; supplements browser audit', checks, blocked: [...new Set(blocked)], unverified: [...new Set(unverified)], uploads,
    ...(recoveryRedirect ? { recovery_redirect: recoveryRedirect } : {}),
    ...(cleanupManifest ? { cleanup_source_commit: cleanupManifest.expected_sha } : {}),
    ...(failure ? { failure } : {}), ...(cleanupFailure ? { cleanup_failure: cleanupFailure, cleanup_manifest: manifestPath, cleanup_issues: [...new Set(cleanupIssues)] } : { identified_fixtures_removed: true }),
    browser_journey_verified: false, physical_iphone_verified: false, speed_claim: 'Runtime/server connection only; not representative of creator phones', credentials_logged: false };
  console.log(JSON.stringify(result)); return result;
}
module.exports = { parseArgs, runtimeGuard, readCleanupManifest, runnerFixtureObjectAllowed, enumerateFixtureStorage, optionForMoxy, padMp4, paddedPhoto, safeUploadResult, run, BRANDS, LIMIT, PHOTO_LIMIT };
// `node -` intentionally has no require.main. The SSM wrapper pipes this file
// through stdin, while require() by the offline tests must stay side-effect free.
if (require.main === module || (process.argv[1] === '-' && module.id === '[stdin]')) {
  let config;
  try { config = parseArgs(process.argv.slice(2)); runtimeGuard(config, process.env); }
  catch (error) { console.log(JSON.stringify({ passed: false, error: error instanceof CheckError ? error.message : 'Runner configuration invalid', credentials_logged: false })); process.exitCode = 1; }
  if (config && !process.exitCode) run(config).then(result => { if (!result.passed) process.exitCode = 1; }).catch(() => { console.log(JSON.stringify({ passed: false, error: 'Runner initialization failed; raw details suppressed', credentials_logged: false })); process.exitCode = 1; });
}

