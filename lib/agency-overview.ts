import { getDashboardAccess, withDashboardAccess } from './dashboard-access';
import { isMoxy } from './agency-brand';
import { supabaseAdmin } from './supabase';

export type OverviewCreator = { id: string; name: string; photoUrl: string | null; photoId: string | null; position: string; zoom: number; fans: number; telegramConnected: boolean };
export async function getAgencyOverview(): Promise<OverviewCreator[]> {
  const access = await getDashboardAccess();
  if (!access || !isMoxy(access.name)) throw new Error('Moxy agency access required');
  return withDashboardAccess(access, async () => {
    if (!access.cloneIds.length) return [];
    const rows = await supabaseAdmin.from('clones').select('id,name,intake,business_username').in('id', access.cloneIds).order('name');
    if (rows.error) throw new Error('Creator details are temporarily unavailable');
    return Promise.all((rows.data ?? []).map(async c => {
      const config = c.intake?.appearance?.agency_overview;
      const photoId = typeof config?.photo_id === 'string' && /^[0-9a-f-]{36}$/i.test(config.photo_id) ? config.photo_id : null;
      const [audience, photo] = await Promise.all([
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('clone_id', c.id).or('is_test.is.null,is_test.eq.false'),
        photoId ? supabaseAdmin.from('photos').select('id,storage_path').eq('clone_id', c.id).eq('id', photoId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (audience.error || photo.error) throw new Error('Creator overview is temporarily unavailable');
      let photoUrl: string | null = null;
      if (photo.data?.storage_path?.startsWith(c.id + '/')) {
        const signed = await supabaseAdmin.storage.from('media').createSignedUrl(photo.data.storage_path, 3600);
        if (!signed.error) photoUrl = signed.data?.signedUrl ?? null;
      }
      return { id: c.id, name: c.name, photoUrl, photoId,
        position: typeof config?.position === 'string' && /^\d+% \d+%$/.test(config.position) ? config.position : '50% 40%',
        zoom: typeof config?.zoom === 'number' ? Math.min(2, Math.max(1, config.zoom)) : 1,
        fans: audience.count ?? 0, telegramConnected: !!c.business_username };
    }));
  });
}
