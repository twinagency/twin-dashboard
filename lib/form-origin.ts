const CANONICAL_PRODUCTION_ORIGIN = "https://dashboard.tgaiclone.xyz";
/** Always-allowed production hosts besides the canonical one (Moxy white-label). */
export const LYNQ_DASHBOARD_ORIGIN = "https://dashboard.lynqai.co";
const DEFAULT_EXTRA_ORIGINS = [LYNQ_DASHBOARD_ORIGIN];

function parseOrigin(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) ? url : null;
  } catch { return null; }
}

/** Allowlisted extra origins: hardcoded production default plus DASHBOARD_EXTRA_ORIGINS (comma list). */
function extraOrigins(): URL[] {
  const fromEnv = (process.env.DASHBOARD_EXTRA_ORIGINS || "").split(",").filter((s) => s.trim());
  const all = process.env.NODE_ENV === "production" ? [...DEFAULT_EXTRA_ORIGINS, ...fromEnv] : fromEnv;
  const parsed = all.map(parseOrigin).filter((u): u is URL => !!u);
  return process.env.NODE_ENV === "production" ? parsed.filter((u) => u.protocol === "https:") : parsed;
}

/**
 * The request's own Host header, but only when it exactly equals the host of an
 * allowlisted origin. X-Forwarded-* headers are never read.
 */
function allowlistedRequestOrigin(request: { headers?: Headers }): string | null {
  const host = request.headers?.get("host")?.trim().toLowerCase();
  if (!host) return null;
  const match = extraOrigins().find((u) => u.host === host);
  return match ? match.origin : null;
}

/** True when the request arrived on the Moxy/LYNQ-branded host. */
export function isLynqHost(request: { headers?: Headers }): boolean {
  return allowlistedRequestOrigin(request) === LYNQ_DASHBOARD_ORIGIN;
}

/** Canonical browser origin, independent of reverse-proxy forwarded headers. */
export function dashboardOrigin(request: { url: string; headers?: Headers }): string {
  const own = allowlistedRequestOrigin(request);
  if (own) return own;
  const configured = process.env.DASHBOARD_PUBLIC_ORIGIN;
  const origin = new URL(configured || (process.env.NODE_ENV === "production"
    ? CANONICAL_PRODUCTION_ORIGIN : request.url));
  if (!["https:", "http:"].includes(origin.protocol)) throw new Error("Invalid dashboard origin");
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("Dashboard origin must use HTTPS");
  return origin.origin;
}
/** Canonical origin only (never the request host), for sending users to the main host. */
export function canonicalDashboardOrigin(request: { url: string }): string {
  return dashboardOrigin({ url: request.url });
}
export function trustedFormOrigin(request: { url: string; headers: Headers }): boolean {
  const source = request.headers.get("origin");
  if (!source || source === "null") return false;
  try {
    // Exact serialized origin only: no paths, credentials, or attacker-controlled forwarded hosts.
    return source === dashboardOrigin(request);
  } catch { return false; }
}
