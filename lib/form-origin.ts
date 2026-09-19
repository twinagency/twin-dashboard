/** Canonical browser origin, independent of reverse-proxy Host headers. */
export function dashboardOrigin(request: { url: string }): string {
  const configured = process.env.DASHBOARD_PUBLIC_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("FLIRT DASHBOARD_PUBLIC_ORIGIN is required");
  }
  const origin = new URL(configured || request.url);
  if (!["https:", "http:"].includes(origin.protocol)) throw new Error("Invalid dashboard origin");
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") throw new Error("Dashboard origin must use HTTPS");
  return origin.origin;
}
export function trustedFormOrigin(request: { url: string; headers: Headers }): boolean {
  const source = request.headers.get("origin");
  if (!source || source === "null") return false;
  try {
    // Exact serialized origin only: no paths, credentials, or attacker-controlled forwarded hosts.
    return source === dashboardOrigin(request);
  } catch { return false; }
}

