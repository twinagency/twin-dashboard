import type { Connection } from "../onlyfans-connections/contract";
import type { ConnectionEnrollment } from "../onlyfans-connections/contract";
export const PLATFORM_SCHEMA = "creator-platforms.v1";
export type PlatformChannel = "telegram" | "onlyfans";
export type PlatformAccount = { id: string; handle: string; health: string; connection: Connection | null };
export type CreatorPlatforms = { schemaVersion: typeof PLATFORM_SCHEMA; creatorName: string; profileId: string | null;
  requested: PlatformChannel[]; readOnly: boolean; telegram: { configured: boolean; status: string | null; handle: string | null };
  onlyfans: { status: "ready" | "unavailable"; accounts: PlatformAccount[]; enrollments: ConnectionEnrollment[]; error: string | null; signIn?: "desktop" | "hosted" }; };
export function platformChannels(value: unknown): value is PlatformChannel[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 2 && new Set(value).size === value.length && value.every(item => item === "telegram" || item === "onlyfans");
}
export function creatorPlatformAccount(accounts: PlatformAccount[], id: string) { return accounts.find(account => account.id === id) ?? null; }
