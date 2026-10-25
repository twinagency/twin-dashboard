// The preview's creator identities.
//
// Channel navigation used to live here too. It moved to `lib/channel-nav.ts`,
// which the dashboard's own Sidebar, TopBar and breadcrumb read, so there is
// exactly one definition of the channel split and the preview renders the real
// shell rather than a copy of it. What remains here is fixture data only.

import { ACCOUNT_AVA, ACCOUNT_AVA_SECOND, ACCOUNT_LUNA, ACCOUNT_NOVA, ACCOUNT_RELL } from "./fixtures";
import type { PreviewCreator } from "./types";

/**
 * Shared creator identities. One selection scopes every channel; the OnlyFans
 * account list is derived per creator, and Ava has two accounts so the
 * one-creator-many-accounts case is visible in the preview rather than assumed.
 */
export const PREVIEW_CREATORS: PreviewCreator[] = [
  {
    creatorId: "creator-ava-0001",
    name: "Ava Hart",
    initials: "AH",
    color: "#2f6fed",
    telegram: { connected: true, note: "Business connection healthy" },
    onlyfansAccountIds: [ACCOUNT_AVA, ACCOUNT_AVA_SECOND],
  },
  {
    creatorId: "creator-nova-0002",
    name: "Nova Rey",
    initials: "NR",
    color: "#9b2f62",
    telegram: { connected: true, note: "Business connection healthy" },
    onlyfansAccountIds: [ACCOUNT_NOVA],
  },
  {
    creatorId: "creator-rell-0004",
    name: "Rell Quinn",
    initials: "RQ",
    color: "#0e7490",
    telegram: { connected: true, note: "Business connection healthy" },
    onlyfansAccountIds: [ACCOUNT_RELL],
  },
  {
    creatorId: "creator-luna-0003",
    name: "Luna Vale",
    initials: "LV",
    color: "#8a5f06",
    telegram: { connected: false, note: "No Business connection on this creator" },
    onlyfansAccountIds: [ACCOUNT_LUNA],
  },
];

export function creatorFor(creatorId: string): PreviewCreator | null {
  return PREVIEW_CREATORS.find((creator) => creator.creatorId === creatorId) ?? null;
}

/**
 * The fixture account ids one creator owns, or every fixture account when no
 * creator is requested.
 *
 * This is the preview's stand-in for the server-owned creator/account binding.
 * It is used for the preview's simulated read-only viewer, which has to be
 * narrower than the operator. The live path never consults it: the backend
 * returns the binding, and `lib/onlyfans/reads.ts` refuses an answer that
 * crosses it.
 */
export function fixtureAccountIdsForCreator(creatorId: string | null): string[] {
  if (!creatorId) return PREVIEW_CREATORS.flatMap((creator) => creator.onlyfansAccountIds);
  return creatorFor(creatorId)?.onlyfansAccountIds ?? [];
}

/**
 * The fixture creators as the dashboard's own clone shape, which is what the
 * real Sidebar, TopBar and CloneSwitcher expect. No id is invented here: the
 * creator ids are the same strings the OnlyFans fixtures scope accounts by.
 */
export const PREVIEW_CLONES = PREVIEW_CREATORS.map((creator) => ({
  id: creator.creatorId,
  name: creator.name,
  color: creator.color,
}));
