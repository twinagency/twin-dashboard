// Bounded READ-ONLY live compatibility probe for the three data helpers.
// Run via stdin in the isolated pinned image; never inside either running production container.
// Required: reviewed /app source files mounted readonly, /probe/frozen readonly,
// /probe/girl-data readonly, an empty /app/.env, tmpfs /tmp, ONLY existing Supabase credentials.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPECTED_REVISION = '45931b6f56db9f97cc8406154e35a0d216f5de65';
const EXPECTED_FIXTURE_HASH = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253';
const FAN = 6814483810;
const PHOTO_ID = 'ceb606ce-4110-42b8-9c53-5507a8a787fc';
const SOURCE_PATHS = ['src/llm.ts', 'src/turn.ts', 'src/media.ts', 'src/grounding.ts', 'src/girls/template.ts',
  'src/memory.ts', 'src/deliver.ts', 'src/payments.ts', 'src/runner.ts', 'src/bundle-offers.ts'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stdout = process.stdout.write.bind(process.stdout);
const stderr = process.stderr.write.bind(process.stderr);
// Helpers must never accidentally print rows, private paths or credentials.
let suppressedOutput = 0;
process.stdout.write = (_value, encoding, callback) => { suppressedOutput++; if (typeof encoding === 'function') encoding(); else callback?.(); return true; };
process.stderr.write = (_value, encoding, callback) => { suppressedOutput++; if (typeof encoding === 'function') encoding(); else callback?.(); return true; };
const result = {
  checkedAt: new Date().toISOString(), status: 'READ-ONLY DATA CHECK FAILED',
  errors: [], sourceHashesVerified: false, frozenInputsPreserved: false, noOtherCredentials: false,
  ephemeralOwnershipCache: false, copiedDataFiles: 0, requestLimit: 12,
  requests: { photos: 0, star_transactions: 0, v2_bundle_offers: 0 },
  networkPolicyViolations: 0, exactPhotoAvailable: false, mismatchedPathRejected: false,
  strictOwnershipAvailable: false, secondStrictReadAvailable: false, strictReadBypassedCache: false,
  countEvidence: [], exactCountHeadersCompatible: false, scopedManifest: { exercised: false, status: 'not_exercised' },
  modelCalls: 0, telegramCalls: 0, remoteWrites: 0, realDownloads: 0, productionFilesWritten: 0,
};
let temp, fixtureBefore, sourceDataBefore;
let originalFetch = globalThis.fetch;
const safe = (condition, code) => { if (!condition) { result.errors.push(code); throw new Error(code); } };
const boundedFile = (file, maxBytes) => {
  const st = fs.lstatSync(file);
  safe(st.isFile() && !st.isSymbolicLink() && st.size <= maxBytes, 'invalid-or-oversized-readonly-input');
  return fs.readFileSync(file);
};
let stage = 'initialization';
try {
  safe(process.env.GIT_SHA === EXPECTED_REVISION, 'rollback-revision-mismatch');
  safe(/^[0-9a-f]{40}$/.test(process.env.CANDIDATE_SHA ?? ''), 'candidate-identity-unavailable');
  result.candidate = process.env.CANDIDATE_SHA;
  // A config.ts import can otherwise load baked .env values. An explicit empty readonly mount avoids that.
  safe(!fs.existsSync('/app/.env') || fs.statSync('/app/.env').size === 0, 'nonempty-app-env-refused');
  const allowedSecrets = new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  safe(!Object.entries(process.env).some(([key, value]) => value && !allowedSecrets.has(key)
    && /TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|SERVICE_KEY|DATABASE_URL/i.test(key)), 'unrelated-credential-present');
  safe(!!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY, 'existing-supabase-credentials-unavailable');
  result.noOtherCredentials = true;
  const endpoint = new URL(process.env.SUPABASE_URL);
  safe(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
    && (endpoint.pathname === '/' || endpoint.pathname === ''), 'invalid-supabase-endpoint');
  const manifest = JSON.parse(process.env.CANDIDATE_HASHES ?? '{}');
  safe(Object.keys(manifest).sort().join('|') === [...SOURCE_PATHS].sort().join('|'), 'source-manifest-members-mismatch');
  for (const relative of SOURCE_PATHS) {
    safe(/^[0-9a-f]{64}$/.test(manifest[relative]) && sha256(boundedFile('/app/' + relative, 2_000_000)) === manifest[relative], 'source-hash-mismatch');
  }
  result.sourceHashesVerified = true;

  stage = 'frozen-inputs';
  const frozen = '/probe/frozen';
  const frozenNames = ['riley-morning-requests.json', 'catalogue-at-diagnosis.json', 'current-settings.json'];
  const frozenBytes = Object.fromEntries(frozenNames.map(name => [name, boundedFile(path.join(frozen, name), 20_000_000)]));
  fixtureBefore = Object.fromEntries(frozenNames.map(name => [name, sha256(frozenBytes[name])]));
  safe(fixtureBefore['riley-morning-requests.json'] === EXPECTED_FIXTURE_HASH, 'frozen-incident-hash-mismatch');
  const profile = JSON.parse(frozenBytes['current-settings.json']).find(row => row.slug === 'riley-mae-lewis');
  const snapshot = JSON.parse(frozenBytes['catalogue-at-diagnosis.json']);
  safe(!!profile?.id && snapshot.cloneId === profile.id, 'frozen-creator-identity-mismatch');
  const frozenPhoto = snapshot.raw?.photos?.find(row => row.id === PHOTO_ID);
  safe(!!frozenPhoto && typeof frozenPhoto.storage_path === 'string' && !!frozenPhoto.storage_path, 'frozen-photo-identity-unavailable');
  const photoKey = 'photo:' + PHOTO_ID;

  stage = 'ephemeral-data-copy';
  temp = fs.mkdtempSync('/tmp/reference-data-readonly-');
  const localGirl = path.join(temp, 'data', profile.slug);
  fs.mkdirSync(localGirl, { recursive: true, mode: 0o700 });
  sourceDataBefore = {};
  for (const name of ['purchases.jsonl', '_bundle_offers.jsonl', '_live_owned.json']) {
    const source = path.join('/probe/girl-data', name);
    if (!fs.existsSync(source)) continue;
    const bytes = boundedFile(source, 20_000_000);
    sourceDataBefore[name] = sha256(bytes);
    fs.writeFileSync(path.join(localGirl, name), bytes, { mode: 0o600, flag: 'wx' });
    result.copiedDataFiles++;
  }

  stage = 'network-guard';
  globalThis.fetch = async (input, init) => {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url); }
    catch { result.networkPolicyViolations++; throw new Error('network-policy-rejected'); }
    const method = String(init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const table = url.pathname.split('/').at(-1);
    const known = ['photos', 'star_transactions', 'v2_bundle_offers'].includes(table);
    const scoped = url.searchParams.get('clone_id') === 'eq.' + profile.id
      && (table === 'photos' ? url.searchParams.get('id') === 'eq.' + PHOTO_ID
        : url.searchParams.get('telegram_id') === 'eq.' + FAN);
    const count = Object.values(result.requests).reduce((a, b) => a + b, 0);
    const allowed = method === 'GET' && !init?.body && url.origin === endpoint.origin && known
      && url.pathname === '/rest/v1/' + table && scoped && count < result.requestLimit;
    if (!allowed) { result.networkPolicyViolations++; throw new Error('network-policy-rejected'); }
    result.requests[table]++;
    const reply = await originalFetch(input, { ...init, method: 'GET', redirect: 'error',
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000) });
    if (table === 'star_transactions') {
      const range = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(reply.headers.get('content-range') ?? '');
      const value = await reply.clone().json().catch(() => null);
      const rowCount = Array.isArray(value) ? value.length : null;
      result.countEvidence.push({ httpStatus: reply.status, exactTotalPresent: !!range,
        rowCount, totalCount: range ? Number(range[3]) : null,
        complete: !!range && rowCount === Number(range[3]) && (!rowCount || Number(range[1]) === 0 && Number(range[2]) === rowCount - 1) });
    }
    return reply;
  };

  stage = 'product-helper-imports';
  const { config } = await import('./src/config.ts');
  safe(!config.openrouterKey && !config.telegramToken && config.supabaseUrl === process.env.SUPABASE_URL
    && config.supabaseKey === process.env.SUPABASE_SERVICE_KEY, 'product-environment-isolation-mismatch');
  config.dataDir = path.join(temp, 'data'); config.logDir = path.join(temp, 'logs');
  const { runAs } = await import('./src/context.ts');
  const { currentPhoto } = await import('./src/media.ts');
  const { loadOwnershipRead } = await import('./src/payments.ts');
  const { readOffers, fetchOffers } = await import('./src/bundle-offers.ts');
  safe(config.dataDir.startsWith(temp + '/') && config.logDir.startsWith(temp + '/'), 'ownership-cache-not-ephemeral');
  result.ephemeralOwnershipCache = true;

  await runAs(profile.slug, async () => {
    stage = 'exact-photo-lookup';
    const photo = await currentPhoto(profile.id, photoKey, frozenPhoto.storage_path);
    result.exactPhotoAvailable = !!photo.ok && photo.item.key === photoKey && photo.item.storagePath === frozenPhoto.storage_path;
    if (!result.exactPhotoAvailable) result.errors.push('exact-photo-helper-unavailable');
    stage = 'mismatched-path-lookup';
    const wrong = await currentPhoto(profile.id, photoKey, frozenPhoto.storage_path + '.invalid-reference-probe');
    result.mismatchedPathRejected = !wrong.ok;
    if (!result.mismatchedPathRejected) result.errors.push('mismatched-photo-path-not-rejected');

    stage = 'fresh-ownership-lookup';
    const first = await loadOwnershipRead(profile.id, FAN);
    result.strictOwnershipAvailable = first.ok;
    if (first.ok) {
      result.ownedKeyCount = first.keys.size;
      const callsBefore = result.requests.star_transactions;
      stage = 'second-fresh-ownership-lookup';
      const second = await loadOwnershipRead(profile.id, FAN);
      result.secondStrictReadAvailable = second.ok;
      result.strictReadBypassedCache = result.requests.star_transactions > callsBefore;
      if (!second.ok) result.errors.push('second-fresh-ownership-helper-unavailable');
      if (!result.strictReadBypassedCache) result.errors.push('strict-ownership-used-cache');
    } else result.errors.push('fresh-ownership-helper-unavailable');
    result.exactCountHeadersCompatible = result.countEvidence.some(value => value.complete)
      && result.countEvidence.filter(value => value.httpStatus < 300).every(value => value.complete);
    if (!result.exactCountHeadersCompatible) result.errors.push('exact-count-headers-not-compatible');

    stage = 'optional-scoped-manifest-lookup';
    const local = readOffers();
    // An acknowledged creator/fan-scoped local record is evidence of an actual offer, not a fabricated ID.
    const known = [...local.offers.values()].find(offer => offer.cloneId === profile.id && offer.chatId === FAN
      && /^[0-9a-f-]{36}$/i.test(offer.offerId) && local.outcomes.get(offer.offerId)?.status === 'acknowledged');
    if (known) {
      const actual = await fetchOffers([known.offerId], { cloneId: profile.id, fanId: FAN });
      const files = actual.get(known.offerId);
      const keys = list => list.map(file => [file.n, file.kind, file.storagePath, file.assetKey]);
      const agrees = !!files?.length && JSON.stringify(keys(files)) === JSON.stringify(keys(known.files));
      result.scopedManifest = { exercised: true, status: agrees ? 'passed' : 'failed', fileCount: files?.length ?? 0, matchesLocalImmutableManifest: agrees };
      if (!agrees) result.errors.push('scoped-remote-manifest-not-confirmed');
    } else result.scopedManifest = { exercised: false, status: 'not_exercised', reason: 'no-local-acknowledged-offer-for-tester' };
  });
} catch {
  if (!result.errors.length) result.errors.push('probe-failed-at-' + stage);
} finally {
  globalThis.fetch = originalFetch;
  try {
    if (fixtureBefore) result.frozenInputsPreserved = Object.entries(fixtureBefore).every(([name, hash]) => sha256(fs.readFileSync('/probe/frozen/' + name)) === hash);
    if (sourceDataBefore) result.sourceDataUnchangedDuringRead = Object.entries(sourceDataBefore).every(([name, hash]) => sha256(fs.readFileSync('/probe/girl-data/' + name)) === hash);
    // Live files may legitimately change from production traffic. The mounts are readonly; report that drift without implying this probe wrote them.
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  } catch { result.errors.push('readonly-input-recheck-or-temp-cleanup-failed'); }
  if (!result.frozenInputsPreserved) result.errors.push('frozen-input-preservation-not-confirmed');
  if (result.networkPolicyViolations) result.errors.push('network-policy-violation');
  result.suppressedOutputEvents = suppressedOutput;
  result.status = result.errors.length ? 'READ-ONLY DATA CHECK FAILED' : 'READ-ONLY DATA CHECK PASSED';
  process.stdout.write = stdout; process.stderr.write = stderr;
  stdout('REFERENCE_DATA_READONLY_JSON ' + JSON.stringify(result) + '\n');
  process.exitCode = result.errors.length ? 1 : 0;
}
