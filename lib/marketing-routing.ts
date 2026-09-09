// Explicit public allowlist: never make the backend or an arbitrary prefix public.
export const TWIN_AGENCY_PREVIEW_PATH = "/twin-agency";
export const AVA_MARKETING_PREVIEW_PATH = "/ava";

export function isMarketingPath(path: string | null | undefined): boolean {
  return path === TWIN_AGENCY_PREVIEW_PATH || path === AVA_MARKETING_PREVIEW_PATH;
}
