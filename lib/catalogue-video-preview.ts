import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceClient } from './supabase-service';
import { validBlur } from './catalogue-core';
import { createVideoPreview, createVideoPoster, probeVideoSource, MAX_VIDEO_PREVIEW_BYTES } from './catalogue-video-transform';
import { parseVideoSourceMetadata, type VideoSourceMetadata } from './catalogue-video-duration';

const cache = new Map<string, Buffer>();
const sourceMetadata = new Map<string, VideoSourceMetadata>();
const pending = new Map<string, Promise<Buffer>>();
let active = 0;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const METADATA_BUCKET = 'catalogue-video-metadata';
const MAX_METADATA_BYTES = 1024;
let metadataBucketReady: Promise<boolean> | undefined;

// Keep tiny server-only JSON apart from the media bucket's image/video allowlist.
// Check/create once per process; another instance may win the creation race.
function ensureMetadataBucket(): Promise<boolean> {
  return metadataBucketReady ??= (async () => {
    try {
      const storage = serviceClient().storage;
      let bucket = await storage.getBucket(METADATA_BUCKET);
      if (!bucket.data) {
        await storage.createBucket(METADATA_BUCKET, {
          public: false, allowedMimeTypes: ['application/json'], fileSizeLimit: MAX_METADATA_BYTES,
        });
        bucket = await storage.getBucket(METADATA_BUCKET);
      }
      const data = bucket.data;
      return !bucket.error && !!data && data.public === false &&
        Number(data.file_size_limit) === MAX_METADATA_BYTES &&
        Array.isArray(data.allowed_mime_types) && data.allowed_mime_types.length === 1 &&
        data.allowed_mime_types[0] === 'application/json';
    } catch { return false; }
  })();
}

async function readSourceMetadata(path: string): Promise<VideoSourceMetadata | null> {
  try {
    if (!await ensureMetadataBucket()) return null;
    const saved = await serviceClient().storage.from(METADATA_BUCKET).download(path);
    return saved.data && saved.data.size <= MAX_METADATA_BYTES
      ? parseVideoSourceMetadata(JSON.parse(await saved.data.text())) : null;
  } catch { return null; }
}

async function persistSourceMetadata(path: string, metadata: VideoSourceMetadata): Promise<void> {
  try {
    if (!await ensureMetadataBucket()) return;
    await serviceClient().storage.from(METADATA_BUCKET).upload(path, JSON.stringify(metadata), {
      contentType: 'application/json', upsert: true,
    });
  } catch { /* The measured duration remains in memory; preview delivery is independent. */ }
}

export type VideoPreviewSources = { url: string; posterUrl: string; seconds: number; durationSeconds?: number };
function previewKey(path: string, blur: number) {
  return createHash('sha256').update(`video-v2:${path}:${blur}`).digest('hex');
}

export async function videoPreviewSources(path: string, blur: number): Promise<VideoPreviewSources> {
  await renderVideoPreview(path, blur);
  const stem = `catalogue-previews/video-v2/${previewKey(path, blur)}`;
  const signed = await serviceClient().storage.from('media').createSignedUrls([`${stem}.mp4`, `${stem}.webp`], 3600);
  const url = signed.data?.find(item => item.path === `${stem}.mp4`)?.signedUrl;
  const posterUrl = signed.data?.find(item => item.path === `${stem}.webp`)?.signedUrl;
  if (signed.error || !url || !posterUrl) throw new Error('Preview unavailable.');
  // These native HTTP sources support Safari range requests. Both are protected derivatives.
  return { url, posterUrl, seconds: 5, durationSeconds: sourceMetadata.get(previewKey(path, blur))?.durationSeconds };
}

export async function renderVideoPreview(path: string, blur: number): Promise<Buffer> {
  if (!validBlur(blur)) throw new Error('Preview unavailable.');
  const key = previewKey(path, blur);
  const hit = cache.get(key);
  if (hit) return hit;
  const waiting = pending.get(key);
  if (waiting) return waiting;
  if (pending.size >= 8) throw new Error('Preview busy. Please try again.');
  const work = (async () => {
    const storage = serviceClient().storage.from('media');
    const destination = `catalogue-previews/video-v2/${key}.mp4`;
    const posterDestination = `catalogue-previews/video-v2/${key}.webp`;
    const metadataDestination = `catalogue-previews/video-v2/${key}.json`;
    // Private derivatives survive restarts. Neither signed original URLs nor storage paths reach fans.
    const [saved, posterSaved, savedMetadata] = await Promise.all([
      storage.download(destination), storage.download(posterDestination), readSourceMetadata(metadataDestination),
    ]);
    let metadata = savedMetadata;
    const savedBytes = saved.data && saved.data.size <= MAX_VIDEO_PREVIEW_BYTES && posterSaved.data
      ? Buffer.from(await saved.data.arrayBuffer()) : null;
    if (savedBytes && metadata) {
      remember(key, savedBytes, metadata); return savedBytes;
    }
    if (active >= 2) throw new Error('Preview busy. Please try again.');
    active++;
    let directory: string | undefined;
    let stage = 'download';
    try {
      directory = await mkdtemp(join(tmpdir(), 'catalogue-video-'));
      const source = join(directory, 'source'), output = join(directory, 'preview.mp4'), poster = join(directory, 'poster.webp');
      const signed = await storage.createSignedUrl(path, 60);
      if (signed.error || !signed.data) throw new Error('Preview unavailable.');
      const response = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(60_000), cache: 'no-store', redirect: 'error' });
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
      // Older cached previews need only a metadata probe, never a replacement encode.
      // The duration always comes from the original, not the five-second derivative.
      const durationSeconds = savedBytes
        ? await probeVideoSource(source)
        : await createVideoPreview(source, output, blur);
      metadata = { version: 1, durationSeconds };
      // Persistence is best-effort: a metadata outage never prevents new video previews.
      await persistSourceMetadata(metadataDestination, metadata);
      if (savedBytes) { remember(key, savedBytes, metadata); return savedBytes; }
      stage = 'poster';
      await createVideoPoster(output, poster);
      stage = 'upload';
      const bytes = await readFile(output);
      const uploads = await Promise.all([
        storage.upload(destination, bytes, { contentType: 'video/mp4', upsert: true }),
        storage.upload(posterDestination, await readFile(poster), { contentType: 'image/webp', upsert: true }),
      ]);
      if (uploads.some(result => result.error)) throw new Error('Preview unavailable.');
      remember(key, bytes, metadata); return bytes;
    } catch (error) {
      // A missing/invalid original must not break an already usable protected preview.
      // Omit unknown length rather than mislabel the five-second preview as the full video.
      if (savedBytes) { remember(key, savedBytes, metadata); return savedBytes; }
      if (error instanceof Error && error.cause) throw error;
      const reason = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'invalid';
      throw new Error('Preview unavailable.', { cause: { stage, reason } });
    } finally { active--; if (directory) await rm(directory, { recursive: true, force: true }); }
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

function remember(key: string, bytes: Buffer, metadata: VideoSourceMetadata | null) {
  while (cache.size >= 24) {
    const oldest = cache.keys().next().value!;
    cache.delete(oldest); sourceMetadata.delete(oldest);
  }
  if (metadata) sourceMetadata.set(key, metadata);
  cache.set(key, bytes);
}
