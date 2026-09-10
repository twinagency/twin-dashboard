// Presentation only. This hint never selects an account, agency, clone or demo.
export const CREATOR_PORTAL_COOKIE = "creator_portal_brand";
export type CreatorPortal = "link" | "twin";
export function normalizeCreatorPortal(value: unknown): CreatorPortal | null {
  return value === "link" || value === "lynq" ? "link" : value === "twin" ? "twin" : null;
}
export function creatorPortalHref(path: string, portal: CreatorPortal): string {
  const url = new URL(path, "https://creator.invalid");
  if (url.origin !== "https://creator.invalid" || !url.pathname.startsWith("/creator/")) throw new Error("Invalid creator portal destination");
  url.searchParams.set("portal", portal);
  return url.pathname + url.search;
}
