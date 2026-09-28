import type { CatalogueItem } from './catalogue-core';

// Trending = what fans actually bought in the last 30 days. Only a 1-based rank ever
// reaches the client; the raw sales count stays on the server.
export const TRENDING_SIZE = 20;
export const TRENDING_WINDOW_DAYS = 30;
// Owner/test fan accounts never count as sales (6814483810 = rcy07).
export const TRENDING_EXCLUDED_TELEGRAM_IDS = new Set(['6814483810', '6322723817']);

export type TrendingSale = { id: string; media_type: string | null; media_id: string | null; telegram_id?: number | string | null };
type Bundle = { id: string; photo_ids?: string[] | null };

// Tag vocabulary as stored on photos/videos.tags (checked live 2026-09-28): solo,
// lingerie, mirror_selfie, bed, ass, tits, topless, outdoor, feet, bikini, pussy,
// full_nude, pool, shower, anal. Earlier rows win when an item matches more than two.
const TAG_EMOJIS: [string, string[]][] = [
  ['🔥', ['full_nude', 'pussy', 'topless', 'tits', 'nude', 'boobs']],
  ['🍑', ['ass', 'anal', 'booty']],
  ['👙', ['lingerie', 'bikini']],
  ['💦', ['shower', 'pool', 'wet', 'bath']],
  ['👣', ['feet']],
  ['🛏️', ['bed', 'sheets']],
  ['🤳', ['mirror_selfie']],
  ['☀️', ['outdoor']],
];

export function tagEmojis(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const set = new Set(tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().toLowerCase()));
  return TAG_EMOJIS.filter(([, names]) => names.some(name => set.has(name))).map(([emoji]) => emoji).slice(0, 2);
}

// Returns rank by `${type}:${id}` for at most `size` items: sold items first by paid
// count, then zero-sale items by highest star price, then newest, so the section is full.
export function trendingRanks(items: CatalogueItem[], sales: TrendingSale[], refundIds: Iterable<string>, bundles: Bundle[] = [], size = TRENDING_SIZE): Map<string, number> {
  const refunded = new Set(refundIds);
  const bundleById = new Map(bundles.map(bundle => [bundle.id, bundle]));
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const sale of sales) {
    if (!sale.media_id || refunded.has(`refund:${sale.id}`)) continue;
    if (sale.telegram_id != null && TRENDING_EXCLUDED_TELEGRAM_IDS.has(String(sale.telegram_id))) continue;
    if (sale.media_type === 'photo' || sale.media_type === 'video') bump(`${sale.media_type}:${sale.media_id}`);
    else if (sale.media_type === 'bundle') for (const id of bundleById.get(sale.media_id)?.photo_ids ?? []) bump(`photo:${id}`);
  }
  const key = (item: CatalogueItem) => `${item.type}:${item.id}`;
  const byPriceThenNewest = (a: CatalogueItem, b: CatalogueItem) =>
    (b.free ? 0 : b.stars) - (a.free ? 0 : a.stars) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const ordered = [...items].sort((a, b) => (counts.get(key(b)) ?? 0) - (counts.get(key(a)) ?? 0) || byPriceThenNewest(a, b));
  return new Map(ordered.slice(0, size).map((item, index) => [key(item), index + 1]));
}
