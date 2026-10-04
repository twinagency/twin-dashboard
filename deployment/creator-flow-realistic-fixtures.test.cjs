"use strict";

// Offline/local proof for a future realistic upload mode. Long fixtures contain
// actual repeated synthetic motion, not padding or sparse bytes. This file does
// not contact a backend, run an upload, or establish phone transfer speed.
// Run: node deployment/creator-flow-realistic-fixtures.test.cjs [--keep]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const FFMPEG = '/usr/bin/ffmpeg', FFPROBE = '/usr/bin/ffprobe';
const LIMIT = 536870912;
const FPS = 24;
const fixtures = [
  { name: 'realistic-45s-landscape-1080p-h264.mp4', seconds: 45, width: 1920, height: 1080, codec: 'h264', bitrate: '4M', seed: 'landscape-h264' },
  { name: 'realistic-5min-portrait-1080p-h264.mp4', seconds: 300, width: 1080, height: 1920, codec: 'h264', bitrate: '4M', seed: 'portrait-h264' },
  { name: 'realistic-10min-landscape-1080p-h264.mov', seconds: 600, width: 1920, height: 1080, codec: 'h264', bitrate: '4M', seed: 'landscape-h264' },
  { name: 'realistic-12s-portrait-1080p-hevc.mov', seconds: 12, width: 1080, height: 1920, codec: 'hevc', bitrate: '4M', seed: 'portrait-hevc', optional: true },
  { name: 'realistic-8s-landscape-4k-h264.mp4', seconds: 8, width: 3840, height: 2160, codec: 'h264', bitrate: '16M', seed: 'landscape-4k', optional: true },
];
// wait4-backed child usage avoids /proc PID-namespace mismatches in hosted CI.
// This measurement wrapper is local test infrastructure, not a runtime need.
const MEASURE = `import json, os, resource, subprocess, sys
try:
    result = subprocess.run(sys.argv[2:], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=float(sys.argv[1]))
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    with os.fdopen(3, 'w') as metrics:
        json.dump({'peakRssBytes': int(usage.ru_maxrss * 1024), 'cpuMs': round((usage.ru_utime + usage.ru_stime) * 1000)}, metrics)
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    sys.exit(result.returncode)
except subprocess.TimeoutExpired:
    sys.stderr.write('Fixture subprocess timed out')
    sys.exit(124)
`;

async function measured(program, args, label, timeoutMs = 90000) {
  const started = performance.now();
  const child = spawn('python3', ['-c', MEASURE, String(timeoutMs / 1000), program, ...args], {
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH },
  });
  let stdout = '', stderr = '', metrics = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-10000); });
  child.stdio[3].on('data', data => { metrics += data; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs + 5000);
  let result;
  try { result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); }
  finally { clearTimeout(timeout); }
  assert.equal(result.code, 0, `${label} failed (${result.signal || result.code}): ${stderr}`);
  const usage = JSON.parse(metrics);
  assert.ok(usage.peakRssBytes > 0 && Number.isFinite(usage.cpuMs));
  return { stdout, label, elapsedMs: Math.round(performance.now() - started), ...usage };
}

function seedArguments(fixture, output) {
  const common = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-filter_threads', '1', '-f', 'lavfi', '-i',
    `testsrc2=size=${fixture.width}x${fixture.height}:rate=${FPS}`, '-t', '1', '-an', '-threads', '1',
    '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-g', String(FPS), '-bf', '0', '-b:v', fixture.bitrate];
  const codec = fixture.codec === 'hevc'
    ? ['-c:v', 'libx265', '-tag:v', 'hvc1', '-x265-params', 'pools=none:frame-threads=1:wpp=0:keyint=24:min-keyint=24:scenecut=0:vbv-maxrate=4000:vbv-bufsize=4000:strict-cbr=1:log-level=error']
    : ['-c:v', 'libx264', '-tune', 'zerolatency', '-minrate', fixture.bitrate, '-maxrate', fixture.bitrate,
      '-bufsize', fixture.bitrate, '-keyint_min', String(FPS), '-sc_threshold', '0', '-x264-params', 'nal-hrd=cbr:force-cfr=1:filler=1'];
  return [...common, ...codec, '-movflags', '+faststart', '-y', output];
}

