/* Regression tests use synthetic local media and an in-memory storage/DB double. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, openAsBlob, copyFileSync, openSync, writeSync, closeSync, statSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { Readable } = require('node:stream');
const { createReadStream } = require('node:fs');
const { join, resolve } = require('node:path');
const { NextRequest } = require('next/server');
const temp = mkdtempSync(join(tmpdir(), 'flirt-upload-regression-'));
const bundle = resolve('node_modules/.cache/flirt-upload-regression.cjs');
const accountId = '00000000-0000-4000-8000-000000000001';
const state = { rows: [], stored: [], identity: { accountId, readOnly: false }, status: 'draft', failInsert: false };
function query(table) {
  let operation = 'select', values;
  const q = {
    select() { return q; }, eq(column, value) { if (column === 'creator_account_id') assert.equal(value, accountId); return q; },
    order() { return q; }, limit() { return q; }, range() { return q; }, maybeSingle() { return q; }, in() { return q; },
    insert(value) { operation = 'insert'; values = value; return q; },
    delete() { operation = 'delete'; return q; }, upsert() { return q; },
    then(yes, no) { return Promise.resolve().then(() => {
      if (table === 'creator_applications') return { data: { status: state.status }, error: null };
      if (table === 'creator_files' && operation === 'insert') {
        if (state.failInsert) return { error: { message: 'Synthetic row failure' } };
        state.rows.push(values); return { error: null };
      }
      if (table === 'creator_files' && operation === 'delete') state.rows = [];
      return { data: table === 'creator_files' ? state.rows : { content_completed: false }, error: null };
    }).then(yes, no); },
  }; return q;
}
global.__flirtUploadTest = {
  identity: () => state.identity,
  db: { from: query, storage: { from: bucket => ({
    async upload(path, body, options) {
      assert.ok(['onboarding-content','voice-samples'].includes(bucket)); assert.equal(options.upsert, false);
      let size = 0;
      for await (const chunk of body.stream()) size += chunk.byteLength;
      state.stored.push({ path, size }); return { error: null };
    }, async remove(paths) { state.stored = state.stored.filter(item => !paths.includes(item.path)); return { error: null }; },
  }) } },
};
function video(path, duration, codec = 'libx264') {
  execFileSync('/usr/bin/ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=2','-t',String(duration),'-c:v',codec,'-threads','1','-pix_fmt','yuv420p','-y',path], { timeout: 30000 });
}
function paddedVideo(source, target, size) {
  copyFileSync(source, target);
  const start = statSync(target).size;
  const header = Buffer.alloc(8); header.writeUInt32BE(size - start); header.write('free', 4);
  const fd = openSync(target, 'r+'); writeSync(fd, header, 0, 8, start); writeSync(fd, Buffer.alloc(1), 0, 1, size - 1); closeSync(fd);
}
function stagingDirs() { return readdirSync(tmpdir()).filter(name => name.startsWith('creator-upload-')).sort(); }
(async () => {
  process.env.DASHBOARD_PUBLIC_ORIGIN = 'https://dashboard.flirtaiagency.com';
  process.env.FLIRT_BACKEND_ENABLED = 'true'; process.env.FLIRT_SUPABASE_PROJECT_REF = 'lkmfwpqegjluirfusnaw';
  await build({ entryPoints: ['app/creator-auth/upload/route.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-test-identity', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(supabase|creator-dashboard-identity|dashboard-access)$/ }, args => ({ path: args.path, namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path.endsWith('/supabase')
      ? 'export const supabaseAdmin = globalThis.__flirtUploadTest.db;'
      : args.path.endsWith('/dashboard-access') ? 'export function withDashboardAccess(access, fn) { if (access !== null) throw new Error("Unexpected database scope"); return fn(); }'
      : 'export async function creatorDashboardIdentity() { return globalThis.__flirtUploadTest.identity(); }' }));
  } }] });
  const { POST } = require(bundle);
  const before = stagingDirs();
  const short = join(temp, 'short.mp4'); video(short, 46);
  const large = join(temp, 'short-large.mp4'); paddedVideo(short, large, 80 * 1024 * 1024);
  const maximum = join(temp, 'maximum.mp4'); paddedVideo(short, maximum, 512 * 1024 * 1024);
  const tooLarge = join(temp, 'too-large.mp4'); paddedVideo(short, tooLarge, 512 * 1024 * 1024 + 1);
  const long = join(temp, 'too-long.mp4'); video(long, 1801);
  const mov = join(temp, 'iphone.mov'); video(mov, 1);
  async function upload(path, name, mime = 'video/mp4', headers = {}, kind = 'content_sfw_video', parallel = false) {
    // A real HTTP request is a byte stream, not undici's in-process FormData producer.
    // Use streamed multipart bytes so rejecting an oversized body cannot trigger
    // the Node 24 FormData cancellation bug in the test producer itself.
    const boundary = 'flirt-regression-boundary';
    const body = Readable.toWeb(Readable.from((async function* () {
      if (parallel) await new Promise(resolve => setTimeout(resolve, 50));
      yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`);
      for await (const chunk of createReadStream(path)) yield chunk;
      yield Buffer.from(`\r\n--${boundary}--\r\n`);
    })()));
    const request = new NextRequest('https://dashboard.flirtaiagency.com/creator-auth/upload', { method: 'POST', body, duplex: 'half', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, Origin: process.env.DASHBOARD_PUBLIC_ORIGIN, Accept: 'application/json', ...headers } });
    const response = await POST(request);
    if (!request.bodyUsed) await request.body.cancel();
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (!parallel) assert.deepEqual(stagingDirs(), before, 'Temporary upload files must be removed');
    return { code: response.status, status: result?.status };
  }
  if (process.env.CREATOR_UPLOAD_BOUNDARY_FIXTURE) assert.deepEqual(await upload(process.env.CREATOR_UPLOAD_BOUNDARY_FIXTURE, 'audit-boundary.mp4'), { code: 200, status: 'content_saved' });
  assert.deepEqual(await upload(short, 'short.mp4'), { code: 200, status: 'content_saved' });
  assert.deepEqual(await upload(large, 'short-large.mp4'), { code: 200, status: 'content_saved' });
  assert.equal(state.stored.at(-1).size, 80 * 1024 * 1024);
  assert.deepEqual(await upload(maximum, 'maximum.mp4'), { code: 200, status: 'content_saved' });
  assert.equal(state.stored.at(-1).size, 512 * 1024 * 1024);
  const audio = join(temp, 'voice.wav');
  execFileSync('/usr/bin/ffmpeg', ['-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-y',audio], { timeout:15000 });
  assert.equal((await upload(audio, 'voice.wav', 'audio/wav', {}, 'voice')).status, 'voice_saved');
  assert.equal((await upload(short, 'fake-voice.wav', 'audio/wav', {}, 'voice')).status, 'upload_wrong_type');
  assert.deepEqual(await upload(mov, 'iPhone.MOV', 'application/octet-stream'), { code: 200, status: 'content_saved' });
  assert.deepEqual(await upload(long, 'too-long.mp4'), { code: 400, status: 'upload_video_too_long' });
  assert.deepEqual(await upload(tooLarge, 'too-large.mp4'), { code: 400, status: 'upload_too_large' });
  assert.deepEqual(await upload(short, 'photo.png', 'image/png', {}, 'content_sfw_image'), { code: 400, status: 'upload_wrong_type' });
  assert.equal((await upload(short, 'short.mp4', 'video/mp4', { Origin: 'https://attacker.example' })).code, 403);
  assert.equal((await upload(short, 'short.mp4', 'video/mp4', { 'next-action': 'forged' })).code, 403);
  state.identity = null; assert.equal((await upload(short, 'short.mp4')).code, 401);
  state.identity = { accountId, readOnly: true }; assert.equal((await upload(short, 'short.mp4')).code, 403);
  state.identity = { accountId, readOnly: false }; state.status = 'rejected';
  assert.deepEqual(await upload(short, 'short.mp4'), { code: 409, status: 'application_locked' });
  state.status = 'submitted'; assert.equal((await upload(short, 'short.mp4')).code, 200);
  assert.equal((await upload(short, 'short.mp4', 'video/mp4', { 'x-pathname': '/agency', 'x-twin-audience': 'creator' })).code, 200);
  const count = state.stored.length; state.failInsert = true;
  assert.equal((await upload(short, 'short.mp4')).status, 'upload_metadata_error'); assert.equal(state.stored.length, count, 'Failed DB insert must remove the new object');
  state.failInsert = false;
  const simultaneous = [upload(short, 'parallel-a.mp4', 'video/mp4', {}, 'content_sfw_video', true), upload(short, 'parallel-b.mp4', 'video/mp4', {}, 'content_sfw_video', true)];
  const excess = await upload(short, 'parallel-c.mp4', 'video/mp4', {}, 'content_sfw_video', true);
  assert.equal(excess.status, 'upload_busy', 'A third transfer for the same account must wait');
  assert.deepEqual(await Promise.all(simultaneous), [{ code: 200, status: 'content_saved' }, { code: 200, status: 'content_saved' }], 'Two videos must upload together');
  assert.deepEqual(stagingDirs(), before, 'Concurrent staging must be cleaned');
  state.rows = [{ size_bytes: 10 * 1024 * 1024 * 1024 - statSync(short).size }];
  const quotaRace = await Promise.all([upload(short, 'quota-a.mp4', 'video/mp4', {}, 'content_sfw_video', true), upload(short, 'quota-b.mp4', 'video/mp4', {}, 'content_sfw_video', true)]);
  assert.deepEqual(quotaRace.map(result => result.status).sort(), ['content_saved', 'upload_quota'], 'Concurrent uploads must not overspend account quota');
  assert.deepEqual(stagingDirs(), before);
  console.log('BATCH UPLOAD REGRESSIONS PASSED: two concurrent transfers, third transfer bounded, concurrent quota enforcement and cleanup.');
  console.log('VIDEO UPLOAD REGRESSIONS PASSED: 46-second videos at 80 MB and 512 MB, MOV fallback, distinct size/duration errors, content validation, origin/auth/read-only/lock checks, rollback and temporary-file cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { rmSync(temp, { recursive: true, force: true }); rmSync(bundle, { force: true }); });
