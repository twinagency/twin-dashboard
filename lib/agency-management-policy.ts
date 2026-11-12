import { isLiveAccess, isScopedLiveAgency } from "../deployment/flirt-live-twin.cjs";
import { JESS_KATE_PORTAL, TETHER_PORTAL } from "./partner-portals";

/** Server-verified agency IDs, never the branding cookie or a submitted name. */
export const LYNQ_MANAGEMENT_AGENCY_ID = "74b03b70-397e-49ab-841f-8adb8241d87d";
export function agencyCanManage(identity: { id: string; dataSource?: string; cloneIds?: string[]; canManage?: boolean } | null | undefined): boolean {
  return isLiveAccess(identity) || (identity?.canManage === true && isScopedLiveAgency(identity)) || identity?.id === LYNQ_MANAGEMENT_AGENCY_ID || identity?.id === JESS_KATE_PORTAL.id || identity?.id === TETHER_PORTAL.id;
}

// Existing live tools, not the separate CRM product preview.
export const AGENCY_LIVE_CRM_ROUTES: Record<string, string> = {
  "/crm/fans": "/users",
  "/crm/inbox": "/users",
  "/crm/campaigns": "/flows",
  "/crm/platforms": "/business",
};
export function agencyManagementRequestAllowed(path: string, method: string, serverAction: boolean): boolean {
  if (path === "/api/payouts" && !serverAction) return ["POST", "PATCH"].includes(method);
  if (serverAction) {
    return method === "POST" && (["/", "/revenue", "/analytics", "/clones", "/users", "/media", "/sequences", "/info", "/flows", "/drip", "/business"].includes(path)
      || /^\/clones\/[0-9a-f-]{36}(\/fans\/[0-9a-f-]{36})?$/i.test(path)
      || /^\/sequences\/[0-9a-f-]{36}$/i.test(path));
  }
  return method === "POST" && ["/api/caption", "/api/compile", "/api/business-account"].includes(path);
}
