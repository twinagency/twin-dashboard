/** Presentation only. Access decisions remain with the existing route policies. */
export function usesCompactWorkspace(audience: string, agencyName?: string) {
  return audience === "admin" || audience === "agency" && ["twin", "moxy", "flirt"].includes(agencyName?.trim().toLowerCase() ?? "");
}
