import type { ConnectionHealth } from "../onlyfans-preview/types";
export type TelegramCreator = { id: string; name: string; status: string; handle: string | null; photoUrl?: string; color: string };
export type WorkspaceAccount = { id: string; creatorId: string; creatorName: string; handle: string; health: ConnectionHealth };
export type RosterSource<T> = { status: "ready" | "unavailable" | "not_requested"; items: T[]; error: string | null };
export type ChannelRoster = { schemaVersion: "channel-roster.v1"; telegram: RosterSource<TelegramCreator>; onlyfans: RosterSource<WorkspaceAccount> };
export type WorkspaceCreator = { id: string; name: string; photoUrl?: string; color: string; telegram: TelegramCreator | null; onlyfans: WorkspaceAccount[] };
/** Join only on the canonical Twin identity. Names and handles are never identity keys. */
export function mergeChannelCreators(roster: ChannelRoster): WorkspaceCreator[] {
  const creators = new Map<string, WorkspaceCreator>();
  for (const creator of roster.telegram.items) creators.set(creator.id, { id: creator.id, name: creator.name, photoUrl: creator.photoUrl, color: creator.color, telegram: creator, onlyfans: [] });
  for (const account of roster.onlyfans.items) {
    let creator = creators.get(account.creatorId);
    if (!creator) { creator = { id: account.creatorId, name: account.creatorName, color: "#4fa7d9", telegram: null, onlyfans: [] }; creators.set(creator.id, creator); }
    if (!creator.onlyfans.some(item => item.id === account.id)) creator.onlyfans.push(account);
  }
  return [...creators.values()].sort((a, b) => a.name.localeCompare(b.name));
}
