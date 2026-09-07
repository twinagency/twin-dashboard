// Branding never grants access. Identity and creator assignments come from
// the verified membership in agency-identity.ts.
export const isMoxy = (name?: string) => name?.trim().toLowerCase() === "moxy";
export const AGENCY_PORTAL_COOKIE = "twin_agency_portal";
export const portalLoginPath = (portal?: string) => portal === "moxy" ? "/moxy" : "/lynq";
export const agencyLoginPath = (name?: string) => isMoxy(name) ? "/moxy" : "/lynq";
export const pathAgencyName = (path: string) => path === "/moxy" || path.startsWith("/moxy/") ? "Moxy" : "LYNQ";
export const MOXY_PRIVATE_MODEL_COLUMNS = new Set([
  "text_model", "voice_model", "media_model", "routing_model",
  "voice_enhance_model", "photo_reply_model", "vision_model",
]);
