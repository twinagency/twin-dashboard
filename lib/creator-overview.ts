import { supabaseAdmin } from './supabase';
import { requireCloneAccess } from './dashboard-access';
import { profileImagePathForClone } from './colors';
import { flirtOverviewPhotos } from './flirt-overview-photos';
import type { CreatorOverviewPresentation, OverviewPhoto } from './creator-overview-model';

export async function getCreatorOverview(id: string): Promise<CreatorOverviewPresentation | null> {
  await requireCloneAccess(id);
  const { data: clone, error } = await supabaseAdmin.from('clones').select('id,name,intake').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!clone) return null;
  const config = flirtOverviewPhotos[id];
  const slots = config ? [config.hero, config.avatar, ...config.library].filter((p): p is NonNullable<typeof p> => !!p) : [];
  const { data: photos, error: photoError } = slots.length
    ? await supabaseAdmin.from('photos').select('id,storage_path,star_value').eq('clone_id', id).in('id', slots.map(p => p.id))
    : { data: [], error: null };
  if (photoError) throw photoError;
  const usedPaths = new Set<string>();
  const photo = (slot: typeof slots[number] | undefined, key: string): OverviewPhoto | null => {
    const row = slot && photos?.find((p: { id: string; storage_path: string; star_value: number | null }) => p.id === slot.id);
    if (!slot || !row?.storage_path || usedPaths.has(row.storage_path)) return null;
    usedPaths.add(row.storage_path);
    return { id: slot.id, url: `/api/creator-overview/photo?clone=${id}&slot=${key}&v=2`, position: slot.position || '50% 40%', label: slot.label || 'From the vault', stars: Number(row.star_value) || 0 };
  };
  const hero = photo(config?.hero, 'hero');
  let avatar = photo(config?.avatar, 'avatar');
  const library = (config?.library || []).map((slot, i) => photo(slot, `library-${i}`)).filter((p): p is OverviewPhoto => !!p);
  const profilePath = profileImagePathForClone(clone.intake);
  if (!avatar && profilePath && profilePath.startsWith(`${id}/`) && !usedPaths.has(profilePath) && !profilePath.split('/').includes('..')) {
    const { data: signed } = await supabaseAdmin.storage.from('media').createSignedUrl(profilePath, 3600);
    if (signed?.signedUrl) avatar = { id: `profile-${id}`, url: signed.signedUrl, position: '50% 30%', label: 'Profile portrait', stars: 0 };
  }
  // Every assigned creator gets the same Overview, even before photos are uploaded.
  return { id: clone.id, name: clone.name, hero, avatar, library };
}

export async function getOverviewAudience(id: string): Promise<{ total: number }> {
  await requireCloneAccess(id);
  // Every recorded real fan, including imports and inactive fans. Never date-filtered.
  const { count, error } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('clone_id', id).or('is_test.is.null,is_test.eq.false');
  if (error || count === null) throw new Error('The all-time fan total could not be loaded.');
  return { total: count };
}

