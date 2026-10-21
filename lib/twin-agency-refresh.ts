/** Presentation only: never use this helper to grant data or mutation access. */
export function usesTwinAgencyRefresh(audience: string, agencyName: string | undefined, pathname: string): boolean {
  const brand = agencyName?.trim().toLowerCase();
  const twin = audience === "admin" && !brand || audience === "agency" && (brand === "twin" || brand === "twin technologies");
  if (!twin) return false;
  // Deliberately enumerate destinations. Overview and every messaging route,
  // including a creator's fan thread, must retain their existing presentation.
  return ["/clones", "/media", "/revenue", "/agency-admin", "/campaigns", "/onlyfans/campaigns", "/onlyfans/content"].includes(pathname)
    || /^\/clones\/[0-9a-f-]{36}\/?$/i.test(pathname)
    || pathname === "/mtproto-campaign" || pathname.startsWith("/mtproto-campaign/");
}
