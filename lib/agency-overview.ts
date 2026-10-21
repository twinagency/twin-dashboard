import { signDashboardMedia } from "./media-signing-cache";
import { getDashboardAccess, withDashboardAccess } from './dashboard-access';
import { usesAgencyOverview, isTopOnlyfansAgency } from './agency-brand';
import { supabaseAdmin } from './supabase';
import { serviceClient } from './supabase-service';

export type OverviewImage = { id: string; url: string; position: string; zoom: number };
export type OverviewCreator = { id: string; name: string; onboarding?: boolean; photoUrl: string | null; photoId: string | null; position: string; zoom: number; fans: number; telegramConnected: boolean; banner?: OverviewImage | null; library?: OverviewImage[]; automation?: { enabled: boolean; steps: number } };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const position = (value: unknown) => typeof value === 'string' && /^\d+% \d+%$/.test(value) ? value : '50% 40%';
const zoom = (value: unknown) => typeof value === 'number' ? Math.min(2, Math.max(1, value)) : 1;
export async function getAgencyOverview(): Promise<OverviewCreator[]> {
  const access = await getDashboardAccess();
  if (!access || !usesAgencyOverview(access.name)) throw new Error('Agency overview access required');
  const live = await withDashboardAccess(access, async () => {
    if (!access.cloneIds.length) return [];
    const rows = await supabaseAdmin.from('clones').select('id,name,intake,business_username,drip_enabled,drip_steps').in('id', access.cloneIds).order('name');
    if (rows.error) throw new Error('Creator details are temporarily unavailable');
    const creators = rows.data ?? [];
    const requestedPhotos = new Set<string>();
    for (const c of creators) {
      const config = c.intake?.appearance?.agency_overview;
      const library = Array.isArray(config?.library) ? [...new Set<string>(config.library.map((item: {photo_id?: unknown}) => item?.photo_id).filter(validId))].filter(id => id !== config?.photo_id && id !== config?.banner?.photo_id).slice(0, 3) : [];
      [config?.photo_id, config?.banner?.photo_id, ...library].filter(validId).forEach(id => requestedPhotos.add(id));
    }
    const ids = [...requestedPhotos];
    const batches = await Promise.all(Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) =>
      supabaseAdmin.from('photos').select('id,clone_id,storage_path').in('clone_id', access.cloneIds).in('id', ids.slice(i * 200, (i + 1) * 200))));
    if (batches.some(batch => batch.error)) throw new Error('Creator overview is temporarily unavailable');
    const owned = batches.flatMap(batch => batch.data ?? []).filter(p => p.storage_path?.startsWith(p.clone_id + '/'));
    const signing = owned.length ? signDashboardMedia(owned.map(p => p.storage_path!)) : Promise.resolve({ data: [], error: null });
    const [signed, audiences] = await Promise.all([signing, Promise.all(creators.map(c =>
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('clone_id', c.id).or('is_test.is.null,is_test.eq.false')))]);
    if (audiences.some(audience => audience.error)) throw new Error('Creator overview is temporarily unavailable');
    const signedPaths = new Map((signed.data ?? []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl]));
    return creators.map((c, index) => {
      const config = c.intake?.appearance?.agency_overview;
      const photoId = validId(config?.photo_id) ? config.photo_id : null;
      const bannerId = validId(config?.banner?.photo_id) && config.banner.photo_id !== photoId ? config.banner.photo_id : null;
      const libraryIds: string[] = Array.isArray(config?.library) ? [...new Set<string>(config.library.map((item: {photo_id?: unknown}) => item?.photo_id).filter(validId))].filter(id => id !== photoId && id !== bannerId).slice(0, 3) : [];
      const ids = [photoId, bannerId, ...libraryIds].filter(validId);
      const audience = audiences[index];
      const urls = new Map<string, string>();
      for (const photo of owned) {
        const url = signedPaths.get(photo.storage_path);
        if (photo.clone_id === c.id && ids.includes(photo.id) && url) urls.set(photo.id, url);
      }
      const image = (id: string | null, settings: {position?: unknown; zoom?: unknown} | undefined): OverviewImage | null => id && urls.has(id) ? { id, url: urls.get(id)!, position: position(settings?.position), zoom: zoom(settings?.zoom) } : null;
      return { id: c.id, name: c.name, photoUrl: photoId ? urls.get(photoId) ?? null : null, photoId,
        position: position(config?.position), zoom: zoom(config?.zoom),
        fans: audience.count ?? 0, telegramConnected: !!c.business_username,
        banner: image(bannerId, config?.banner),
        library: libraryIds.map(id => image(id, config.library.find((item: {photo_id: string}) => item.photo_id === id))).filter((item): item is OverviewImage => !!item),
        automation: { enabled: c.drip_enabled === true, steps: Array.isArray(c.drip_steps) ? c.drip_steps.filter((s: {type?: string; after_hours?: number}) => ['text','voice','photo','video','bundle'].includes(s?.type ?? '') && Number.isFinite(Number(s.after_hours)) && Number(s.after_hours) >= 1 && Number(s.after_hours) <= 23).length : 0 },
      };
    });
  });
  return [...live, ...await getAgencyOnboardingCreators()];
}

