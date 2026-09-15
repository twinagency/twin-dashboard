import { JESS_KATE_PORTAL, TETHER_PORTAL } from "./partner-portals";

/** Server-verified agency IDs, never the branding cookie or a submitted name. */
export const LYNQ_MANAGEMENT_AGENCY_ID = "74b03b70-397e-49ab-841f-8adb8241d87d";
export function agencyCanManage(identity: { id: string } | null | undefined): boolean {
  return identity?.id === LYNQ_MANAGEMENT_AGENCY_ID || identity?.id === JESS_KATE_PORTAL.id || identity?.id === TETHER_PORTAL.id;
}

// Exact manager-only CRM entry points. Values document the existing live
// capability behind each surface; authorization only depends on the keys.
// Keep this explicit rather than allowing a /crm/* wildcard so a future admin
// route cannot accidentally become available to partner agencies.
export const AGENCY_LIVE_CRM_ROUTES: Record<string, string> = {
  "/crm": "/crm",
  "/crm/fans": "/users",
  "/crm/inbox": "/users",
  "/crm/mass-messages": "/crm/mass-messages",
  "/crm/automations": "/flows",
  "/crm/vault": "/media",
  "/crm/publishing": "/crm/publishing",
  "/crm/analytics": "/revenue",
  "/crm/team": "/crm/team",
  "/crm/settings": "/crm/settings",
  // Bookmarks from the old preview still resolve through these routes.
  "/crm/campaigns": "/crm/mass-messages",
  "/crm/platforms": "/crm/settings",
};
export function agencyManagementRequestAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (serverAction) {
    return method === "POST" && (["/", "/revenue", "/analytics", "/clones", "/users", "/media", "/sequences", "/info", "/flows", "/drip", "/business", "/crm/inbox", "/crm/automations", "/crm/vault"].includes(path)
      || /^\/clones\/[0-9a-f-]{36}(\/fans\/[0-9a-f-]{36})?$/i.test(path)
      || /^\/sequences\/[0-9a-f-]{36}$/i.test(path));
  }
  return method === "POST" && ["/api/caption", "/api/compile", "/api/business-account"].includes(path);
}
