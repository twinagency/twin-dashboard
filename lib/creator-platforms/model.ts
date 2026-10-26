import { parseConnectionSync, type Connection } from "../onlyfans-connections/contract";
import { connectionState, type ConnectionState } from "../onlyfans-connections/presentation";
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

export type PlatformConnectionState = ConnectionState;
export function platformConnectionState(account: PlatformAccount, now = Date.now()): PlatformConnectionState {
  return connectionState(account.connection, now);
}
export function activePlatformEnrollment(enrollment: ConnectionEnrollment, now = Date.now()): boolean {
  return ["pending", "checking"].includes(enrollment.status) && Date.parse(enrollment.expiresAt) > now;
}

/** Validate the public fields consumed by the connection screen before replacing its snapshot. */
export function parseCreatorPlatforms(value: unknown): CreatorPlatforms | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as CreatorPlatforms;
  if (v.schemaVersion !== PLATFORM_SCHEMA || typeof v.creatorName !== "string" || !(v.profileId === null || typeof v.profileId === "string") || typeof v.readOnly !== "boolean") return null;
  if (!Array.isArray(v.requested) || v.requested.length > 2 || new Set(v.requested).size !== v.requested.length || v.requested.some(channel => !["telegram", "onlyfans"].includes(channel))) return null;
  if (!v.telegram || typeof v.telegram.configured !== "boolean" || !(v.telegram.status === null || typeof v.telegram.status === "string") || !(v.telegram.handle === null || typeof v.telegram.handle === "string")) return null;
  if (!v.onlyfans || !["ready", "unavailable"].includes(v.onlyfans.status) || !Array.isArray(v.onlyfans.accounts) || !Array.isArray(v.onlyfans.enrollments)) return null;
  if (v.onlyfans.accounts.some(account => !account || typeof account.id !== "string" || typeof account.handle !== "string" || !(account.connection === null || account.connection && ["unconfigured", "pending", "verified", "failed", "expired", "paused"].includes(account.connection.status) && typeof account.connection.outgoingEnabled === "boolean" && (account.connection.expiresAt === null || typeof account.connection.expiresAt === "string" && Number.isFinite(Date.parse(account.connection.expiresAt)))))) return null;
  if (v.onlyfans.accounts.some(({connection:c}) => c && (
    ("sync" in c && !parseConnectionSync(c.sync)) ||
    ("verifiedAt" in c && !(c.verifiedAt === null || typeof c.verifiedAt === "string" && Number.isFinite(Date.parse(c.verifiedAt)))) ||
    ("lastError" in c && !(c.lastError === null || typeof c.lastError === "string" && /^[a-z0-9_]{1,160}$/.test(c.lastError)))
  ))) return null;
  if (new Set(v.onlyfans.accounts.map(account => account.id)).size !== v.onlyfans.accounts.length) return null;
  if (v.onlyfans.enrollments.some(enrollment => !enrollment || typeof enrollment.id !== "string" || !["pending", "checking", "accepted", "failed", "expired"].includes(enrollment.status) || typeof enrollment.expiresAt !== "string" || !Number.isFinite(Date.parse(enrollment.expiresAt)))) return null;
  return v;
}
