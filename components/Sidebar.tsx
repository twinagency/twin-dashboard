"use client";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { agencyDashboardPath, isPartnerPreview } from "@/lib/agency-policy";
import { isMoxy } from "@/lib/agency-brand";
import { JESS_KATE_PORTAL, TETHER_PORTAL } from "@/lib/partner-portals";
import { CREATOR_DASHBOARD_NAV } from "@/lib/creator-dashboard-policy";

// Left sidebar app shell (desktop). "Create new clone" is always the first
// thing in it, followed by the operating views. Internal admin tools are
// grouped for the internal presentation, with the full layout available in More.
// Partner navigation keeps its approved structure. Each page type appears ONCE, scoped
// by the clone switcher in the header (components/CloneSwitcher.tsx, "All
// clones" by default). Picking/managing a clone lives in the header switcher
// popup + the /clones page, not here, no duplicate clone list in the
// sidebar. Settings/AI/Feedback/Changelog used to live in a separate footer
// section; they're folded into the one list now, ordered by importance.
//
// Mobile keeps the existing hamburger (MobileMenu), this component only
// renders at lg+ (see layout.tsx).

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { openCloneSwitcher } from "@/lib/clone-switcher-bus";
import TwinAssistant from "@/components/TwinAssistant";
import TwinWordmark from "@/components/TwinWordmark";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };

type NavLink =
  | { kind: "route"; label: string; href: string; icon: string; color: LinkColor; gateOnClone?: boolean }
  | { kind: "tab"; label: string; tab: string; icon: string; color: LinkColor };

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className + " shrink-0"}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

const PATHS: Record<string, string> = {
  Revenue: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 7h5v5"/>',
  Clones: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  Edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  Users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 1 0 7.75"/>',
  Logs: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  Info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  Flows:
    '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  Media: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  Feedback: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  Messages: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  Dials: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  Dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  Settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  Plus: '<path d="M12 5v14M5 12h14"/>',
  Code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  SignOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  Search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  ArrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  ArrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  Inbox:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  Database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  Bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  ListChecks: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  Bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  More: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};

type LinkColor = "neutral" | "good" | "purple" | "orange" | "blue" | "red" | "pink" | "gray";
const LINK_COLOR_CLASSES: Record<LinkColor, { icon: string; active: string; idle: string }> = {
  neutral: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  good: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  purple: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  orange: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  blue: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  pink: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  red: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
  gray: { icon: "text-[#9cbad3]", active: "bg-white/12 text-white ring-1 ring-white/12", idle: "text-white/68 hover:bg-white/[0.07] hover:text-white" },
};

const TWIN_ADMIN_NAV_LABELS: Record<string, string> = {
  "/revenue": "Overview",
  "/users": "Live Telegram Window",
  "/business": "Upload Telegram Story",
  identity: "Creator Configuration",
  ppvs: "PPVs",
  "/jarvis": "Core Intelligence",
};

const NAV_LINKS: NavLink[] = [
  { kind: "route", label: "Earnings", href: "/revenue", icon: "EarningsCombo", color: "good" },
  { kind: "route", label: "Sales Health", href: "/sales-health", icon: "ListChecks", color: "blue" },
  { kind: "route", label: "Creators", href: "/clones", icon: "Clones", color: "blue" },
  { kind: "route", label: "Fans", href: "/users", icon: "FansCombo", color: "purple" },
  { kind: "tab", label: "PPVs", tab: "ppvs", icon: "Media", color: "red" },
  { kind: "route", label: "Storage", href: "/storage", icon: "Database", color: "blue" },
  { kind: "route", label: "Business", href: "/business", icon: "Bot", color: "purple", gateOnClone: true },
  { kind: "route", label: "Bot V2", href: "/bot-v2", icon: "Bot", color: "blue" },
];

const CREATOR_LINKS: NavLink[] = CREATOR_DASHBOARD_NAV.map((item) => ({
  kind: "route",
  href: item.href,
  label: item.label,
  icon: item.icon,
  color: "neutral",
}));

