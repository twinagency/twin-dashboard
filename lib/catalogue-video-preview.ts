import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceClient } from './supabase-service';
import { validBlur } from './catalogue-core';
import { createVideoPreview, MAX_VIDEO_PREVIEW_BYTES } from './catalogue-video-transform';

const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let active = 0;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export async function renderVideoPreview(path: string, blur: number): Promise<Buffer> {
  if (!validBlur(blur)) throw new Error('Preview unavailable.');
  const key = createHash('sha256').update(`video-v1:${path}:${blur}`).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;
  const waiting = pending.get(key);
  if (waiting) return waiting;
  if (pending.size >= 8) throw new Error('Preview busy. Please try again.');
  const work = (async () => {
    const storage = serviceClient().storage.from('media');
    const destination = `catalogue-previews/video-v1/${key}.mp4`;
    // Private derivatives survive restarts. Neither signed original URLs nor storage paths reach fans.
    const saved = await storage.download(destination);
    if (saved.data && saved.data.size <= MAX_VIDEO_PREVIEW_BYTES) {
      const bytes = Buffer.from(await saved.data.arrayBuffer());
      remember(key, bytes); return bytes;
    }
    if (active >= 2) throw new Error('Preview busy. Please try again.');
    active++;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'catalogue-video-'));
      const source = join(directory, 'source'), output = join(directory, 'preview.mp4');
      const signed = await storage.createSignedUrl(path, 60);
      if (signed.error || !signed.data) throw new Error('Preview unavailable.');
      const response = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(20_000), cache: 'no-store', redirect: 'error' });
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) {
        await response.body?.cancel(); throw new Error('Preview unavailable.');
      }
      const file = await open(source, 'wx', 0o600), reader = response.body.getReader();
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_SOURCE_BYTES) throw new Error('Preview unavailable.');
          await file.writeFile(chunk.value);
        }
      } finally { await reader.cancel().catch(() => {}); await file.close(); }
      await createVideoPreview(source, output, blur);
      const bytes = await readFile(output);
      // A cache write failure must not prevent this already-protected preview from displaying.
      await storage.upload(destination, bytes, { contentType: 'video/mp4', upsert: false });
      remember(key, bytes); return bytes;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Preview ')) throw error;
      throw new Error('Preview unavailable.');
    } finally { active--; if (directory) await rm(directory, { recursive: true, force: true }); }
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

function remember(key: string, bytes: Buffer) {
  while (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, bytes);
}
