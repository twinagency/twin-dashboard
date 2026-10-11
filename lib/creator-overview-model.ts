export type OverviewPhotoConfig = { id: string; position?: string; label?: string };
export type OverviewConfig = {
  enabled: true;
  hero: OverviewPhotoConfig;
  avatar: OverviewPhotoConfig;
  library: OverviewPhotoConfig[];
  campaign: OverviewPhotoConfig;
};
export type OverviewPhoto = { id: string; url: string; position: string; label: string; stars: number };
export type CreatorOverviewPresentation = {
  id: string;
  name: string;
  hero: OverviewPhoto | null;
  avatar: OverviewPhoto | null;
  library: OverviewPhoto[];
  campaign?: OverviewPhoto;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const photoConfig = (value: unknown): value is OverviewPhotoConfig => !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && uuid.test(value.id);
export function overviewConfig(intake: unknown): OverviewConfig | null {
  if (!intake || typeof intake !== 'object') return null;
  const config = (intake as { appearance?: { overview?: unknown } }).appearance?.overview;
  if (!config || typeof config !== 'object') return null;
  const c = config as OverviewConfig;
  if (c.enabled !== true || !photoConfig(c.hero) || !photoConfig(c.avatar) || !photoConfig(c.campaign) || !Array.isArray(c.library) || c.library.length !== 3 || !c.library.every(photoConfig)) return null;
  const ids = [c.hero, c.avatar, ...c.library, c.campaign].map(p => p.id);
  return new Set(ids).size === 6 ? c : null;
}
export function uniqueOverviewPaths(photos: { id: string; storage_path: string }[], ids: string[]): boolean {
  return ids.length === 6 && new Set(ids).size === 6 && photos.length === 6 && ids.every(id => photos.some(p => p.id === id)) && photos.every(p => !!p.storage_path) && new Set(photos.map(p => p.storage_path)).size === 6;
}

