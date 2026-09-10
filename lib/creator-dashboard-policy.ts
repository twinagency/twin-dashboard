/** Creator reporting endpoints. This never grants agency/admin membership. */
export const CREATOR_DATA_RESOURCES = {
  "/api/dashboard": "dashboard",
  "/api/dashboard/day-insight": "day-insight",
  "/api/media-sign": "media-sign",
  "/api/avatar": "avatar",
  "/api/fx": "fx",
  "/api/business-account": "business-account",
  "/api/business-connection": "business-connection",
} as const;
export type CreatorDataResource = (typeof CREATOR_DATA_RESOURCES)[keyof typeof CREATOR_DATA_RESOURCES];
export function creatorDataResource(path: string): CreatorDataResource | undefined {
  return CREATOR_DATA_RESOURCES[path as keyof typeof CREATOR_DATA_RESOURCES];
}
export const CREATOR_NAV = [
  { href: "/creator", label: "Earnings", icon: "earnings" },
  { href: "/creator/ppvs", label: "PPVs", icon: "ppvs" },
  { href: "/creator/business", label: "Business", icon: "business" },
  { href: "/creator/info", label: "Info", icon: "info" },
  { href: "/creator/logs", label: "Logs", icon: "logs" },
  { href: "/creator/edit", label: "Edit", icon: "edit" },
] as const;
export function creatorIdentityTabAllowed(url: URL): boolean {
  if (url.pathname !== "/creator/edit") return true;
  return ["tab", "sub"].every(key => url.searchParams.getAll(key).every(value => value === "identity"));
}
/** Validate every supplied scope, including duplicate parameters, before pinning it. */
export function scopeCreatorRequestUrl(input: URL, cloneId: string | null, accountId: string): URL {
  const url = new URL(input);
  for (const key of ["clone", "cloneId", "clone_id", "p_clone"]) {
    if (url.searchParams.getAll(key).some(value => value !== cloneId)) throw new Error("Creator access denied");
    url.searchParams.delete(key);
  }
  for (const key of ["accountId", "creator_account_id"]) {
    if (url.searchParams.getAll(key).some(value => value !== accountId)) throw new Error("Creator access denied");
    url.searchParams.delete(key);
  }
  if (cloneId) {
    url.searchParams.set("clone", cloneId);
    url.searchParams.set("cloneId", cloneId);
  }
  return url;
}
