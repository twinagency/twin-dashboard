import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_BLUR, validBlur } from './catalogue-core';

type Creator = { id: string; slug: string | null };
export type AuditVideo = { id: string; clone_id: string; storage_path: string };
type Setting = { clone_id: string; blur_strength: number | null };
export type CatalogueInventory = { creators: Creator[]; videos: AuditVideo[]; settings: Setting[] };
const PAGE_SIZE = 200;
const stages = new Set(['download', 'probe', 'metadata', 'encode', 'output', 'poster', 'upload']);
const reasons = new Set(['timeout', 'killed', 'invalid']);

/** Keyset pagination continues until an empty page, even if the server caps page size. */
export async function readCatalogueInventory(db: Pick<SupabaseClient, 'from'>): Promise<CatalogueInventory> {
  async function read<T>(table: string, columns: string, key: string): Promise<T[]> {
    let after: string | null = null;
    const rows: T[] = [], seen = new Set<string>();
    for (;;) {
      let query = db.from(table).select(columns).order(key, { ascending: true }).limit(PAGE_SIZE);
      if (after !== null) query = query.gt(key, after);
      const result = await query.abortSignal(AbortSignal.timeout(20_000));
      if (result.error || !Array.isArray(result.data)) throw new Error('Catalogue inventory unavailable.');
      if (!result.data.length) return rows;
      for (const row of result.data as unknown as Record<string, unknown>[]) {
        const id = row[key];
        if (typeof id !== 'string' || !id || seen.has(id) || after !== null && id <= after)
          throw new Error('Catalogue inventory pagination is incomplete.');
        seen.add(id); after = id; rows.push(row as T);
      }
    }
  }
  const [creators, videos, settings] = await Promise.all([
    read<Creator>('clones', 'id,slug', 'id'),
    read<AuditVideo>('videos', 'id,clone_id,storage_path', 'id'),
    read<Setting>('creator_catalogue_settings', 'clone_id,blur_strength', 'clone_id'),
  ]);
  if (creators.some(c => typeof c.id !== 'string' || c.slug !== null && typeof c.slug !== 'string') ||
      videos.some(v => typeof v.id !== 'string' || typeof v.clone_id !== 'string' || typeof v.storage_path !== 'string' || !v.storage_path))
    throw new Error('Catalogue inventory is invalid.');
  return { creators, videos, settings };
}

export async function auditCataloguePreviews(inventory: CatalogueInventory,
  check: (video: AuditVideo, blur: number) => Promise<void>,
  options: { inventoryOnly?: boolean; maxRunMs?: number; now?: () => number; onProgress?: (value: unknown) => void } = {}) {
  const now = options.now ?? Date.now, started = now(), maxRunMs = options.maxRunMs ?? 360_000;
  if (!Number.isFinite(maxRunMs) || maxRunMs <= 0) throw new Error('Audit duration must be positive.');
  const results = inventory.creators.map(creator => ({ creatorId: creator.id, slug: creator.slug,
    videos: 0, checked: 0, passed: 0, failed: 0, status: 'no_videos' as 'no_videos' | 'not_checked' | 'passed' | 'failed' | 'incomplete' }));
  const owners = new Map(results.map(row => [row.creatorId, row]));
  const blur = new Map(inventory.settings.map(row => [row.clone_id, validBlur(row.blur_strength) ? row.blur_strength as number : DEFAULT_BLUR]));
  const failures: { creatorId: string; videoId: string; stage: string; reason: string }[] = [];
  const queue: AuditVideo[] = [];
  for (const video of inventory.videos) {
    const owner = owners.get(video.clone_id);
    if (!owner) { failures.push({ creatorId: video.clone_id, videoId: video.id, stage: 'inventory', reason: 'unknown_creator' }); continue; }
    owner.videos++; owner.status = 'not_checked'; queue.push(video);
  }
  let next = 0;
  async function worker() {
    while (next < queue.length && now() - started < maxRunMs) {
      const video = queue[next++], owner = owners.get(video.clone_id)!;
      try { await check(video, blur.get(video.clone_id) ?? DEFAULT_BLUR); owner.passed++; }
      catch (error) {
        owner.failed++;
        const cause = error instanceof Error ? error.cause as { stage?: string; reason?: string } | undefined : undefined;
        failures.push({ creatorId: owner.creatorId, videoId: video.id,
          stage: stages.has(cause?.stage ?? '') ? cause!.stage! : 'verification',
          reason: reasons.has(cause?.reason ?? '') ? cause!.reason! : 'failed' });
      }
      owner.checked++;
      options.onProgress?.({ event: 'video_checked', creatorId: owner.creatorId, videoId: video.id,
        checked: owner.checked, total: owner.videos, passed: owner.passed, failed: owner.failed });
    }
  }
  if (!options.inventoryOnly) await Promise.all([worker(), worker()]);
  for (const owner of results) {
    owner.status = !owner.videos ? 'no_videos' : options.inventoryOnly ? 'not_checked' :
      owner.checked < owner.videos ? 'incomplete' : owner.failed ? 'failed' : 'passed';
  }
  const checked = results.reduce((sum, owner) => sum + owner.checked, 0);
  const verificationComplete = !options.inventoryOnly && checked === queue.length;
  return { schemaVersion: 'catalogue-preview-audit.v1', scope: 'all-creators', inventoryComplete: true,
    verificationComplete, creatorsDiscovered: results.length, creatorsWithVideos: results.filter(c => c.videos > 0).length,
    creatorsWithoutVideos: results.filter(c => !c.videos).length, videosDiscovered: inventory.videos.length,
    checked, passed: results.reduce((sum, owner) => sum + owner.passed, 0), failed: failures.length,
    unchecked: queue.length - checked, results, failures };
}