const MORE_LINKS: NavLink[] = [
  { kind: "route", label: "AI", href: "/jarvis", icon: "Sparkle", color: "blue" },
  { kind: "route", label: "Flows", href: "/flows", icon: "Flows", color: "pink", gateOnClone: true },
  { kind: "route", label: "Sequences", href: "/sequences", icon: "Media", color: "red", gateOnClone: true },
  { kind: "route", label: "Catalogue funnel", href: "/catalogue-funnel", icon: "Flows", color: "pink" },
  { kind: "route", label: "Mini App rollout", href: "/miniapp-rollout", icon: "ListChecks", color: "pink" },
  // MTProto Campaign (2026-09-22): its own top-level system, not a Flows
  // sub-page (plan section N7) — a laptop-only re-engagement extension, self
  // -contained under app/mtproto-campaign, lib/mtproto, components/mtproto.
  // Not gated on a selected clone: the page has its own multi-creator picker.
  // Deliberately absent from lib/agency-policy.ts agencyDashboardPath(), so
  // this row and the route itself stay invisible/403 to every agency session.
  { kind: "route", label: "MTProto Campaign", href: "/mtproto-campaign", icon: "Bell", color: "pink" },
  { kind: "tab", label: "Edit", tab: "identity", icon: "Dials", color: "blue" },
  { kind: "route", label: "Tracker", href: "/tracker", icon: "ListChecks", color: "orange" },
  { kind: "route", label: "Info", href: "/info", icon: "Info", color: "neutral" },
  { kind: "route", label: "Logs", href: "/logs", icon: "Logs", color: "neutral" },
  { kind: "route", label: "Sim", href: "/sim", icon: "Bot", color: "orange" },
  { kind: "route", label: "Agency access", href: "/agency-admin", icon: "Settings", color: "gray" },
  { kind: "route", label: "Creator invites", href: "/agency-admin/creator-codes", icon: "Users", color: "gray" },
  { kind: "route", label: "Accounts", href: "/agency/creators", icon: "Users", color: "gray" },
  { kind: "route", label: "Invite creator", href: "/agency/creator-invites", icon: "Users", color: "gray" },
  { kind: "route", label: "API", href: "/api-access", icon: "Code", color: "blue" },
  { kind: "route", label: "Settings", href: "/settings", icon: "Settings", color: "gray" },
];

// Moxy agency sessions share expanded groups on desktop and mobile.
// Labels and ordering never depend on write permissions.
const MOXY_LINKS: NavLink[] = [
  { kind: "route", label: "Earnings", href: "/revenue", icon: "EarningsCombo", color: "good" },
  { kind: "route", label: "Creators", href: "/clones", icon: "Clones", color: "blue" },
  { kind: "route", label: "Creator onboarding", href: "/agency/creators", icon: "ListChecks", color: "gray" },
  { kind: "tab", label: "Content", tab: "ppvs", icon: "Media", color: "red" },
  { kind: "route", label: "Telegram Stories", href: "/business", icon: "Bot", color: "purple", gateOnClone: true },
  { kind: "route", label: "Flows", href: "/flows", icon: "Flows", color: "pink", gateOnClone: true },
  { kind: "tab", label: "Creator settings", tab: "identity", icon: "Dials", color: "blue" },
  { kind: "route", label: "Connection details", href: "/info", icon: "Info", color: "neutral" },
  { kind: "route", label: "Activity logs", href: "/logs", icon: "Logs", color: "neutral" },
];

