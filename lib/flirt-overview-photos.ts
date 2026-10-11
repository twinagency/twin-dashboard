import type { OverviewPhotoConfig } from './creator-overview-model';
export type ReviewedPhoto = OverviewPhotoConfig & { crop: { left: number; top: number; width: number; height: number } };
export type ReviewedOverview = { hero: ReviewedPhoto; avatar?: ReviewedPhoto; library: ReviewedPhoto[] };
const photo = (id: string, label: string, left: number, top: number, width: number, height: number): ReviewedPhoto => ({ id, label, position: '50% 10%', crop: { left, top, width, height } });
// Hand-reviewed crops in the original, auto-oriented image's pixel coordinates.
// Photo IDs are always resolved with clone_id; no private originals are published.
export const flirtOverviewPhotos: Record<string, ReviewedOverview> = {
  '2e5eb05f-cc88-4ba6-870a-924948d4b09a': {
    hero: { ...photo('260a835f-583e-4b2e-9dc1-64bb9f522749', 'Getting ready', 60, 130, 780, 650), position: '15% 15%' },
    avatar: photo('fccbdad9-203e-47bb-b646-20e93a506ea7', 'Portrait', 300, 180, 520, 520),
    library: [photo('b7822b10-7907-410d-bc66-0286298ce5bd', 'Out on the deck', 150, 360, 650, 850), photo('20adb126-3da0-468c-b16d-30057b337941', 'At home', 100, 180, 700, 900), photo('3523d234-c40e-4ecf-92bc-8955e910d57c', 'Behind the scenes', 100, 340, 550, 700)],
  },
  '0328e7b3-a1e5-465a-9a30-c9cf6519cba1': {
    hero: photo('746b4bc1-7f59-4d3a-bb4e-c4f713a2c5b8', 'Outdoor moments', 160, 260, 880, 520),
    library: [photo('487f9d94-4205-439e-b7f5-74e008fdee91', 'In the moment', 780, 1155, 942, 782), photo('f2fdc608-ba8f-4cc8-8893-0350d036b1f4', 'Soft light', 340, 390, 340, 430), photo('a786709e-7742-4ace-a4f4-c2b8da2b73d1', 'Behind the scenes', 178, 42, 787, 903)],
  },
  'bfaf6235-6c3b-4369-8d5c-c7068b08bea2': {
    hero: photo('86e4b9af-650d-4a48-919b-cc086597205d', 'Portrait', 100, 0, 1300, 980),
    avatar: photo('961065a1-49dd-4805-93a3-76239e915a93', 'Profile portrait', 360, 100, 720, 720),
    library: [photo('f55a58c4-0cd0-4d7c-9b18-29be42dd7a9d', 'Blue mood', 380, 0, 740, 800), photo('365c9bee-f5ba-4bc3-8dc6-2193a42f7c8a', 'In the moment', 380, 20, 840, 820), photo('b8258ae3-6d91-4ecf-8a4a-a53c7803a72b', 'Soft light', 380, 60, 750, 840)],
  },
  'dd1869c2-d1e2-490f-9fae-45200232cc30': {
    hero: photo('df4c2960-e3d1-423d-8c3d-631d793b83a8', 'Evening portrait', 400, 200, 2300, 1900),
    avatar: photo('8ce8e3d4-8cb4-41b7-84a3-2eb66ce49f4f', 'Outdoor portrait', 1000, 1100, 1700, 1700),
    library: [photo('37ee27aa-d91f-4bcf-ac91-38d42f320fe3', 'Heart print', 500, 550, 2000, 2500), photo('794c98c0-277e-497a-91c4-815a31f440ff', 'After dark', 300, 300, 2400, 3000), photo('665ad8af-b9a5-478f-94df-d1a947de04c5', 'Outdoors', 150, 750, 900, 1400)],
  },
  '4fff7866-c7e9-4af2-926a-36e727c0a77f': {
    hero: { ...photo('6db3ccfe-77c3-42c5-a6b7-ba6adbb4cb01', 'In the moment', 100, 50, 2800, 2600), position: '50% 50%' },
    avatar: photo('ff76f955-19c7-4d3d-84ea-e36b0dfe11dd', 'Profile portrait', 700, 700, 1500, 1500),
    library: [photo('bb3a0911-2681-471c-b92e-c0869609003d', 'Over the shoulder', 1000, 650, 1700, 1900), photo('b342ff24-7945-481c-8fde-4263566086ff', 'Behind the scenes', 450, 300, 2100, 2700), photo('5f1d3ce9-6ebf-4d8d-908f-632f61be4a1d', 'Evening light', 500, 650, 2200, 2800)],
  },
};
export function reviewedOverviewSlot(id: string, slot: string): ReviewedPhoto | undefined {
  const config = flirtOverviewPhotos[id];
  if (!config) return undefined;
  if (slot === 'hero' || slot === 'avatar') return config[slot];
  const match = /^library-([0-2])$/.exec(slot);
  return match ? config.library[Number(match[1])] : undefined;
}
