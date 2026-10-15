// Read-only diagnosis of four existing catalogue preview failures. No media or
// database writes; source bytes stay in a temporary directory inside the host.
const assert = require('node:assert/strict');
const { mkdtemp, open, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const run = promisify(execFile);
const expected = new Map([
  ['939f5799-692e-4feb-ab88-ec75e0fbcf56', 48408577],
  ['a55c1149-7f81-43e2-9b4a-9d523dfe35fb', 49302346],
  ['b5a18847-7c8a-43ee-8200-86b1c957436e', 45426212],
  ['e0ea6098-1628-4365-b276-d559f3a1cbbd', 46219264],
]);
const origin = 'https://aouaenqayfltoqrmpitg.supabase.co';
async function get(path) {
  assert(path.startsWith('/rest/v1/videos?') || path.startsWith('/storage/v1/object/authenticated/media/'));
  const response = await fetch(origin + path, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } });
  assert(response.ok, `Read-only request failed with HTTP ${response.status}`);
  return response;
}
async function inspectBoxes(filename, length) {
  const file = await open(filename, 'r');
  const boxes = [];
  try {
    let offset = 0;
    while (offset + 8 <= length && boxes.length < 30) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await file.read(header, 0, 16, offset);
      if (bytesRead < 8) break;
      let size = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8).replace(/[^a-zA-Z0-9 ]/g, '?');
      if (size === 1 && bytesRead >= 16) size = Number(header.readBigUInt64BE(8));
      if (size === 0) size = length - offset;
      boxes.push({ type, offset, size, beyondFile: offset + size > length });
      if (size < 8 || !Number.isSafeInteger(size) || offset + size > length) break;
      offset += size;
    }
    return boxes;
  } finally { await file.close(); }
}
async function main() {
  assert.equal(process.env.SUPABASE_URL, origin);
  assert.notEqual(process.env.FLIRT_BACKEND_ENABLED, 'true');
  assert(process.env.SUPABASE_SERVICE_KEY);
  const query = new URLSearchParams({ select: 'id,clone_id,storage_path', id: `in.(${[...expected.keys()].join(',')})` });
  const rows = await (await get('/rest/v1/videos?' + query)).json();
  assert.equal(rows.length, expected.size);
  const results = [];
  for (const row of rows) {
    assert(expected.has(row.id));
    assert.equal(row.clone_id, '0328e7b3-a1e5-465a-9a30-c9cf6519cba1');
    assert(row.storage_path.startsWith(row.clone_id + '/videos/'));
    const directory = await mkdtemp(join(tmpdir(), 'catalogue-read-only-'));
    try {
      const filename = join(directory, 'source');
      const source = await get('/storage/v1/object/authenticated/media/' + row.storage_path.split('/').map(encodeURIComponent).join('/'));
      const file = await open(filename, 'wx', 0o600);
      let bytes = 0;
      try {
        for await (const chunk of source.body) {
          bytes += chunk.length;
          assert(bytes <= 50 * 1024 * 1024, 'Diagnostic source exceeds fixed read limit');
          await file.writeFile(chunk);
        }
      } finally { await file.close(); }
      const result = { id: row.id, bytes, expectedBytes: expected.get(row.id), matchesStoredSize: bytes === expected.get(row.id), boxes: await inspectBoxes(filename, bytes) };
      try {
        const probe = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', filename], { timeout: 15000, maxBuffer: 65536 });
        const metadata = JSON.parse(probe.stdout);
        result.probeValid = true;
        result.duration = Number(metadata.format?.duration) || null;
        result.stream = metadata.streams?.[0] ?? null;
      } catch (error) {
        result.probeValid = false;
        const stderr = String(error.stderr || '').toLowerCase();
        result.reason = /moov atom not found/.test(stderr) ? 'missing_moov_atom'
          : /partial file/.test(stderr) ? 'partial_file'
          : /invalid data/.test(stderr) ? 'invalid_container'
          : error.killed ? 'probe_timeout' : 'probe_rejected';
      }
      results.push(result);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  console.log(JSON.stringify({ passed: true, diagnosticCompleted: true, readOnly: true, results, temporaryFilesRemoved: true, credentialsLogged: false }));
}
main().catch(() => { console.log(JSON.stringify({ passed: false, failure: 'Read-only source diagnostic could not complete', credentialsLogged: false })); process.exitCode = 1; });
