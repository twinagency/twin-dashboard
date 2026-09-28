const appearances: Record<string, { profilePhoto?: string }> = {
  'briana-redd': { profilePhoto: '/brand/catalogue/briana-redd-profile.webp' },
  'alanna-pow': { profilePhoto: '/brand/catalogue/alanna-pow-profile.jpg' },
  'dan-dangler': { profilePhoto: '/brand/catalogue/dan-dangler-profile.webp' },
  'mrs-callace': { profilePhoto: '/brand/catalogue/mrs-callace-profile.webp' },
  'fit-sid': { profilePhoto: '/brand/catalogue/fit-sid-profile.webp' },
};
export function catalogueAppearance(slug: string): { profilePhoto?: string } | null {
  return appearances[slug] ?? null;
}
