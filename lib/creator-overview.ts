import { supabaseAdmin } from './supabase';
import { requireCloneAccess } from './dashboard-access';
import { overviewConfig, uniqueOverviewPaths, type CreatorOverviewPresentation, type OverviewPhotoConfig } from './creator-overview-model';

// Presentation is configured on a creator row. No creator-specific route or demo ledger.
export async function getCreatorOverview(id: string): Promise<CreatorOverviewPresentation | null> {
  await requireCloneAccess(id);
  const { data: clone, error } = await supabaseAdmin.from('clones').select('id,name,intake').eq('id', id).maybeSingle();
  if (error) throw error;
  const config = overviewConfig(clone?.intake);
  if (!clone || !config) return null;
  const slots = [config.hero, config.avatar, ...config.library, config.campaign];
  const { data: photos, error: photoError } = await supabaseAdmin.from('photos').select('id,storage_path,star_value').eq('clone_id', id).in('id', slots.map(p => p.id));
  if (photoError) throw photoError;
  if (!photos || !uniqueOverviewPaths(photos, slots.map(p => p.id))) throw new Error('Overview photos need six different images belonging to this creator.');
  const { data: signed, error: signingError } = await supabaseAdmin.storage.from('media').createSignedUrls(photos.map(p => p.storage_path), 3600);
  if (signingError || !signed?.every(p => p.signedUrl)) throw new Error('Overview photos could not be loaded.');
  const photo = (slot: OverviewPhotoConfig) => {
    const index = photos.findIndex(p => p.id === slot.id);
    return { id: slot.id, url: signed[index].signedUrl!, position: typeof slot.position === 'string' ? slot.position : '50% 30%', label: typeof slot.label === 'string' ? slot.label : 'From the vault', stars: Number(photos[index].star_value) || 0 };
  };
  return { id: clone.id, name: clone.name, hero: photo(config.hero), avatar: photo(config.avatar), library: config.library.map(photo), campaign: photo(config.campaign) };
}

export async function getOverviewAudience(id: string): Promise<{ total: number }> {
  await requireCloneAccess(id);
  // Every recorded real fan, including imports and inactive fans. Never date-filtered.
  const { count, error } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('clone_id', id).or('is_test.is.null,is_test.eq.false');
  if (error || count === null) throw new Error('The all-time fan total could not be loaded.');
  return { total: count };
}
