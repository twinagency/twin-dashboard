import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { REHEARSAL_REF, PRODUCTION_REF, safePath, targetRef } from './prepare.mjs';

export const CHUNK_SIZE = 6 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const encodedPath = path => safePath(path).split('/').map(encodeURIComponent).join('/');
export function validatePlan(plan) {
  targetRef(plan.target_ref); assert.equal(plan.version, 1);
  assert.match(plan.snapshot_sha256, HASH, 'Missing snapshot checksum');
  assert.ok(Array.isArray(plan.files), 'Missing files');
  const ids = new Set(); let bytes = 0;
  for (const f of plan.files) {
    assert.ok(UUID.test(f.legacy_id) && UUID.test(f.legacy_user_id), 'Invalid file identity');
    assert.ok(!ids.has(f.legacy_id), 'Duplicate file identity'); ids.add(f.legacy_id);
    assert.ok(['voice-samples', 'onboarding-content'].includes(f.source_bucket), 'Unexpected source bucket');
    safePath(f.source_path); assert.equal(f.source_path.split('/')[0], f.legacy_user_id, 'Wrong file owner');
    assert.equal(f.target_bucket, 'creator-onboarding', 'Unexpected target bucket');
    assert.equal(f.target_path, `legacy/${f.legacy_user_id}/${f.legacy_id}`, 'Wrong target path');
    assert.ok(Number.isSafeInteger(f.size_bytes) && f.size_bytes >= 0, 'Invalid file size');
    assert.match(f.mime_type, /^[\w.+-]+\/[\w.+-]+$/, 'Invalid MIME type'); bytes += f.size_bytes;
  }
  assert.equal(plan.summary.files, plan.files.length, 'File count mismatch');
  assert.equal(plan.summary.media_bytes, bytes, 'File byte total mismatch');
  return plan;
}
export function connection(ref, token) {
  assert.match(ref ?? '', /^[a-z]{20}$/, 'Invalid Supabase project ref');
  assert.equal(typeof token, 'string', 'Missing server-side Storage token');
  const parts = token.split('.'); assert.equal(parts.length, 3, 'A service-role JWT is required');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  assert.equal(claims.ref, ref, 'Storage token belongs to a different project');
  assert.equal(claims.role, 'service_role', 'Server-side service-role token required');
  // Local parsing prevents configuration mistakes; Supabase verifies the signature.
  return { ref, origin: `https://${ref}.supabase.co`, storageOrigin: `https://${ref}.storage.supabase.co`,
    headers: { apikey: token, authorization: `Bearer ${token}` } };
}
export function validateUploadUrl(value, target) {
  const url = new URL(value, `${target.storageOrigin}/storage/v1/upload/resumable`);
  assert.ok([target.origin, target.storageOrigin].includes(url.origin), 'Unexpected upload host');
  assert.ok(url.pathname.startsWith('/storage/v1/upload/resumable/'), 'Unexpected upload path');
  assert.ok(!url.username && !url.password && !url.hash && !url.search, 'Unsafe upload URL');
  return url.href;
}
const request = (fetcher, url, headers, options = {}) => fetcher(url, {
  redirect: 'error', signal: AbortSignal.timeout(30 * 60 * 1000), ...options,
  headers: { ...headers, ...(options.headers ?? {}) },
});
export async function digestBody(body, expectedBytes, handle) {
  assert.ok(body, 'Missing response body'); const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of body) {
    bytes += chunk.length; assert.ok(bytes <= expectedBytes, 'Object exceeds expected size');
    hash.update(chunk); if (handle) await handle.writeFile(chunk);
  }
  assert.equal(bytes, expectedBytes, 'Object size mismatch');
  return hash.digest('hex');
}
async function missingObject(response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const error = await response.json().catch(() => ({}));
  return ['NoSuchKey', 'not_found'].includes(error.code ?? error.error)
    || (String(error.statusCode) === '404' && error.message === 'Object not found');
}
export async function targetDigest(target, file, fetcher = fetch) {
  const response = await request(fetcher, `${target.origin}/storage/v1/object/authenticated/${file.target_bucket}/${encodedPath(file.target_path)}`, target.headers);
  if (!response.ok) {
    if (await missingObject(response)) return null;
    throw new Error(`Target read failed with HTTP ${response.status}`);
  }
  return digestBody(response.body, file.size_bytes);
}
async function saveJson(path, data) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temporary, path);
}
export async function uploadResumable(target, file, localPath, statePath, sourceHash, fetcher = fetch, pause = delay) {
  let state;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state) {
    assert.equal(state.source_hash, sourceHash, 'Source changed during resumed upload');
    assert.equal(state.file_id, file.legacy_id); validateUploadUrl(state.url, target);
  }
  const headers = { ...target.headers, 'Tus-Resumable': '1.0.0' };
  if (!state) {
    const metadata = { bucketName: file.target_bucket, objectName: file.target_path, contentType: file.mime_type, cacheControl: '60' };
    const created = await request(fetcher, `${target.storageOrigin}/storage/v1/upload/resumable`, headers, {
      method: 'POST', headers: { 'Upload-Length': String(file.size_bytes),
        'Upload-Metadata': Object.entries(metadata).map(([k,v]) => `${k} ${Buffer.from(v).toString('base64')}`).join(',') },
    });
    assert.equal(created.status, 201, `Upload creation failed with HTTP ${created.status}`);
    assert.ok(created.headers.get('location'), 'Missing upload location');
    state = { url: validateUploadUrl(created.headers.get('location'), target), source_hash: sourceHash, file_id: file.legacy_id };
    await saveJson(statePath, state);
  }
  const handle = await open(localPath, 'r'); let failures = 0;
  try {
    while (true) {
      let head;
      try {
        head = await request(fetcher, state.url, headers, { method: 'HEAD' });
        if ([404, 410].includes(head.status)) {
          await rm(statePath, { force: true }); throw new Error('Upload expired; rerun to create a fresh upload');
        }
        assert.equal(head.status, 200, `Upload offset check failed with HTTP ${head.status}`);
        assert.equal(head.headers.get('upload-length'), String(file.size_bytes), 'Upload length mismatch');
        const raw = head.headers.get('upload-offset'); assert.match(raw ?? '', /^\d+$/, 'Missing upload offset');
        const offset = Number(raw); assert.ok(Number.isSafeInteger(offset) && offset <= file.size_bytes, 'Invalid upload offset');
        if (offset === file.size_bytes) break;
        const chunk = Buffer.alloc(Math.min(CHUNK_SIZE, file.size_bytes - offset)); let position = 0;
        while (position < chunk.length) {
          const { bytesRead } = await handle.read(chunk, position, chunk.length - position, offset + position);
          assert.ok(bytesRead > 0, 'Unexpected end of local file'); position += bytesRead;
        }
        const result = await request(fetcher, state.url, headers, { method: 'PATCH', body: chunk,
          headers: { 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
        });
        assert.equal(result.status, 204, `Upload chunk failed with HTTP ${result.status}`);
        assert.equal(result.headers.get('upload-offset'), String(offset + chunk.length), 'Unexpected acknowledged offset');
        failures = 0;
      } catch (error) {
        if (/expired|mismatch|Invalid|Missing|Unexpected|HTTP (400|401|403|404|413)/.test(error.message) || ++failures > 4) throw error;
        await pause(1000 * failures);
      }
    }
  } finally { await handle.close(); }
}
export async function copyOne(source, target, file, workdir, fetcher = fetch) {
  const localPath = resolve(workdir, `${file.legacy_id}.bin`);
  const statePath = resolve(workdir, `${file.legacy_id}.upload.json`);
  const response = await request(fetcher, `${source.origin}/storage/v1/object/authenticated/${file.source_bucket}/${encodedPath(file.source_path)}`, source.headers);
  assert.ok(response.ok, `Source read failed with HTTP ${response.status}`);
  const handle = await open(localPath, 'w', 0o600); let sourceHash;
  try { sourceHash = await digestBody(response.body, file.size_bytes, handle); } finally { await handle.close(); }
  const existingHash = await targetDigest(target, file, fetcher);
  if (existingHash !== null) assert.equal(existingHash, sourceHash, 'Existing target differs; refusing overwrite');
  else await uploadResumable(target, file, localPath, statePath, sourceHash, fetcher);
  const copiedHash = existingHash ?? await targetDigest(target, file, fetcher);
  assert.equal(copiedHash, sourceHash, 'Downloaded target checksum does not match source');
  await rm(localPath, { force: true }); await rm(statePath, { force: true });
  return { legacy_id: file.legacy_id, target_bucket: file.target_bucket, target_path: file.target_path,
    size_bytes: file.size_bytes, source_sha256: sourceHash, target_sha256: copiedHash, verified_at: new Date().toISOString() };
}
export async function main(argv = process.argv.slice(2), env = process.env, fetcher = fetch) {
  const [planPath, workdir, mode] = argv;
  assert.ok(planPath && workdir, 'Usage: node copy-storage.mjs storage-plan.json /private/workdir [--execute]');
  const plan = validatePlan(JSON.parse(await readFile(planPath, 'utf8')));
  if (mode !== '--execute') {
    assert.ok(mode === undefined, 'Unknown argument');
    console.log(JSON.stringify({ state: 'dry_run', files: plan.files.length, bytes: plan.summary.media_bytes })); return;
  }
  assert.equal(env.TWIN_MIGRATION_EXECUTION_APPROVED, 'rehearsal-only', 'Explicit rehearsal execution approval required');
  assert.ok(env.SOURCE_PROJECT_REF !== REHEARSAL_REF && env.SOURCE_PROJECT_REF !== PRODUCTION_REF, 'Incorrect source project');
  const source = connection(env.SOURCE_PROJECT_REF, env.SOURCE_STORAGE_SERVICE_ROLE_JWT);
  const target = connection(REHEARSAL_REF, env.REHEARSAL_STORAGE_SERVICE_ROLE_JWT);
  const bucketResponse = await request(fetcher, `${target.origin}/storage/v1/bucket/creator-onboarding`, target.headers);
  assert.ok(bucketResponse.ok, `Private rehearsal bucket is not ready: HTTP ${bucketResponse.status}`);
  const bucket = await bucketResponse.json(); assert.equal(bucket.public, false, 'Target bucket must be private');
  const largest = Math.max(0, ...plan.files.map(f => f.size_bytes));
  if (bucket.file_size_limit !== null && bucket.file_size_limit !== undefined) assert.ok(Number(bucket.file_size_limit) >= largest, 'Bucket file-size limit is too low');
  const dir = resolve(workdir); await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = await open(resolve(dir, '.copy.lock'), 'wx', 0o600);
  try {
    const receipts = { version: 1, target_ref: REHEARSAL_REF, snapshot_sha256: plan.snapshot_sha256, files: [] };
    for (const file of plan.files) {
      receipts.files.push(await copyOne(source, target, file, dir, fetcher));
      await saveJson(resolve(dir, 'verified-receipts.json'), receipts);
      console.log(`Verified ${receipts.files.length}/${plan.files.length} files`);
    }
    console.log(JSON.stringify({ state: 'storage_verified_only', files: receipts.files.length, database_promoted: false, auth_migrated: false }));
  } finally { await lock.close(); await rm(resolve(dir, '.copy.lock'), { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
