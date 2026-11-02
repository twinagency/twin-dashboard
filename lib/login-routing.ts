// These are standalone entry points, never an alternate authorization mechanism.
// Creator routes are included so the root layout never wraps the creator portal
// in the internal admin shell. Creator auth itself is enforced separately by
// middleware.ts before this helper is consulted there.
export function isTwinLoginPath(path: string | null | undefined): boolean {
  return path === "/" || path === "/twin" || path === "/login" || (path === "/creator" || !!path?.startsWith("/creator/"));
}

export function safeAdminNext(value: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const origin = "https://dashboard.invalid";
    const url = new URL(value, origin);
    if (url.origin !== origin || isTwinLoginPath(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
