import type { CatalogueItem } from './catalogue-core';

// Creator-selected positions use stable item IDs, so later uploads cannot move them.
const creatorPositions: Record<string, { first: string[]; last: string[] }> = {
  'briana-redd': {
    first: ['video:bedb2ff6-bd23-4b21-b329-43ed3284cbd3', 'video:3a9c8e5a-f953-4fc2-bf93-ce2a6bce62a6'],
    last: ['video:20171234-7d0b-465f-8c6f-3496b509f415', 'video:1be04367-92bf-4f74-aa98-6fd3b86d07b5'],
  },
};

export function catalogueDisplayOrder(items: CatalogueItem[], slug: string, mixMedia: boolean): CatalogueItem[] {
  const positions = creatorPositions[slug];
  const key = (item: CatalogueItem) => `${item.type}:${item.id}`;
  const byKey = new Map(items.map(item => [key(item), item]));
  const first = (positions?.first ?? []).flatMap(id => byKey.has(id) ? [byKey.get(id)!] : []);
  const last = (positions?.last ?? []).flatMap(id => byKey.has(id) ? [byKey.get(id)!] : []);
  const fixed = new Set([...first, ...last].map(key));
  const remaining = items.filter(item => !fixed.has(key(item)));
  if (!mixMedia) return [...first, ...remaining, ...last];

  // Spread photos through the whole grid, even when videos outnumber them.
  // Within each media type the API's existing newest-first ordering is preserved.
  const photos = remaining.filter(item => item.type === 'photo');
  const videos = remaining.filter(item => item.type === 'video');
  const mixed: CatalogueItem[] = [];
  let photoIndex = 0, videoIndex = 0;
  // Show both formats in the first row for the opted-in compact catalogues,
  // then spread the remaining media across the grid.
  if (['alanna-pow', 'mrs-callace', 'fit-sid'].includes(slug) && photos.length && videos.length) {
    mixed.push(photos[photoIndex++], videos[videoIndex++]);
  }
  const initialPhotos = photoIndex;
  const remainingPhotos = photos.length - photoIndex;
  const remainingCount = remaining.length - mixed.length;
  for (let index = 0; index < remainingCount; index++) {
    const photoTarget = initialPhotos + Math.ceil((index + 1) * remainingPhotos / remainingCount);
    mixed.push(photoIndex < photoTarget ? photos[photoIndex++] : videos[videoIndex++]);
  }
  return [...first, ...mixed, ...last];
}