const MOXY_SIDEBAR_THEME = `
html[data-agency="moxy"] .dashboard-sidebar { width: 280px; background: #080808; }
html[data-agency="moxy"] #mobile-sidebar { width: min(88vw, 280px); }
.moxy-sidebar-brand { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 22px 24px 10px; }
.moxy-sidebar-brand img { width: 160px; }
.moxy-sidebar-access { margin: 4px 0 0; color: #a1aaa5; font-size: 12px; line-height: 18px; }
.moxy-sidebar-action { flex-shrink: 0; padding: 12px 16px 24px; }
.moxy-invite-button { display: flex; min-height: 48px; width: 100%; align-items: center; justify-content: center; gap: 10px; border: 1px solid #97edd3; border-radius: 10px; background: #79e1c2; color: #08271d; box-shadow: 0 3px 12px rgb(0 0 0 / .16); font-size: 15px; line-height: 22px; font-weight: 650; transition: background-color .15s, box-shadow .15s; }
.moxy-invite-button:hover { background: #9aedd4; box-shadow: 0 4px 16px rgb(121 225 194 / .15); }
.moxy-invite-button[aria-current="page"] { box-shadow: 0 0 0 2px #080808, 0 0 0 3px #79e1c2; }
.moxy-sidebar-nav { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 12px; }
.moxy-sidebar-group + .moxy-sidebar-group { margin-top: 26px; }
.moxy-sidebar-heading { margin: 0 0 8px; padding: 0 12px; color: #939e98; font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: .13em; text-transform: uppercase; }
.moxy-sidebar-row { position: relative; display: flex; width: 100%; min-height: 46px; align-items: center; gap: 13px; margin: 2px 0; padding: 10px 12px; border-radius: 7px; text-align: left; font-size: 15px; line-height: 22px; font-weight: 400; transition: background-color .15s, color .15s; }
.moxy-sidebar-row--idle { color: #bec7c2; }
.moxy-sidebar-row--idle:hover { background: #1b211e; color: #ffffff; }
.moxy-sidebar-row--active { background: #15312b; color: #79e1c2; font-weight: 500; }
.moxy-sidebar-row--active::before { position: absolute; top: 12px; bottom: 12px; left: 0; width: 3px; border-radius: 3px; background: #60dcb6; content: ""; }
.moxy-sidebar-row:focus-visible, .moxy-invite-button:focus-visible { outline: 2px solid #79e1c2; outline-offset: 3px; }
.moxy-sidebar-utilities { flex-shrink: 0; padding: 0 16px 16px; }
.moxy-sidebar-utilities > div { border-top: 1px solid #272e2a; padding-top: 12px; }
@media (max-height: 560px) {
  .moxy-sidebar-brand { padding-top: 12px; padding-bottom: 4px; }
  .moxy-sidebar-brand img { width: 126px; }
  .moxy-sidebar-action { padding-top: 6px; padding-bottom: 12px; }
  .moxy-sidebar-utilities { padding-bottom: 8px; }
  .moxy-sidebar-utilities > div { padding-top: 6px; }
}
`;

const CRM_LINKS: NavLink[] = [
  { kind: "route", label: "Inbox", href: "/crm/inbox", icon: "Inbox", color: "purple" },
  { kind: "route", label: "Fan CRM", href: "/crm/fans", icon: "Users", color: "blue" },
  { kind: "route", label: "Campaigns", href: "/crm/campaigns", icon: "Flows", color: "pink" },
  { kind: "route", label: "Team", href: "/crm/team", icon: "Users", color: "orange" },
  { kind: "route", label: "Platforms", href: "/crm/platforms", icon: "Database", color: "good" },
];

const ADMIN_LINKS: NavLink[] = [
  { kind: "route", label: "T-Social", href: "/tsocial", icon: "Users", color: "pink" },
  { kind: "route", label: "AI Models", href: "/ai-models", icon: "Sparkle", color: "pink" },
  { kind: "route", label: "Earnings split", href: "/admin/earnings-split", icon: "Dollar", color: "orange" },
  { kind: "route", label: "View as", href: "/admin/view-as", icon: "Users", color: "gray" },
];

// Internal Twin ordering is shared by the desktop sidebar and mobile menu.
const TWIN_ADMIN_ORDER = ["/dashboard", "/revenue", "/clones", "/fans", "/inbox", "/users", "/business", "ppvs", "/content-library", "/campaigns", "identity", "/agency-admin", "/admin/earnings-split", "/catalogue-funnel", "/agency/creators", "/agency/creator-invites"];
const TWIN_ADMIN_LINKS: NavLink[] = [
  { kind: "route", label: "Campaigns", href: "/campaigns", icon: "Bell", color: "blue" },
  { kind: "route", label: "Unified Inbox", href: "/inbox", icon: "Inbox", color: "blue" },
  { kind: "route", label: "Content Library", href: "/content-library", icon: "Media", color: "blue" },
  { kind: "route", label: "Dashboard", href: "/dashboard", icon: "Clones", color: "blue" },
  ...NAV_LINKS,
  { kind: "route", label: "Fan profiles", href: "/fans", icon: "Users", color: "blue" },
  ...MORE_LINKS,
  ...ADMIN_LINKS,
];
const adminLinkKey = (link: NavLink) => link.kind === "route" ? link.href : link.tab;
const TWIN_ADMIN_PRIMARY = TWIN_ADMIN_ORDER.map(key => TWIN_ADMIN_LINKS.find(link => adminLinkKey(link) === key)!);
const TWIN_ADMIN_REMAINDER = TWIN_ADMIN_LINKS.filter(link => !TWIN_ADMIN_ORDER.includes(adminLinkKey(link)));