async function generate(directory) {
  const encoders = execFileSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.match(encoders, /\blibx264\b/, 'H.264 encoder required');
  const output = [], timings = [], skipped = [], seeds = new Map();
  for (const fixture of fixtures) {
    if (fixture.codec === 'hevc' && !/\blibx265\b/.test(encoders)) { skipped.push(`${fixture.name}: libx265 unavailable`); continue; }
    const seed = path.join(directory, fixture.seed + '.mp4');
    if (!seeds.has(fixture.seed)) {
      const metric = await measured(FFMPEG, seedArguments(fixture, seed), `encode ${fixture.seed}`);
      timings.push(metric); seeds.set(fixture.seed, seed);
    }
    const file = path.join(directory, fixture.name);
    timings.push(await measured(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-stream_loop', '-1', '-i', seed,
      '-t', String(fixture.seconds), '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', '-y', file], `remux ${fixture.name}`));
    const inspection = await measured(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=codec_name,width,height,r_frame_rate,duration,nb_frames,codec_tag_string:format=duration,size,bit_rate', '-of', 'json', file], `probe ${fixture.name}`);
    const info = JSON.parse(inspection.stdout), stream = info.streams[0], size = fs.statSync(file).size;
    assert.equal(stream.codec_name, fixture.codec);
    assert.equal(stream.width, fixture.width); assert.equal(stream.height, fixture.height);
    assert.equal(stream.r_frame_rate, `${FPS}/1`);
    assert.ok(Math.abs(Number(info.format.duration) - fixture.seconds) <= 1 / FPS, 'Actual muxed duration must match');
    assert.equal(Number(stream.nb_frames), fixture.seconds * FPS, 'Long fixture contains full actual frame timeline');
    assert.equal(Number(info.format.size), size);
    assert.ok(size > 0 && size < LIMIT, 'Normal fixture must fit the product byte limit');
    if (fixture.codec === 'hevc') assert.equal(stream.codec_tag_string, 'hvc1');
    const bitrate = Number(info.format.bit_rate);
    assert.ok(bitrate >= (fixture.width === 3840 ? 8e6 : 2e6) && bitrate <= (fixture.width === 3840 ? 24e6 : 8e6), 'Normal-use bitrate unexpectedly low/high');
    const hashes = [];
    for (const position of [0.125, 0.625, fixture.seconds - 0.375]) {
      const hash = await measured(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1', '-ss', String(position),
        '-i', file, '-filter_threads', '1', '-vf', 'scale=64:36', '-frames:v', '1', '-f', 'md5', '-'], `decode ${fixture.name}@${position}`);
      assert.match(hash.stdout, /^MD5=[a-f0-9]{32}\s*$/);
      hashes.push(hash.stdout.trim());
    }
    assert.notEqual(hashes[0], hashes[1], 'Seed must contain actual changing frames');
    assert.equal(hashes[1], hashes[2], 'Synthetic seed loop reaches the actual final second');
    output.push({ name: fixture.name, durationSeconds: Number(info.format.duration), bytes: size, resolution: `${stream.width}x${stream.height}`,
      codec: stream.codec_name, container: path.extname(file).slice(1), frames: Number(stream.nb_frames), bitrateBitsPerSecond: bitrate,
      movingFramesVerified: true, finalSecondDecoded: true, repeatedSeedSeconds: 1 });
  }
  return { fixtures: output, skipped, generation: timings.map(({ stdout, ...metric }) => metric),
    totalBytes: output.reduce((sum, fixture) => sum + fixture.bytes, 0),
    generationElapsedMs: timings.reduce((sum, metric) => sum + metric.elapsedMs, 0),
    generationCpuMs: timings.reduce((sum, metric) => sum + metric.cpuMs, 0),
    peakFfmpegRssBytes: Math.max(...timings.map(metric => metric.peakRssBytes)) };
}

async function main() {
  assert.ok(process.argv.slice(2).every(arg => arg === '--keep'), 'Only optional --keep is accepted');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-flow-realistic-fixtures-'));
  const keep = process.argv.includes('--keep');
  try {
    const result = await generate(directory);
    console.log(JSON.stringify({ passed: true, method: 'offline single-second synthetic motion seeds, stream-copy looped into actual video timelines',
      ...result, ...(keep ? { retainedDirectory: directory } : {}), productionCalls: 0,
      limitations: ['Repeated synthetic content is not a natural camera recording.', 'No audio, iPhone HDR, variable frame rate, rotation metadata or native Photos export tested.',
        'Local CPU/RSS and disk timings do not predict live-container headroom or creator upload speed.', 'Encoder/remux CPU and peak RSS come from Linux child resource usage; excludes the app and measurement wrapper.'] }, null, 2));
  } finally { if (!keep) fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { generate, seedArguments };
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
