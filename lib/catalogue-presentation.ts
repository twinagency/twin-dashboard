import type { CatalogueItem } from './catalogue-core';
import type { CatalogueBundle } from './catalogue-commerce';

export type CataloguePresentation = 'standard' | 'compact';
export function cataloguePresentation(value: unknown): CataloguePresentation {
  return value === 'compact' ? 'compact' : 'standard';
}
export const compactCategories = ['Bundles', 'Photos', 'Videos'] as const;
export function remainingBundles(bundles: CatalogueBundle[], featuredId: string | null | undefined) {
  return bundles.filter(bundle => bundle.id !== featuredId);
}
export function salePercent(bundle: CatalogueBundle): number | null {
  if (!Number.isFinite(bundle.stars) || !Number.isFinite(bundle.regularStars) ||
    bundle.stars <= 0 || bundle.regularStars <= bundle.stars) return null;
  return Math.floor((bundle.regularStars - bundle.stars) / bundle.regularStars * 100);
}
export function shortCatalogueTitle(description: string): string {
  return description.replace(/\s+/g, ' ').trim().slice(0, 80);
}
export function compactItems(items: CatalogueItem[], section: string, search: string) {
  const term = search.trim().toLowerCase();
  if (term) return items.filter(item => item.description.toLowerCase().includes(term));
  if (section === 'Photos') return items.filter(item => item.type === 'photo');
  if (section === 'Videos') return items.filter(item => item.type === 'video');
  if (section === 'My Purchases') return items.filter(item => item.purchased);
  return [];
}