// Presentation navigation reuses existing destinations; it grants no access.
const ADMIN_NAV_STORAGE_KEY = "twin:admin-full-navigation:v1";
type AdminGroup = { label: string; icon: string; href?: string; children?: string[] };
const TWIN_ADMIN_GROUPS: AdminGroup[] = [
  { label: "Dashboard", icon: "Clones", href: "/dashboard" },
  { label: "Creators", icon: "Clones", href: "/clones", children: ["identity", "/agency-admin/creator-codes", "/agency/creator-invites", "/clones/new"] },
  { label: "Fan Profiles", icon: "Users", href: "/fans" },
  { label: "Unified Inbox", icon: "Inbox", href: "/inbox", children: ["/users"] },
  { label: "Content Library", icon: "Media", href: "/content-library", children: ["ppvs", "/business"] },
  { label: "Campaigns", icon: "Bell", href: "/campaigns" },
  { label: "Automations", icon: "Flows", children: ["/flows", "/sequences"] },
  { label: "Performance", icon: "Revenue", children: ["/revenue", "/sales-health", "/catalogue-funnel"] },
  { label: "Agency Access", icon: "Users", href: "/agency-admin", children: ["/agency/creators"] },
  { label: "Core Intelligence", icon: "Sparkle", href: "/jarvis", children: ["/ai-models"] },
  { label: "Settings", icon: "Settings", href: "/settings", children: ["/admin/earnings-split"] },
];
const TWIN_ADMIN_MORE = ["/storage", "/logs", "/api-access", "/sim", "/bot-v2", "/miniapp-rollout", "/mtproto-campaign", "/tracker", "/info", "/tsocial", "/admin/view-as"];
const presentationLink = (key: string): NavLink => key === "/clones/new"
  ? { kind: "route", href: key, label: "Create new creator", icon: "Plus", color: "neutral" }
  : TWIN_ADMIN_LINKS.find(link => adminLinkKey(link) === key)!;


