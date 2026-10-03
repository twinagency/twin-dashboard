import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { boundedFormData } from '../lib/creator-upload-stream';
const staging = async () => (await readdir(tmpdir())).filter(name => name.startsWith('creator-upload-')).sort();
async function main() {
  const before = await staging();
  const header = '--test\r\nContent-Disposition: form-data; name="files"; filename="sample.mp4"\r\nContent-Type: video/mp4\r\n\r\n';
  const make = (data: string, signal?: AbortSignal) => new Request('https://dashboard.flirtaiagency.com/creator-auth/upload', { method: 'POST', body: data, signal, headers: { 'Content-Type': 'multipart/form-data; boundary=test' } });
  await assert.rejects(boundedFormData(make(header + 'truncated')), { message: 'upload_error' });
  await assert.rejects(boundedFormData(make(header + 'too large\r\n--test--\r\n'), { maxBytes: 10 }), { message: 'upload_too_large' });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(boundedFormData(make(header, aborted.signal)), { message: 'upload_interrupted' });
  const stalled = new Request('https://dashboard.flirtaiagency.com/creator-auth/upload', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(header)); } }), duplex: 'half',
  } as RequestInit);
  await assert.rejects(boundedFormData(stalled, { timeoutMs: 10 }), { message: 'upload_timeout' });
  assert.deepEqual(await staging(), before);
  console.log('STREAM CLEANUP PASSED: malformed, oversized, aborted and stalled uploads fail with distinct errors and leave no temporary files.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
