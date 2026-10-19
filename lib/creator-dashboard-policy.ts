// Presentation and routing only. Every request also verifies the creator session
// and the account's current, server-owned creator_clone_links row.
export const CREATOR_DASHBOARD_NAV = [
  // Icon keys intentionally use the shared operator sidebar's SVG set. The
  // creator workspace is a permission variant of that interface, not a second
  // independently styled navigation system.
  { href: "/creator", label: "Earnings", icon: "EarningsCombo" },
  { href: "/creator/ppvs", label: "Pay Per View", icon: "Media" },
  { href: "/creator/business", label: "Business", icon: "Bot" },
  { href: "/creator/info", label: "Info", icon: "Info" },
  { href: "/creator/logs", label: "Logs", icon: "Logs" },
  { href: "/creator/edit", label: "Edit", icon: "Dials" },
] as const;
export const CREATOR_AUDIENCE_HEADER = "x-dashboard-audience";
export function isCreatorPlatformPage(path: string | null | undefined): boolean {
  return path === "/creator/platforms" || path === "/creator/onlyfans/inbox";
}
export function isCreatorPlatformApiPath(path: string): boolean {
  return path === "/creator-auth/platforms" || path.startsWith("/creator-auth/platforms/") || path === "/creator-auth/onlyfans" || path.startsWith("/creator-auth/onlyfans/");
}
export function creatorPlatformApiAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (serverAction) return false;
  if (path === "/creator-auth/platforms" || /^\/creator-auth\/platforms\/onlyfans\/of-[1-9][0-9]{0,15}$/.test(path)) return ["GET", "HEAD", "POST"].includes(method);
  if (path === "/creator-auth/platforms/onlyfans") return method === "POST";
  return /^\/creator-auth\/onlyfans\/accounts(?:\/[A-Za-z0-9._:-]{1,64}(?:\/conversations(?:\/[A-Za-z0-9._:-]{1,64})?)?)?$/.test(path) && ["GET", "HEAD"].includes(method);
}
export function isCreatorDashboardPath(path: string | null | undefined): boolean {
  return CREATOR_DASHBOARD_NAV.some(item => item.href === path) || path === "/creator/earnings" || path === "/creator/help" || isCreatorPlatformPage(path);
}
export function creatorApiAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (serverAction || !["GET", "HEAD"].includes(method)) return false;
  return ["/api/dashboard", "/api/dashboard/day-insight", "/api/media-sign", "/api/fx", "/api/avatar", "/api/business-account", "/api/business-connection"].includes(path);
}
export function assertCreatorQuery(params: URLSearchParams, cloneIds: readonly string[]): void {
  for (const key of ["clone", "cloneId", "clone_id"]) {
    for (const id of params.getAll(key)) if (id && !cloneIds.includes(id)) throw new Error("Creator access denied");
  }
  for (const tab of params.getAll("tab")) if (tab && !["identity", "ppvs"].includes(tab)) throw new Error("Identity is the only editable settings tab");
  for (const sub of params.getAll("sub")) if (sub) throw new Error("Additional settings are not available to creators");
}
export function creatorDashboardAlias(path: string, params: URLSearchParams, cloneIds: readonly string[]): string | null {
  const aliases: Record<string, string> = { "/": "/creator", "/revenue": "/creator", "/business": "/creator/business", "/info": "/creator/info", "/logs": "/creator/logs", "/media": "/creator/ppvs" };
  if (aliases[path]) return aliases[path];
  const clone = path.match(/^\/clones\/([0-9a-f-]{36})$/i)?.[1];
  if (clone && cloneIds.includes(clone)) return params.get("tab") === "ppvs" ? "/creator/ppvs" : "/creator/edit";
  return null;
}
