// The agency homepage always shows All creators. Individual Overviews carry
// their selection in the URL so a saved workspace cookie cannot replace home.
export const FLIRT_OVERVIEW_SCOPE_HEADER = "x-flirt-overview-clone";

export function isTopOnlyfansWorkspace(agencyName?: string): boolean {
  return agencyName?.trim().toLowerCase() === "top onlyfans agency";
}

export function usesFlirtAgencyWorkspace(agencyName?: string): boolean {
  return agencyName?.trim().toLowerCase() === "flirt" || isTopOnlyfansWorkspace(agencyName);
}

export function isFlirtOverviewPath(pathname: string | null | undefined, agencyName?: string): boolean {
  return pathname === "/revenue" && usesFlirtAgencyWorkspace(agencyName);
}

export function flirtOverviewHref(cloneId: string | null | undefined): string {
  return cloneId ? `/revenue?clone=${encodeURIComponent(cloneId)}` : "/revenue";
}
