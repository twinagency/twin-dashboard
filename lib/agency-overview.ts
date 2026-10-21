import { signDashboardMedia } from "./media-signing-cache";
import { supabaseAdmin } from './supabase';
import { getDashboardAccess } from './dashboard-access';
import { chartColorForClone, profileImagePathForClone } from './colors';
import { getOverviewAudience } from './creator-overview';
import { agencyOverviewPhotos, type AgencyOverviewCrop, type AgencyOverviewPresentation } from './agency-overview-model';

export async function getAgencyOverview(): Promise<AgencyOverviewPresentation> {
  const access = await getDashboardAccess();
  if (!access || access.name.trim().toLowerCase() !== 'flirt' || access.id.startsWith('creator:')) {
    throw new Error('Agency overview access denied');
  }
  if (!access.cloneIds.length) return { creators: [], audience: { total: 0 } };
  const { data: clones, error } = await supabaseAdmin.from('clones')
    .select('id,name,intake').in('id', access.cloneIds).order('created_at', { ascending: true });
  if (error || !clones) throw new Error('The agency creators could not be loaded.');
  const photoIds = clones.flatMap(c => { const selected = agencyOverviewPhotos[c.id] || {}; return [selected.portrait, selected.card, selected.hero].filter((id): id is string => !!id); });
  const { data: photos, error: photoError } = photoIds.length
    ? await supabaseAdmin.from('photos').select('id,clone_id,storage_path').in('clone_id', access.cloneIds).in('id', photoIds)
    : { data: [], error: null };
  if (photoError) throw new Error('Creator portraits could not be loaded.');
  const usedPaths = new Set<string>();
  const rows = await Promise.all(clones.map(async (c, index) => {
    const selected = agencyOverviewPhotos[c.id] || {};
    const pathFor = (id?: string) => photos?.find(p => p.id === id && p.clone_id === c.id)?.storage_path;
    const unique = (path: string | null | undefined) => {
      if (!path || usedPaths.has(path)) return undefined;
      usedPaths.add(path); return path;
    };
    const portraitPath = unique(pathFor(selected.portrait) || profileImagePathForClone(c.intake));
    const cardPath = unique(pathFor(selected.card));
    const heroPath = unique(pathFor(selected.hero));
    const audience = await getOverviewAudience(c.id);
    return { id: c.id, name: c.name, color: chartColorForClone(c.intake, index), totalFans: audience.total,
      portraitPath, cardPath, heroPath, portraitId: selected.portrait || `profile-${c.id}`, cardId: selected.card, portraitZoom: selected.portraitZoom,
      heroId: selected.hero, heroCrop: selected.heroCrop };
  }));
  const paths = rows.flatMap(r => [r.portraitPath, r.cardPath, r.heroPath]).filter((p): p is string => !!p);
  const { data: signed, error: signingError } = paths.length
    ? await signDashboardMedia(paths)
    : { data: [], error: null };
  if (signingError) throw new Error('Creator portraits could not be refreshed.');
  const image = (path?: string, id?: string, zoom = 1, crop?: AgencyOverviewCrop) => {
    const url = path ? signed?.[paths.indexOf(path)]?.signedUrl : undefined;
    return url && id ? { id, url, position: '50% 0%', zoom, crop } : null;
  };
  const creators = rows.map(r => ({ id: r.id, name: r.name, color: r.color, totalFans: r.totalFans,
    portrait: image(r.portraitPath, r.portraitId, r.portraitZoom), cardPhoto: image(r.cardPath, r.cardId),
    heroPhoto: image(r.heroPath, r.heroId, 1, r.heroCrop) }));
  return { creators, audience: { total: creators.reduce((sum, c) => sum + c.totalFans, 0) } };
}