const TETHER_SIDEBAR_THEME = `
.dashboard-sidebar,
.dashboard-mobile-header {
  background: linear-gradient(180deg, #111318 0%, #090b0f 55%, #050607 100%) !important;
  box-shadow: 8px 0 32px rgba(0,0,0,.16);
}
.dashboard-sidebar nav [class~="text-[#9cbad3]"] { color: #8be7ff; }
.dashboard-sidebar nav [class~="text-white/68"] { color: rgba(248,250,252,.80); }
.dashboard-sidebar nav :is(a,button)[class~="bg-white/12"] {
  background: rgba(255,255,255,.12);
  color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(139,231,255,.12);
}
.dashboard-sidebar [class~="border-sky-400/20"] {
  position: relative;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: .35rem;
  min-height: 8.9rem;
  overflow: visible;
  border-color: transparent;
  background-color: transparent;
  padding-top: .6rem;
  padding-bottom: .85rem;
}
.dashboard-sidebar [class~="border-sky-400/20"]::before {
  position: absolute;
  top: .25rem;
  left: 50%;
  width: 9rem;
  height: 7rem;
  transform: translateX(-50%);
  border-radius: 999px;
  background: radial-gradient(circle at 50% 43%, rgba(80,205,255,.28), rgba(37,156,255,.11) 34%, transparent 68%);
  filter: blur(8px);
  content: "";
  pointer-events: none;
}
.dashboard-sidebar [class~="bg-sky-400/[0.05]"] { background-color: transparent; }
.dashboard-sidebar [class~="border-sky-400/20"] canvas {
  --intelligence-core-glow-rgb: 56,189,248;
  --intelligence-core-edge-rgb: 45,190,255;
  --intelligence-core-front-rgb: 238,252,255;
  --intelligence-core-back-rgb: 103,232,249;
  --intelligence-core-accent-rgb: initial;
  --intelligence-core-glow-alpha: .22;
  position: relative;
  z-index: 1;
  transform: scale(1.34);
  transform-origin: center;
  margin-top: .4rem;
  margin-bottom: .65rem;
  filter: drop-shadow(0 0 10px rgba(64,190,255,.56)) drop-shadow(0 0 22px rgba(37,156,255,.26));
}
.dashboard-sidebar [class~="border-sky-400/20"] > div {
  position: relative;
  z-index: 2;
  width: 100%;
  text-align: center;
}
.dashboard-sidebar [class~="text-[#38bdf8]"] {
  display: block;
  color: transparent;
  font-size: 0;
  line-height: 1;
  text-shadow: none;
}
.dashboard-sidebar [class~="text-[#38bdf8]"]::before {
  display: block;
  color: #ffffff;
  font-size: .86rem;
  font-weight: 700;
  letter-spacing: -.015em;
  line-height: 1.15;
  content: "AI Intelligence";
}
.dashboard-sidebar [class~="text-[#38bdf8]"]::after {
  display: block;
  margin-top: .22rem;
  color: #7dd3fc;
  font-size: .76rem;
  font-weight: 800;
  letter-spacing: .12em;
  line-height: 1;
  text-transform: uppercase;
  content: "Core";
  text-shadow: 0 0 14px rgba(80,205,255,.45);
}
`;

