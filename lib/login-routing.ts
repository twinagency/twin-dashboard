// These are login entry points, never an alternate authorization mechanism.
export function isTwinLoginPath(path: string | null | undefined): boolean {
  return path === "/" || path === "/twin" || path === "/login";
}

export function safeAdminNext(value: string | null | undefined): string {
  const fallback = "/revenue";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const origin = "https://dashboard.invalid";
    const url = new URL(value, origin);
    if (url.origin !== origin || isTwinLoginPath(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
