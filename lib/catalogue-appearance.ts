const appearances: Record<string, { profilePhoto?: string }> = {
  'briana-redd': { profilePhoto: '/brand/catalogue/briana-redd-profile.webp' },
  'alanna-pow': { profilePhoto: '/brand/catalogue/alanna-pow-profile.jpg' },
};
export function catalogueAppearance(slug: string): { profilePhoto?: string } | null {
  return appearances[slug] ?? null;
}
