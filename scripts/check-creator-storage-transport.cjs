/* Actual installed Supabase SDK + HTTP transport. Synthetic byte fixtures only;
 * this does not replace real-media validation or production Storage tests. */
const assert = require('node:assert/strict');
const { openAsBlob, openSync, ftruncateSync, closeSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { fork } = require('node:child_process');
const { createServer } = require('node:http');
const MiB = 1024 * 1024;

async function sender() {
  const [bundle, fixture, port, count] = process.argv.slice(3);
  const { createClient } = require('@supabase/supabase-js');
  const { creatorStorageFetch } = require(bundle);
  const db = createClient(`http://127.0.0.1:${port}`, 'sb_secret_synthetic_transport_only', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: creatorStorageFetch },
  });
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  try {
    await Promise.all(Array.from({ length: Number(count) }, async (_, index) => {
      const bytes = index === 0 ? 512 * MiB - 1024 : 512 * MiB;
      const blob = (await openAsBlob(fixture, { type: 'video/mp4' })).slice(0, bytes);
      const result = await db.storage.from('onboarding-content').upload(`creators/synthetic/${bytes}.mp4`, blob, {
        contentType: 'video/mp4', upsert: false, cacheControl: '3600',
      });
      assert.equal(result.error, null, 'Actual SDK object transfer must succeed');
    }));
    peak = Math.max(peak, process.memoryUsage().rss);
    // A former single file retained >512 MiB in fetch's redirect replay branch.
    // This leaves meaningful room for the rest of a 512 MiB production process.
    assert(peak < 384 * MiB, `Upload transport retained too much memory: ${peak} bytes`);
    process.send({ count: Number(count), peakRssBytes: peak, node: process.version });
  } finally { clearInterval(timer); }
}

