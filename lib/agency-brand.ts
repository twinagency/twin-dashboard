// Branding never grants access. Identity and creator assignments come from
// the verified membership in agency-identity.ts.
import { PARTNER_PORTALS, portalForPath } from "./partner-portals";
export const isMoxy = (name?: string) => name?.trim().toLowerCase() === "moxy";
export const isLynq = (name?: string) => name?.trim().toLowerCase() === "lynq";
export const AGENCY_PORTAL_COOKIE = "twin_agency_portal";
export const portalLoginPath = (portal?: string) => PARTNER_PORTALS.find(p => p.slug === portal)?.loginPath ?? "/agency/login";
export const agencyLoginPath = (name?: string) => PARTNER_PORTALS.find(p => p.name.toLowerCase() === name?.trim().toLowerCase())?.loginPath ?? "/agency/login";
export const pathAgencyName = (path: string) => portalForPath(path)?.name ?? "FLIRT";
export const MOXY_PRIVATE_MODEL_COLUMNS = new Set([
  "text_model", "voice_model", "media_model", "routing_model",
  "voice_enhance_model", "photo_reply_model", "vision_model",
]);
