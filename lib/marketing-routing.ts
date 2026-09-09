// Explicit public allowlist: never make the backend or an arbitrary prefix public.
export const TWIN_AGENCY_PREVIEW_PATH = "/twin-agency";
export const AVA_MARKETING_PREVIEW_PATH = "/ava";

function normalizePublicPath(path: string | null | undefined): string | null | undefined {
  if (!path || path === "/") return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isMarketingPath(path: string | null | undefined): boolean {
  const normalized = normalizePublicPath(path);
  return normalized === TWIN_AGENCY_PREVIEW_PATH || normalized === AVA_MARKETING_PREVIEW_PATH;
}
