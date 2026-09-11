import { LYNQ_PORTAL } from "./partner-portals";

// Exact server-owned identifiers for the read-only Bri live-data preview.
// Never match a demo by email, display name or submitted portal branding.
export const BRI_LIVE_DEMO_ACCOUNT_ID = "05e6d016-9662-4f14-804d-821bc5b68952";
export const BRI_LIVE_DEMO_CLONE_ID = "0328e7b3-a1e5-465a-9a30-c9cf6519cba1";
export const BRI_LIVE_DEMO_AGENCY_ID = LYNQ_PORTAL.id;

export function isBriLiveDemoAccount(accountId: string): boolean {
  return accountId === BRI_LIVE_DEMO_ACCOUNT_ID;
}
