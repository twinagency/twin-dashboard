import { getDashboardAccess, withDashboardAccess } from './dashboard-access';
import { isMoxy } from './agency-brand';
import { supabaseAdmin } from './supabase';

export type OverviewImage = { id: string; url: string; position: string; zoom: number };
export type OverviewCreator = { id: string; name: string; photoUrl: string | null; photoId: string | null; position: string; zoom: number; fans: number; telegramConnected: boolean; banner?: OverviewImage | null; library?: OverviewImage[]; automation?: { enabled: boolean; steps: number } };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const position = (value: unknown) => typeof value === 'string' && /^\d+% \d+%$/.test(value) ? value : '50% 40%';
const zoom = (value: unknown) => typeof value === 'number' ? Math.min(2, Math.max(1, value)) : 1;
export async function getAgencyOverview(): Promise<OverviewCreator[]> {
  const access = await getDashboardAccess();
  if (!access || !isMoxy(access.name)) throw new Error('Moxy agency access required');
  return withDashboardAccess(access, async () => {
    if (!access.cloneIds.length) return [];
    const rows = await supabaseAdmin.from('clones').select('id,name,intake,business_username,drip_enabled,drip_steps').in('id', access.cloneIds).order('name');
    if (rows.error) throw new Error('Creator details are temporarily unavailable');
    return Promise.all((rows.data ?? []).map(async c => {
      const config = c.intake?.appearance?.agency_overview;
      const photoId = validId(config?.photo_id) ? config.photo_id : null;
      const bannerId = validId(config?.banner?.photo_id) && config.banner.photo_id !== photoId ? config.banner.photo_id : null;
      const libraryIds: string[] = Array.isArray(config?.library) ? [...new Set<string>(config.library.map((item: {photo_id?: unknown}) => item?.photo_id).filter(validId))].filter(id => id !== photoId && id !== bannerId).slice(0, 3) : [];
      const ids = [photoId, bannerId, ...libraryIds].filter(validId);
      const [audience, photos] = await Promise.all([
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('clone_id', c.id).or('is_test.is.null,is_test.eq.false'),
        ids.length ? supabaseAdmin.from('photos').select('id,storage_path').eq('clone_id', c.id).in('id', ids) : Promise.resolve({ data: [], error: null }),
      ]);
      if (audience.error || photos.error) throw new Error('Creator overview is temporarily unavailable');
      const owned = (photos.data ?? []).filter(p => p.storage_path?.startsWith(c.id + '/'));
      const urls = new Map<string, string>();
      if (owned.length) {
        const signed = await supabaseAdmin.storage.from('media').createSignedUrls(owned.map(p => p.storage_path!), 3600);
        if (!signed.error) for (const item of signed.data ?? []) {
          const photo = owned.find(p => p.storage_path === item.path);
          if (photo && item.signedUrl) urls.set(photo.id, item.signedUrl);
        }
      }
      const image = (id: string | null, settings: {position?: unknown; zoom?: unknown} | undefined): OverviewImage | null => id && urls.has(id) ? { id, url: urls.get(id)!, position: position(settings?.position), zoom: zoom(settings?.zoom) } : null;
      return { id: c.id, name: c.name, photoUrl: photoId ? urls.get(photoId) ?? null : null, photoId,
        position: position(config?.position), zoom: zoom(config?.zoom),
        fans: audience.count ?? 0, telegramConnected: !!c.business_username,
        banner: image(bannerId, config?.banner),
        library: libraryIds.map(id => image(id, config.library.find((item: {photo_id: string}) => item.photo_id === id))).filter((item): item is OverviewImage => !!item),
        automation: { enabled: c.drip_enabled === true, steps: Array.isArray(c.drip_steps) ? c.drip_steps.filter((s: {type?: string; after_hours?: number}) => ['text','voice','photo','video','bundle'].includes(s?.type ?? '') && Number.isFinite(s.after_hours) && s.after_hours! >= 1 && s.after_hours! <= 23).length : 0 },
      };
    }));
  });
}
