import { supabaseAdmin } from './supabase';
import { getDashboardAccess } from './dashboard-access';
import { chartColorForClone, profileImagePathForClone } from './colors';
import { getOverviewAudience } from './creator-overview';
import { agencyOverviewPhotos, type AgencyOverviewPresentation } from './agency-overview-model';

export async function getAgencyOverview(): Promise<AgencyOverviewPresentation> {
  const access = await getDashboardAccess();
  if (!access || access.name.trim().toLowerCase() !== 'flirt' || access.id.startsWith('creator:')) {
    throw new Error('Agency overview access denied');
  }
  if (!access.cloneIds.length) return { creators: [], audience: { total: 0 } };
  const { data: clones, error } = await supabaseAdmin.from('clones')
    .select('id,name,intake').in('id', access.cloneIds).order('created_at', { ascending: true });
  if (error || !clones) throw new Error('The agency creators could not be loaded.');
  const photoIds = clones.flatMap(c => Object.values(agencyOverviewPhotos[c.id] || {}));
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
    const audience = await getOverviewAudience(c.id);
    return { id: c.id, name: c.name, color: chartColorForClone(c.intake, index), totalFans: audience.total,
      portraitPath, cardPath, portraitId: selected.portrait || `profile-${c.id}`, cardId: selected.card };
  }));
  const paths = rows.flatMap(r => [r.portraitPath, r.cardPath]).filter((p): p is string => !!p);
  const { data: signed, error: signingError } = paths.length
    ? await supabaseAdmin.storage.from('media').createSignedUrls(paths, 3600)
    : { data: [], error: null };
  if (signingError) throw new Error('Creator portraits could not be refreshed.');
  const image = (path?: string, id?: string) => {
    const url = path ? signed?.[paths.indexOf(path)]?.signedUrl : undefined;
    return url && id ? { id, url, position: '50% 20%' } : null;
  };
  const creators = rows.map(r => ({ id: r.id, name: r.name, color: r.color, totalFans: r.totalFans,
    portrait: image(r.portraitPath, r.portraitId), cardPhoto: image(r.cardPath, r.cardId) }));
  return { creators, audience: { total: creators.reduce((sum, c) => sum + c.totalFans, 0) } };
}
