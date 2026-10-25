/** Shared server transport. Purpose credentials and response parsers stay with
 * their existing owners. Writes are attempted once; callers preserve uncertainty. */
export function createBackendTransport(fetchImpl: typeof fetch = fetch) {
  return (url: string, request: Pick<RequestInit, "method" | "headers" | "body"> & { timeoutMs?: number }) => {
    const { timeoutMs = 8_000, ...options } = request;
    return fetchImpl(url, { ...options, credentials: "omit", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs) });
  };
}

const PURPOSES = ["API", "CONTROL", "CONFIGURATION", "CAMPAIGN", "CONTENT", "CONNECTION"] as const;
type Purpose = typeof PURPOSES[number];

export function configuredBackendPurpose(purpose: Purpose): { baseUrl: string; token: string } | null {
  const baseUrl = (process.env.ONLYFANS_API_BASE_URL ?? "").trim();
  const token = (process.env[`ONLYFANS_${purpose}_TOKEN`] ?? "").trim();
  if (!baseUrl || !token || PURPOSES.some(other => other !== purpose &&
      (process.env[`ONLYFANS_${other}_TOKEN`] ?? "").trim() === token)) return null;
  try {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
  } catch { return null; }
  return { baseUrl, token };
}
