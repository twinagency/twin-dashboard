import { selectAllRows } from './select-all';
import { supabaseAdmin } from './supabase';
import { signDashboardMedia } from './media-signing-cache';
import { rankOverviewRows, type RankingRow } from './overview-rankings-model';

type Asset = { id: string; clone_id: string; storage_path?: string; image_name?: string; caption?: string; name?: string; photo_bundle_items?: { storage_path: string; sort_order: number }[] };

export async function getOverviewRankings(rows: readonly RankingRow[], clones: { id: string; name: string }[]) {
  const cloneIds = clones.map(c => c.id);
  const tests = await selectAllRows<{ clone_id: string; telegram_id: number }>(supabaseAdmin.from('users').select('clone_id,telegram_id').in('clone_id', cloneIds).eq('is_test', true).order('id'), { label: 'Overview excluded test fans' });
  if (tests.truncated) throw Error('Could not verify fan eligibility');
  const excluded = new Set(tests.rows.map(u => `${u.clone_id}:${u.telegram_id}`));
  const result = rankOverviewRows(rows.filter(r => !excluded.has(`${r.clone_id}:${r.telegram_id}`)), clones);

  // Names and each media family are independent. Signing one item at a time
  // used to add a storage round trip for every creator's ranked content.
  const [users, families] = await Promise.all([
    result.fans.length
      ? selectAllRows<{ clone_id: string; telegram_id: number; name: string | null; stated_name: string | null }>(supabaseAdmin.from('users').select('clone_id,telegram_id,name,stated_name').in('clone_id', cloneIds).in('telegram_id', [...new Set(result.fans.map(f => f.telegramId))]).order('id'), { label: 'Overview top fan names' })
      : Promise.resolve({ rows: [], truncated: false }),
    Promise.all((['photo', 'video', 'bundle'] as const).map(async type => {
      const items = result.content.filter(c => c.type === type);
      if (!items.length) return { type, items, assets: [] as Asset[] };
      const table = type === 'photo' ? 'photos' : type === 'video' ? 'videos' : 'photo_bundles';
      const columns = type === 'photo' ? 'id,clone_id,storage_path,image_name' : type === 'video' ? 'id,clone_id,storage_path,caption' : 'id,clone_id,name,photo_bundle_items(storage_path,sort_order)';
      const assets = await supabaseAdmin.from(table).select(columns).in('clone_id', cloneIds).in('id', items.map(c => c.mediaId));
      if (assets.error) throw Error('Best-selling content could not be loaded');
      return { type, items, assets: (assets.data ?? []) as unknown as Asset[] };
    })),
  ]);
  if (users.truncated) throw Error('Top fan profiles could not be loaded');
  const profiles = new Map(users.rows.map(u => [`${u.clone_id}:${u.telegram_id}`, u]));
  result.fans = result.fans.map(f => ({ ...f, name: profiles.get(`${f.cloneId}:${f.telegramId}`)?.stated_name || profiles.get(`${f.cloneId}:${f.telegramId}`)?.name || f.name }));

  const pathsByItem = new Map<(typeof result.content)[number], string>();
  for (const { type, items, assets } of families) {
    for (const item of items) {
      const asset = assets.find(a => a.id === item.mediaId && a.clone_id === item.cloneId);
      if (!asset) continue;
      item.name = asset.image_name || asset.caption || asset.name || item.name;
      const path = type === 'bundle' ? [...(asset.photo_bundle_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path : asset.storage_path;
      if (path?.startsWith(item.cloneId + '/')) pathsByItem.set(item, path);
    }
  }
  const paths = [...new Set(pathsByItem.values())];
  if (paths.length) {
    const signed = await signDashboardMedia(paths);
    const urls = new Map((signed.data ?? []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]));
    for (const [item, path] of pathsByItem) item.url = urls.get(path) ?? null;
  }
  return result;
}
