/** Creators approved for Bri's compact catalogue layout. Keep media ordering in catalogue-display-order scoped separately. */
const appearances: Record<string, { profilePhoto?: string }> = {
  'briana-redd': { profilePhoto: '/brand/catalogue/briana-redd-profile.webp' },
  // Alanna's Telegram profile photo must be approved before replacing the initials fallback.
  'alanna-pow': {},
};

export function catalogueAppearance(slug: string): { profilePhoto?: string } | null {
  return appearances[slug] ?? null;
}