export function SidebarContent({ activeCloneId, onNavigate, headerAction, showAssistant = false }: { activeCloneId: string | null; onNavigate?: () => void; headerAction?: ReactNode; showAssistant?: boolean }) {
  const {readOnly,isAgency,isCreator,canManage,agencyName,audience}=useDashboardAccess();
  const isAdmin = audience === "admin";
  const moxyNavigation = isAgency && isMoxy(agencyName);
  const expandedMoxyNavigation = isAgency && readOnly && isMoxy(agencyName);
  const isJessKate = isAgency && agencyName === JESS_KATE_PORTAL.name;
  const isTether = agencyName === TETHER_PORTAL.name;
  const isPreview = isAgency && isPartnerPreview(agencyName);
  // Creator workspaces use this exact core block as well. The audience only
  // narrows navigation and authority; it does not fork the Tether design.
  const usesBrandedCore = isCreator || isJessKate || isTether;
  const primaryLinks = moxyNavigation
    ? MOXY_LINKS
    : isCreator
    ? CREATOR_LINKS
    : isPreview
    ? [...NAV_LINKS, ...MORE_LINKS.filter(item => item.kind === "tab" && item.tab === "identity")]
    : isAdmin
    ? TWIN_ADMIN_PRIMARY
    : NAV_LINKS.flatMap(link => expandedMoxyNavigation && link.kind === "tab" && link.tab === "ppvs" ? [link, ...MORE_LINKS.filter(item => item.kind === "tab" && item.tab === "identity")] : [link]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const [fullNavigation, setFullNavigation] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!isAdmin) return;
    try { setFullNavigation(window.localStorage.getItem(ADMIN_NAV_STORAGE_KEY) === "true"); } catch { /* Keep the grouped default. */ }
  }, [isAdmin]);
  const setNavigationLayout = (full: boolean) => {
    setFullNavigation(full);
    setMoreOpen(false);
    try { window.localStorage.setItem(ADMIN_NAV_STORAGE_KEY, String(full)); } catch { /* Session-only preference. */ }
  };
  const activeTab = searchParams.get("tab") ?? "config";
  // /creator is the creator Earnings page, not a parent navigation section.
  // Exact matching prevents Earnings staying highlighted on all five child
  // routes at the same time as their own item.
  const isGlobalActive = (href: string) => {
    if (isAdmin && ["/clones", "/agency-admin"].includes(href)) return pathname === href;
    if (moxyNavigation && href === "/clones" && pathname.startsWith("/clones/") && ["ppvs", "identity"].includes(activeTab)) return false;
    return pathname === href || (!isCreator && href !== "/" && pathname.startsWith(href + "/"));
  };
  const onConfigurePage = activeCloneId ? pathname === `/clones/${activeCloneId}` : false;
  const pickClone = () => { onNavigate?.(); window.setTimeout(() => openCloneSwitcher(), 0); };

  const navLabel = (link: NavLink, colors: (typeof LINK_COLOR_CLASSES)[LinkColor]) => {
    const key = link.kind === "route" ? link.href : link.tab;
    const presentationLabels: Record<string, string> = { "/revenue": "Earnings", "/agency-admin/creator-codes": "Invitations", "/fans": "Fan Profiles", "/agency-admin": "Agency Access" };
    const label = isAdmin ? (!fullNavigation ? presentationLabels[key] : undefined) ?? TWIN_ADMIN_NAV_LABELS[key] ?? link.label : link.label;
    if (link.icon === "FansCombo") return <><Icon d={PATHS.Users} className={"h-[18px] w-[18px] " + colors.icon} /><span className="flex-1">{label}</span><Icon d={PATHS.Messages} className="h-4 w-4 text-current opacity-45" /></>;
    if (link.icon === "EarningsCombo") return <><Icon d={PATHS.Dollar} className={"h-[18px] w-[18px] " + colors.icon} /><span className="flex-1">{label}</span></>;
    return <><Icon d={PATHS[link.icon]} className={"h-[18px] w-[18px] " + colors.icon} />{label}</>;
  };
  const availableLink = (link: NavLink) => !isAgency || link.kind === "tab" || agencyDashboardPath(link.href, agencyName, canManage);
  const linkKey = (link: NavLink) => link.kind === "route" ? link.href : link.tab;
  const renderLink = (link: NavLink) => {
    const colors = moxyNavigation
      ? { icon: "text-current", active: "moxy-sidebar-row--active", idle: "moxy-sidebar-row--idle" }
      : LINK_COLOR_CLASSES[link.color];
    const rowClass = moxyNavigation ? "moxy-sidebar-row" : "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition";
    if (isAgency && link.kind === "route" && !agencyDashboardPath(link.href, agencyName, canManage)) return null;
    if (link.kind === "tab") {
      if (isPreview && link.tab !== "identity") return null;
      const active = onConfigurePage && (isAdmin && link.tab === "identity" ? activeTab !== "ppvs" : activeTab === link.tab);
      if (!activeCloneId) return <button type="button" onClick={pickClone} title="Pick a creator first" className={rowClass + " " + colors.idle}>{navLabel(link, colors)}</button>;
      return <Link href={`/clones/${activeCloneId}?tab=${link.tab}`} onClick={onNavigate} aria-current={active ? "page" : undefined} className={rowClass + " " + (active ? colors.active : colors.idle)}>{navLabel(link, colors)}</Link>;
    }
    if (link.gateOnClone && !activeCloneId) return <button type="button" onClick={pickClone} title="Pick a creator first" className={rowClass + " " + colors.idle}>{navLabel(link, colors)}</button>;
    return <Link href={link.href} onClick={onNavigate} aria-current={isGlobalActive(link.href) ? "page" : undefined} className={rowClass + " " + (isGlobalActive(link.href) ? colors.active : colors.idle)}>{navLabel(link, colors)}</Link>;
  };

  const isAdminLinkActive = (key: string) => {
    const link = presentationLink(key);
    return link.kind === "tab"
      ? onConfigurePage && (link.tab === "identity" ? activeTab !== "ppvs" : activeTab === link.tab)
      : isGlobalActive(link.href);
  };
  const chevron = (open: boolean) => <svg aria-hidden="true" className={(open ? "rotate-180 " : "") + "h-4 w-4 shrink-0 transition-transform"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
  const adminNavigation = <div className="space-y-1" data-admin-navigation="grouped">
    {TWIN_ADMIN_GROUPS.map(group => {
      const selected = Boolean(group.href && isAdminLinkActive(group.href)) || Boolean(group.children?.some(isAdminLinkActive));
      const expanded = openGroups[group.label] ?? Boolean(group.children?.some(isAdminLinkActive));
      const id = `admin-nav-${group.label.toLowerCase().replaceAll(" ", "-")}${headerAction ? "-mobile" : "-desktop"}`;
      const toggle = () => setOpenGroups(current => ({ ...current, [group.label]: !expanded }));
      return <div key={group.label} data-nav-group={group.label}>
        <div className="flex items-center gap-1">
          {group.href ? <div className="min-w-0 flex-1">{renderLink(presentationLink(group.href))}</div> : <button type="button" onClick={toggle} aria-expanded={expanded} aria-controls={id} className={"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition " + (selected ? LINK_COLOR_CLASSES.neutral.active : LINK_COLOR_CLASSES.neutral.idle)}><Icon d={PATHS[group.icon]} className="h-[18px] w-[18px] text-[#9cbad3]"/><span className="flex-1">{group.label}</span>{chevron(expanded)}</button>}
          {group.href && group.children ? <button type="button" onClick={toggle} aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`} aria-expanded={expanded} aria-controls={id} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white">{chevron(expanded)}</button> : null}
        </div>
        {group.children ? <div id={id} hidden={!expanded} className="ml-5 mt-1 space-y-1 border-l border-white/14 pl-2 [&_a]:text-xs [&_button]:text-xs">{group.children.map(key => <div key={key}>{renderLink(presentationLink(key))}</div>)}</div> : null}
      </div>;
    })}
    <div className="mt-3 border-t border-white/14 pt-2" data-nav-group="More">
      <button type="button" onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen} aria-controls={headerAction ? "admin-more-mobile" : "admin-more-desktop"} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/62 transition hover:bg-white/10 hover:text-white"><Icon d={PATHS.More} className="h-[18px] w-[18px] text-white/50"/><span className="flex-1">More</span>{chevron(moreOpen)}</button>
      <div id={headerAction ? "admin-more-mobile" : "admin-more-desktop"} hidden={!moreOpen} className="ml-5 mt-1 space-y-1 border-l border-white/14 pl-2 [&_a]:text-xs">
        {TWIN_ADMIN_MORE.map(key => <div key={key}>{renderLink(presentationLink(key))}</div>)}
        <button type="button" onClick={() => setNavigationLayout(true)} className="mt-2 w-full border-t border-white/14 px-3 py-3 text-left text-xs text-white/60 hover:text-white">Show full navigation</button>
      </div>
    </div>
  </div>;

  if (moxyNavigation) return <>
    <style dangerouslySetInnerHTML={{ __html: MOXY_SIDEBAR_THEME }} />
    <div className="moxy-sidebar-brand">
      <div className="min-w-0">
        <Link href="/revenue" aria-label={agencyName} onClick={onNavigate}><TwinWordmark inverse agencyName={agencyName} /></Link>
        <p className="moxy-sidebar-access">{agencyName} · {readOnly ? "Read only" : canManage ? "Owner" : "Creator management"}</p>
      </div>
      {headerAction}
    </div>
    {agencyDashboardPath("/agency/creator-invites", agencyName, canManage) && <div className="moxy-sidebar-action">
      <Link href="/agency/creator-invites" onClick={onNavigate} aria-current={isGlobalActive("/agency/creator-invites") ? "page" : undefined} className="moxy-invite-button"><Icon d={PATHS.Plus} className="h-5 w-5" />Invite creator</Link>
    </div>}
    <nav aria-label="Main navigation" className="moxy-sidebar-nav">
      <section className="moxy-sidebar-group" aria-label="Workspace">
        <h2 className="moxy-sidebar-heading">Workspace</h2>
        {MOXY_LINKS.slice(0, 3).filter(availableLink).map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}
      </section>
      <section className="moxy-sidebar-group" aria-label="Creator tools">
        <h2 className="moxy-sidebar-heading">Creator tools</h2>
        {MOXY_LINKS.slice(3, 7).filter(availableLink).map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}
      </section>
    </nav>
    <nav aria-label="Utilities" className="moxy-sidebar-utilities"><div>
      {MOXY_LINKS.slice(7).filter(availableLink).map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}
    </div></nav>
  </>;

  return <>
    {isTether ? <style dangerouslySetInnerHTML={{__html:TETHER_SIDEBAR_THEME}} /> : null}
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/14 px-5"><Link href={isCreator ? "/creator" : isAdmin && !fullNavigation ? "/dashboard" : "/revenue"} className="min-w-0" aria-label={agencyName || "Twin Technologies"} onClick={onNavigate}><TwinWordmark inverse agencyName={agencyName === "Twin" ? undefined : agencyName} /></Link>{headerAction}</div>
    {usesBrandedCore ? <div className="shrink-0 px-4 pb-2 pt-4" data-creator-core={isCreator ? "hero" : undefined}><div className="flex items-center gap-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-3 py-3"><IntelligenceCoreIcon size={64} /><div className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-5 text-[#38bdf8]">AI Intelligence Core</span></div></div></div> : isAgency ? <div className="px-7 py-4 text-sm text-white/75">{agencyName} · {readOnly ? "Read only" : isMoxy(agencyName) && canManage ? "Owner" : "Creator management"}</div> : isAdmin && !fullNavigation ? null : <div className="shrink-0 px-4 pb-3 pt-4"><Link href="/clones/new" onClick={onNavigate} className="sidebar-create-button flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"><Icon d={PATHS.Plus} className="h-4 w-4" />Create new creator</Link></div>}
    <nav aria-label={isCreator ? "Creator navigation" : "Main navigation"} className="flex flex-1 flex-col overflow-y-auto px-4 py-2">{isAdmin && !fullNavigation ? adminNavigation : <div className="space-y-1">{primaryLinks.filter(availableLink).map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}{!isAdmin && !isCreator && !usesBrandedCore && !readOnly && !isMoxy(agencyName) && <><div className="mb-2 mt-3 border-t border-white/14 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">CRM</div>{CRM_LINKS.map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}</>}{isCreator || isPreview ? null : isAdmin ? <div className="mt-3 space-y-1 border-t border-white/14 pt-2">{TWIN_ADMIN_REMAINDER.map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div> : moxyNavigation ? null : expandedMoxyNavigation ? <div className="mt-3 space-y-1 border-t border-white/14 pt-2">{MORE_LINKS.filter(link => link.kind !== "route" || !["/jarvis", "/agency-admin", "/agency-admin/creator-codes"].includes(link.href)).filter(link => link.kind !== "tab" || link.tab !== "identity").filter(availableLink).map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div> : usesBrandedCore ? <div className="mt-3 border-t border-white/14 pt-3"><h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">More</h2><div className="space-y-1">{MORE_LINKS.filter(link => link.kind === "tab" || agencyDashboardPath(link.href, agencyName, canManage)).map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div></div> : <div className="mt-3 border-t border-white/14 pt-2"><button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/62 transition hover:bg-white/10 hover:text-white"><Icon d={PATHS.More} className="h-[18px] w-[18px] text-white/50" /><span className="flex-1">More</span><svg className={(moreOpen ? "rotate-180 " : "") + "h-4 w-4 transition-transform"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>{moreOpen ? <div className="mt-1 space-y-1">{MORE_LINKS.filter(link => !isAgency || link.kind === "tab" || agencyDashboardPath(link.href, agencyName, canManage)).map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div> : null}</div>}</div>}{isAdmin && fullNavigation ? <button type="button" onClick={() => setNavigationLayout(false)} className="mt-3 border-t border-white/14 px-3 py-3 text-left text-xs text-white/60 hover:text-white">Use grouped navigation</button> : null}{showAssistant && !isAgency && !isCreator ? <div className="mt-auto pt-4 [@media(max-height:850px)]:pt-2"><TwinAssistant /></div> : null}</nav>
  </>;
}

export default function Sidebar({ clones: _clones, activeCloneId }: { clones: CloneLite[]; activeCloneId: string | null }) {
  return <aside className="dashboard-sidebar sticky top-0 hidden h-screen w-72 shrink-0 flex-col lg:flex"><SidebarContent activeCloneId={activeCloneId} /></aside>;
}


