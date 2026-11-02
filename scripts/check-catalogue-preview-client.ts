import assert from 'node:assert/strict';
import { createPreviewLoader, PreviewLoadError, type PreviewCall } from '../lib/catalogue-preview-client';

const image = () => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'content-type': 'image/webp' } });
const source = () => Response.json({ url: 'https://example.test/protected.mp4', posterUrl: 'https://example.test/protected.webp', seconds: 5 });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

async function main() {
  let now = 0;
  const loader = createPreviewLoader({ now: () => now, wait: async () => {} });
  let activePhotos = 0, activeVideos = 0, peakPhotos = 0, peakVideos = 0, calls = 0;
  const release: Array<() => void> = [];
  const call: PreviewCall = async (_action, body) => {
    calls++;
    const video = body?.type === 'video';
    if (video) peakVideos = Math.max(peakVideos, ++activeVideos);
    else peakPhotos = Math.max(peakPhotos, ++activePhotos);
    await new Promise<void>(resolve => release.push(resolve));
    if (video) { activeVideos--; assert.equal(body?.delivery, 'native'); return source(); }
    activePhotos--; assert.equal(body?.delivery, undefined); return image();
  };
  // A five-photo sale mosaic, another bundle and the grid can all intersect at
  // once. Previously they sent >8 simultaneous photo transforms and lost tiles.
  const batch = Array.from({ length: 18 }, (_, i) => loader.photo(call, `photo-${i}`, 11));
  const duplicate = loader.photo(call, 'photo-0', 11);
  const videos = Array.from({ length: 6 }, (_, i) => loader.video(call, `video-${i}`, 11));
  await tick();
  assert.equal(calls, 5, 'only three photos and two videos may start together');
  for (let i = 0; i < 15; i++) { release.splice(0).forEach(done => done()); await tick(); }
  const photos = await Promise.all(batch); await Promise.all(videos);
  assert.equal(await duplicate, photos[0], 'mosaic and detail share the same pending request');
  assert.equal(calls, 24, 'duplicates do not consume a network request');
  assert.equal(peakPhotos, 3); assert.equal(peakVideos, 2);
  assert.equal(await loader.photo(call, 'photo-0', 11), photos[0], 'reopening detail reuses protected bytes');
  assert.equal(calls, 24);

  async function complete(promise: Promise<unknown>) { await tick(); release.splice(0).forEach(done => done()); return promise; }
  await complete(loader.photo(call, 'photo-0', 12)); assert.equal(calls, 25, 'blur changes invalidate the cache key');
  await complete(loader.photo(call, 'photo-0', 11, true)); assert.equal(calls, 26, 'manual retry refreshes failed or expired playback sources');
  now = 300_001;
  await complete(loader.photo(call, 'photo-0', 11)); assert.equal(calls, 27, 'cache expires');
  let otherCalls = 0;
  await loader.photo(async () => { otherCalls++; return image(); }, 'photo-0', 11);
  assert.equal(otherCalls, 1, 'a different creator/session call cannot reuse cached media');

  let attempts = 0; const pauses: number[] = [];
  const retryLoader = createPreviewLoader({ wait: async ms => { pauses.push(ms); } });
  await retryLoader.photo(async () => ++attempts < 3 ? Response.json({ error: 'Preview busy. Please try again.' }, { status: 503 }) : image(), 'busy', 11);
  assert.equal(attempts, 3); assert.deepEqual(pauses, [1500, 3000], 'busy requests recover with bounded backoff');
  attempts = 0;
  const network: PreviewCall = async () => { if (++attempts < 2) throw new TypeError('Network failed'); return image(); };
  await retryLoader.photo(network, 'network', 11); assert.equal(attempts, 2);
  for (const status of [401, 403, 404]) {
    attempts = 0;
    const denied: PreviewCall = async () => { attempts++; return Response.json({ error: 'Denied' }, { status }); };
    await assert.rejects(retryLoader.photo(denied, 'denied', 11), e => e instanceof PreviewLoadError && e.kind === (status === 404 ? 'unavailable' : 'session'));
    assert.equal(attempts, 1, 'permanent errors must not retry');
    await assert.rejects(retryLoader.photo(denied, 'denied', 11));
    assert.equal(attempts, 2, 'failed requests are evicted so another attempt can recover');
  }
  attempts = 0;
  await assert.rejects(retryLoader.video(async () => { attempts++; return Response.json({ error: 'Unavailable' }, { status: 503 }); }, 'bad', 11));
  assert.equal(attempts, 4, 'a failing source cannot retry forever');
  await assert.rejects(retryLoader.photo(async () => new Response('not an image'), 'invalid', 11), PreviewLoadError);
  console.log('Catalogue preview client passed: bounded burst, pending deduplication, protected cache isolation/expiry, transient recovery and terminal error handling.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
