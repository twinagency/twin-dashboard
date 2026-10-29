// Shared avatar resolution: verified provider photo, then approved creator
// portrait, then initials. Pure so every screen and the tests use one rule.
const PROVIDER_AVATAR_HOSTS = ["onlyfans.com", "ofusercontent.com", "onlyfansusercontent.com"];

/** Only https images on an OnlyFans-owned host may be requested from the browser. */
export function isVerifiedProviderAvatar(url: string | null | undefined): url is string {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      && PROVIDER_AVATAR_HOSTS.some(domain => u.hostname === domain || u.hostname.endsWith("." + domain));
  } catch { return false; }
}

export function initialsFor(name: string, fallback = "OF"): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || fallback;
}

/** Failure memory is keyed by identity AND image URL, never by display name. */
export const avatarFailureKey = (id: string, url: string) => `${id}\u0000${url}`;

export type AvatarSource = { kind: "provider" | "portrait"; url: string } | { kind: "initials" };

/**
 * Each URL that failed once is skipped for that id, so a broken photo falls back
 * one step and is never retried. A new id or a new URL has no recorded failure.
 */
export function resolveAvatarSource(input: { id: string; providerUrl?: string | null; portraitUrl?: string | null; failed: readonly string[] }): AvatarSource {
  const { id, providerUrl, portraitUrl, failed } = input;
  if (isVerifiedProviderAvatar(providerUrl) && !failed.includes(avatarFailureKey(id, providerUrl))) return { kind: "provider", url: providerUrl };
  if (portraitUrl && !failed.includes(avatarFailureKey(id, portraitUrl))) return { kind: "portrait", url: portraitUrl };
  return { kind: "initials" };
}
