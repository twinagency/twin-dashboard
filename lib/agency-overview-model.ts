export type AgencyOverviewImage = { id: string; url: string; position: string; zoom?: number };
export type AgencyOverviewCreator = {
  id: string;
  name: string;
  color: string;
  totalFans: number;
  portrait: AgencyOverviewImage | null;
  cardPhoto: AgencyOverviewImage | null;
};
export type AgencyOverviewPresentation = {
  creators: AgencyOverviewCreator[];
  audience: { total: number };
};

// Reviewed presentation choices, resolved against each creator's own private vault.
// Missing images use initials; unrelated or unreviewed content is never substituted.
export const agencyOverviewPhotos: Record<string, { portrait?: string; card?: string; portraitZoom?: number }> = {
  '0328e7b3-a1e5-465a-9a30-c9cf6519cba1': { card: '746b4bc1-7f59-4d3a-bb4e-c4f713a2c5b8' },
  '2e5eb05f-cc88-4ba6-870a-924948d4b09a': { portrait: '5a0f635e-7b6b-46ca-a7f3-cb9f87af30e4', card: '710d8abd-042a-4c28-8ed0-f06cadfac6b3' },
  'bfaf6235-6c3b-4369-8d5c-c7068b08bea2': { portrait: '961065a1-49dd-4805-93a3-76239e915a93', portraitZoom: 1.6, card: 'b8258ae3-6d91-4ecf-8a4a-a53c7803a72b' },
  'dd1869c2-d1e2-490f-9fae-45200232cc30': { portrait: '37ee27aa-d91f-4bcf-ac91-38d42f320fe3', card: 'df4c2960-e3d1-423d-8c3d-631d793b83a8' },
  '4fff7866-c7e9-4af2-926a-36e727c0a77f': { portrait: 'ff76f955-19c7-4d3d-84ea-e36b0dfe11dd', card: 'b342ff24-7945-481c-8fde-4263566086ff' },
};
