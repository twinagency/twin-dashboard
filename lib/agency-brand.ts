// Branding never grants access. Identity and creator assignments come from
// the verified membership in agency-identity.ts.
import { PARTNER_PORTALS, TOP_ONLYFANS_AGENCY, portalForPath } from "./partner-portals";
export const isMoxy = (name?: string) => name?.trim().toLowerCase() === "moxy";
// Shared presentation only. Membership and assigned creator scopes stay unchanged.
export const isTopOnlyfansAgency = (name?: string) => name?.trim().toLowerCase() === TOP_ONLYFANS_AGENCY.name.toLowerCase();
export const usesAgencyOverview = (name?: string) => isMoxy(name) || isTopOnlyfansAgency(name);
export const isLynq = (name?: string) => name?.trim().toLowerCase() === "lynq";
export const AGENCY_PORTAL_COOKIE = "twin_agency_portal";
export const portalLoginPath = (portal?: string) => portal === "twin" ? "/agency/login" : PARTNER_PORTALS.find(p => p.slug === portal)?.loginPath ?? "/link";
export const agencyLoginPath = (name?: string) => PARTNER_PORTALS.find(p => p.name.toLowerCase() === name?.trim().toLowerCase())?.loginPath ?? "/link";
export const pathAgencyName = (path: string) => portalForPath(path)?.name ?? "LYNQ";
export const MOXY_PRIVATE_MODEL_COLUMNS = new Set([
  "text_model", "voice_model", "media_model", "routing_model",
  "voice_enhance_model", "photo_reply_model", "vision_model", "photo_vision_model",
]);
