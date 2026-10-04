"use strict";

// Offline transport regression only. This physically written synthetic byte
// fixture is not a playable video or evidence of real creator upload speed.
// Run: node deployment/creator-flow-upload-memory.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const FILE_BYTES = 512 * 1024 * 1024;
const MAX_CLIENT_RSS = 256 * 1024 * 1024;
const FILE_NAME = 'synthetic-512MiB-byte-fixture.bin';

async function client(file, destination) {
  const url = new URL(destination);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.protocol, 'http:');
  assert.equal(url.pathname, '/upload');
  let peakRss = process.memoryUsage().rss;
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  const timer = setInterval(sample, 10);
  try {
    const form = new FormData();
    form.set('kind', 'content_sfw_video');
    form.append('files', await fs.openAsBlob(file, { type: 'application/octet-stream' }), FILE_NAME);
    const response = await fetch(url, {
      method: 'POST', body: form, redirect: 'error',
      signal: AbortSignal.timeout(90000),
    });
    assert.equal(response.status, 201);
    const receipt = await response.json();
    assert.equal(receipt.fileBytes, FILE_BYTES);
    sample();
    assert.ok(peakRss < MAX_CLIENT_RSS, `Client RSS ${peakRss} exceeded bounded-memory target ${MAX_CLIENT_RSS}`);
    console.log(JSON.stringify({ status: response.status, peakRss, ...receipt }));
  } finally { clearInterval(timer); }
}

function writeFixture(file) {
  const chunk = Buffer.alloc(1024 * 1024);
  for (let offset = 0; offset < chunk.length; offset++) chunk[offset] = (offset * 29 + 11) % 251;
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'wx');
  try {
    for (let written = 0; written < FILE_BYTES; written += chunk.length) {
      let offset = 0;
      while (offset < chunk.length) offset += fs.writeSync(fd, chunk, offset, chunk.length - offset);
      hash.update(chunk);
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const stat = fs.statSync(file);
  assert.equal(stat.size, FILE_BYTES);
  if (process.platform === 'linux') assert.ok(stat.blocks * 512 >= FILE_BYTES, 'Fixture must be physically written, not sparse');
  return hash.digest('hex');
}

function receiver(expectedDigest) {
  return http.createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/upload');
      const type = request.headers['content-type'] || '';
      const boundary = /boundary=([^;]+)/.exec(type)?.[1];
      assert.ok(boundary && boundary.length < 100, 'Expected bounded multipart boundary');
      const contentLength = Number(request.headers['content-length']);
      assert.ok(contentLength > FILE_BYTES && contentLength < FILE_BYTES + 4096);
      const digest = createHash('sha256');
      let prefix = Buffer.alloc(0), tail = Buffer.alloc(0), fileStarted = false;
      let totalBytes = 0, fileBytes = 0;
      for await (let chunk of request) {
        totalBytes += chunk.length;
        if (!fileStarted) {
          // Preserve framing only, never the file. The first network chunk can
          // already contain payload, so apply the cap to the header boundary.
          prefix = Buffer.concat([prefix, chunk]);
          const name = prefix.indexOf(`name="files"; filename="${FILE_NAME}"`);
          const end = name < 0 ? -1 : prefix.indexOf('\r\n\r\n', name);
          if (end < 0) { assert.ok(prefix.length < 4096, 'Unexpected multipart prefix'); continue; }
          assert.ok(end < 4096, 'Unexpected multipart header length');
          assert.ok(prefix.subarray(0, name).toString().includes('content_sfw_video'));
          chunk = prefix.subarray(end + 4);
          prefix = Buffer.alloc(0);
          fileStarted = true;
        }
        const remaining = FILE_BYTES - fileBytes;
        const take = Math.min(remaining, chunk.length);
        if (take) { digest.update(chunk.subarray(0, take)); fileBytes += take; }
        if (take < chunk.length) {
          tail = Buffer.concat([tail, chunk.subarray(take)]);
          assert.ok(tail.length < 256, 'Unexpected multipart suffix');
        }
      }
      assert.equal(fileBytes, FILE_BYTES);
      assert.equal(totalBytes, contentLength);
      assert.equal(digest.digest('hex'), expectedDigest);
      assert.ok([`\r\n--${boundary}--`, `\r\n--${boundary}--\r\n`].includes(tail.toString()));
      response.writeHead(201, { 'Content-Type': 'application/json', Connection: 'close' });
      response.end(JSON.stringify({ fileBytes, multipartBytes: totalBytes, sha256Verified: true }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'text/plain', Connection: 'close' });
      response.end(error.message);
    }
  });
}

async function main() {
  assert.equal(typeof fs.openAsBlob, 'function', 'Requires Node with fs.openAsBlob support');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-flow-upload-memory-'));
  let server;
  try {
    const file = path.join(temporary, FILE_NAME);
    const expectedDigest = writeFixture(file);
    server = receiver(expectedDigest);
    server.requestTimeout = 90000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const started = performance.now();
    const child = spawn(process.execPath, [__filename, '--client', file, `http://127.0.0.1:${server.address().port}/upload`], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, NODE_OPTIONS: '' },
    });
    let stdout = '', stderr = '', observedPeakRss = 0, exceeded = false;
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const sample = () => {
      if (process.platform !== 'linux' || !child.pid) return;
      try {
        const status = fs.readFileSync(`/proc/${child.pid}/status`, 'utf8');
        const rss = Number(/^VmRSS:\s+(\d+)\s+kB/m.exec(status)?.[1] || 0) * 1024;
        const peak = Number(/^VmHWM:\s+(\d+)\s+kB/m.exec(status)?.[1] || 0) * 1024;
        observedPeakRss = Math.max(observedPeakRss, rss, peak);
        if (observedPeakRss >= MAX_CLIENT_RSS) { exceeded = true; child.kill('SIGKILL'); }
      } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
    };
    const timer = setInterval(sample, 10);
    const timeout = setTimeout(() => child.kill('SIGKILL'), 100000);
    let exit;
    try { exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); }
    finally { clearInterval(timer); clearTimeout(timeout); }
    assert.ok(!exceeded, `Observed client RSS ${observedPeakRss} exceeded ${MAX_CLIENT_RSS}`);
    assert.equal(exit.code, 0, `Client failed (${exit.signal || exit.code}): ${stderr}`);
    const result = JSON.parse(stdout.trim());
    const peakRss = Math.max(observedPeakRss, result.peakRss);
    assert.ok(peakRss < MAX_CLIENT_RSS);
    console.log(JSON.stringify({
      passed: true, test: 'offline file-backed multipart transport', node: process.version,
      fixture: 'physically written synthetic bytes; not playable media',
      fileBytes: result.fileBytes, multipartBytes: result.multipartBytes,
      httpStatus: result.status, sha256Verified: result.sha256Verified,
      clientPeakRssBytes: peakRss, maxClientRssBytes: MAX_CLIENT_RSS,
      elapsedMs: Math.round(performance.now() - started),
      limits: 'Loopback client memory only; no production, server validation, real-video performance or phone-speed claim',
    }));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

(process.argv[2] === '--client' ? client(process.argv[3], process.argv[4]) : main()).catch(error => {
  console.error(error.stack || error.message); process.exitCode = 1;
});