/** Assigned onboarding accounts remain visible before they have a live Twin. */
export async function getAgencyOnboardingCreators(): Promise<OverviewCreator[]> {
  const access = await getDashboardAccess();
  // Moxy keeps its current live roster and imagery exactly as configured.
  if (!access || access.creatorScope === "selected" || !isTopOnlyfansAgency(access.name)) return [];
  const db = serviceClient();
  const assigned = await db.from('creator_agency_assignments')
    .select('creator_account_id').eq('agency_id', access.id);
  if (assigned.error) throw new Error('Creator assignments are temporarily unavailable');
  const ids = (assigned.data ?? []).map(row => row.creator_account_id as string);
  if (!ids.length) return [];
  const [accounts, links] = await Promise.all([
    db.from('creator_accounts').select('id,display_name,email,account_status').in('id', ids),
    db.from('creator_clone_links').select('creator_account_id,clone_id').in('creator_account_id', ids),
  ]);
  if (accounts.error || links.error) throw new Error('Creator accounts are temporarily unavailable');
  const linked = new Set((links.data ?? []).filter(row => row.clone_id && access.cloneIds.includes(row.clone_id)).map(row => row.creator_account_id));
  const pending = (accounts.data ?? []).filter(row => !linked.has(row.id) && !['archived','rejected'].includes(row.account_status));
  if (!pending.length) return [];
  const files = await db.from('creator_files')
    .select('id,creator_account_id,storage_path')
    .in('creator_account_id', pending.map(row => row.id))
    .eq('bucket', 'onboarding-content').eq('kind', 'content')
    .eq('storage_transfer_status', 'verified').in('mime_type', ['image/jpeg','image/png','image/webp'])
    .order('created_at', { ascending: false });
  if (files.error) throw new Error('Creator photos are temporarily unavailable');
  const selected = new Map<string, { id: string; path: string }>();
  for (const file of files.data ?? []) {
    if (selected.has(file.creator_account_id) ||
        !file.storage_path.startsWith(`creators/${file.creator_account_id}/content/`) ||
        file.storage_path.split('/').some((part: string) => part === '.' || part === '..')) continue;
    selected.set(file.creator_account_id, { id: file.id, path: file.storage_path });
  }
  const entries = [...selected.entries()];
  const photos = new Map<string, { id: string; url: string }>();
  if (entries.length) {
    const signed = await db.storage.from('onboarding-content').createSignedUrls(entries.map(([, photo]) => photo.path), 3600);
    entries.forEach(([accountId, photo], i) => {
      const url = signed.data?.[i]?.signedUrl;
      if (url) photos.set(accountId, { id: photo.id, url });
    });
  }
  return pending.map(row => ({
    id: row.id, name: row.display_name || row.email || 'Creator', onboarding: true,
    photoUrl: photos.get(row.id)?.url ?? null, photoId: photos.get(row.id)?.id ?? null,
    position: '50% 20%', zoom: 1, fans: 0, telegramConnected: false,
  }));
}