// Exercise the real clients used by the legacy upload route and receipt path.
// Only the network destination is intercepted; SDK/client/permission code is real.
async function actualClientWiring(base) {
  const syntheticOrigin = "https://abcdefghijklmnopqrst.supabase.co";
  const previousFetch = globalThis.fetch;
  const environment = {
    SUPABASE_URL: syntheticOrigin, SUPABASE_SERVICE_KEY: "sb_secret_synthetic_transport_only",
    FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.flirt.example",
    DASHBOARD_SESSION_SECRET: "synthetic-operator-secret-for-offline-checks-only",
    CREATOR_SESSION_SECRET: "synthetic-creator-secret-for-offline-checks-only",
    DASHBOARD_PASSWORD: "synthetic-transport-password",
    DATABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined, VITE_SUPABASE_URL: undefined,
    SUPABASE_PUBLISHABLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
  };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const checked = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, syntheticOrigin, "Wiring test must never contact a real backend");
    assert.match(url.pathname, /^\/storage\/v1\/object\/onboarding-content\/creators\/synthetic-wiring\//);
    assert.equal(init?.redirect, "error", "Actual serviceClient/dashboardFetch binding omitted creatorStorageFetch");
    checked.push(url.pathname);
    return previousFetch(base + url.pathname + url.search, init);
  };
  try {
    require("tsx/cjs");
    const { serviceClient } = require(resolve("lib/supabase-service.ts"));
    const { withDashboardAccess } = require(resolve("lib/dashboard-access.ts"));
    const { supabaseAdmin } = require(resolve("lib/supabase.ts"));
    for (const [name, client] of [["service", serviceClient()], ["dashboard", supabaseAdmin]]) {
      await withDashboardAccess(null, async () => {
        const result = await client.storage.from("onboarding-content").upload(`creators/synthetic-wiring/${name}/1024.mp4`, new Blob([Buffer.alloc(1024)], { type: "video/mp4" }), {
          contentType: "video/mp4", upsert: false, cacheControl: "3600",
        });
        assert.equal(result.error, null, `${name} actual client must use the bounded transport`);
      });
    }
    assert.equal(checked.length, 2, "Both real production client paths must reach the isolated receiver");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'creator-storage-transport-'));
  const fixture = join(directory, 'synthetic-zero-byte-boundary.mp4');
  const bundle = join(directory, 'creator-storage-fetch.cjs');
  const fd = openSync(fixture, 'wx');
  try { ftruncateSync(fd, 512 * MiB); } finally { closeSync(fd); }
  require('esbuild').buildSync({ entryPoints: ['lib/creator-storage-fetch.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
  const { creatorStorageFetch } = require(bundle);
  const received = [];
  let redirectTargetHits = 0;
  const failures = [];
  const server = createServer(async (request, response) => {
    try {
      if (request.url.includes('redirect-write')) {
        request.resume(); response.writeHead(307, { Location: '/redirect-target' }); response.end(); return;
      }
      if (request.url === '/redirect-target') {
        redirectTargetHits++; request.resume(); response.end('unexpected'); return;
      }
      if (request.url.includes('redirect-read') || request.url.includes('redirect-other')) {
        request.resume(); response.writeHead(303, { Location: '/ordinary-target' }); response.end(); return;
      }
      if (request.url === '/ordinary-target') { response.end('ordinary redirect preserved'); return; }
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.authorization, 'Bearer sb_secret_synthetic_transport_only');
      assert.equal(request.headers.apikey, 'sb_secret_synthetic_transport_only');
      assert.equal(request.headers['x-upsert'], 'false');
      assert.match(request.headers['content-type'], /^multipart\/form-data;/);
      const parser = require('busboy')({ headers: request.headers });
      let bytes = 0, files = 0, cacheControl;
      parser.on('field', (name, value) => { if (name === 'cacheControl') cacheControl = value; });
      parser.on('file', (_name, file) => { files++; file.on('data', chunk => { bytes += chunk.length; }); });
      await new Promise((resolve, reject) => { parser.once('close', resolve); parser.once('error', reject); request.once('error', reject); request.pipe(parser); });
      assert.equal(files, 1); assert.equal(cacheControl, '3600');
      assert.equal(bytes, Number(request.url.match(/\/(\d+)\.mp4$/)[1]));
      received.push(bytes);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ Id: '00000000-0000-4000-8000-000000000001', Key: 'synthetic-local-only' }));
    } catch (error) { failures.push(error); response.writeHead(500); response.end('{}'); }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    await actualClientWiring(base);
    // The same transport policy covers SDK string URLs, URL objects and Requests.
    for (const method of ['POST', 'PUT']) {
      await assert.rejects(creatorStorageFetch(`${base}/storage/v1/object/onboarding-content/redirect-write`, { method, body: 'synthetic', redirect: 'follow' }));
      await assert.rejects(creatorStorageFetch(new Request(`${base}/storage/v1/object/voice-samples/redirect-write`, { method, body: 'synthetic' })));
    }
    assert.equal(redirectTargetHits, 0, 'No upload bytes or authentication may follow a redirect');
    assert.equal(await (await creatorStorageFetch(new URL(`${base}/storage/v1/object/onboarding-content/redirect-read`))).text(), 'ordinary redirect preserved');
    assert.equal(await (await creatorStorageFetch(`${base}/storage/v1/object/media/redirect-other`, { method: 'POST', body: 'synthetic' })).text(), 'ordinary redirect preserved');
    const results = [];
    for (const count of [1, 2]) {
      const started = Date.now();
      const metrics = await new Promise((resolve, reject) => {
        const child = fork(__filename, ['--sender', bundle, fixture, String(port), String(count)], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
        let report;
        const timer = setTimeout(() => { child.kill(); reject(new Error('Local upload transport test timed out')); }, 120000);
        child.once('message', value => { report = value; });
        child.once('error', reject);
        child.once('exit', code => { clearTimeout(timer); code === 0 && report ? resolve(report) : reject(new Error(`Upload sender exited ${code}`)); });
      });
      results.push({ ...metrics, elapsedMs: Date.now() - started });
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(received.sort((a, b) => a - b), [1024, 1024, 512 * MiB - 1024, 512 * MiB - 1024, 512 * MiB]);
    console.log(JSON.stringify({ passed: true, test: 'actual SDK to isolated local HTTP receiver; synthetic byte boundaries, not media/playback', received, results, actualClientWiring: ["serviceClient", "supabaseAdmin via dashboardFetch"], redirectsRejected: true }));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); }
}
(process.argv[2] === '--sender' ? sender() : main()).catch(error => { console.error(error); process.exitCode = 1; });
