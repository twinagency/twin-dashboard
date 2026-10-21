"use client";
import { isDashboardWorkspaceRoute, isCreatorStudioRoute } from "@/lib/dashboard-creator-route";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { agencyDashboardPath } from "@/lib/agency-policy";
import { isMoxy } from "@/lib/agency-brand";
import { JESS_KATE_PORTAL, TETHER_PORTAL } from "@/lib/partner-portals";
import { CREATOR_DASHBOARD_NAV } from "@/lib/creator-dashboard-policy";

// Left sidebar app shell (desktop). "Create new clone" is always the first
// thing in it, then a focused executive workspace followed by CRM. The
// technical tools sit behind More so the primary operating views are visible
// without scrolling. Each page type appears ONCE, scoped
// by the clone switcher in the header (components/CloneSwitcher.tsx, "All
// clones" by default). Picking/managing a clone lives in the header switcher
// popup + the /clones page, not here, no duplicate clone list in the
// sidebar. Settings/AI/Feedback/Changelog used to live in a separate footer
// section; they're folded into the one list now, ordered by importance.
//
// Mobile keeps the existing hamburger (MobileMenu), this component only
// renders at lg+ (see layout.tsx).

import Link from "@/components/NavigationLink";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  Dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/>',
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

const NAV_LINKS: NavLink[] = [
  { kind: "route", label: "Earnings", href: "/revenue", icon: "EarningsCombo", color: "good" },
  { kind: "route", label: "Creators", href: "/clones", icon: "Clones", color: "blue" },
  { kind: "route", label: "Fans", href: "/users", icon: "FansCombo", color: "purple" },
  { kind: "tab", label: "PPVs", tab: "ppvs", icon: "Media", color: "red" },
  { kind: "route", label: "Storage", href: "/storage", icon: "Database", color: "blue" },
  { kind: "route", label: "Business", href: "/business", icon: "Bot", color: "purple", gateOnClone: true },
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

// FLIRT operators use the requested fixed order on desktop and mobile.
const FLIRT_OWNER_LINKS: NavLink[] = [
  { kind: "route", label: "Overview", href: "/revenue", icon: "Dashboard", color: "good" },
  { kind: "route", label: "Creators", href: "/clones", icon: "Clones", color: "blue" },
  { kind: "route", label: "Live Telegram", href: "/users", icon: "FansCombo", color: "purple" },
  { kind: "tab", label: "Content", tab: "ppvs", icon: "Media", color: "red" },
  { kind: "route", label: "Post Stories", href: "/business", icon: "Bot", color: "purple", gateOnClone: true },
  { kind: "route", label: "Accounts", href: "/agency/creators", icon: "Users", color: "gray" },
  { kind: "route", label: "Invite Creator", href: "/agency/creator-invites", icon: "Users", color: "gray" },
  { kind: "tab", label: "Edit", tab: "identity", icon: "Dials", color: "blue" },
  { kind: "route", label: "Flows", href: "/flows", icon: "Flows", color: "pink", gateOnClone: true },
  { kind: "route", label: "Logs", href: "/logs", icon: "Logs", color: "neutral" },
  { kind: "route", label: "Sequences", href: "/sequences", icon: "Media", color: "red", gateOnClone: true },
  { kind: "route", label: "Info", href: "/info", icon: "Info", color: "neutral" },
];

const CRM_LINKS: NavLink[] = [
  { kind: "route", label: "Inbox", href: "/crm/inbox", icon: "Inbox", color: "purple" },
  { kind: "route", label: "Fan CRM", href: "/crm/fans", icon: "Users", color: "blue" },
  { kind: "route", label: "Campaigns", href: "/crm/campaigns", icon: "Flows", color: "pink" },
  { kind: "route", label: "Team", href: "/crm/team", icon: "Users", color: "orange" },
  { kind: "route", label: "Platforms", href: "/crm/platforms", icon: "Database", color: "good" },
];

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
  const {readOnly,isAgency,isCreator,canManage,agencyName}=useDashboardAccess();
  const isFlirtOwner = isAgency && agencyName?.trim().toLowerCase() === "flirt";
  const showUnavailable = isAgency && readOnly && isMoxy(agencyName);
  const isJessKate = isAgency && agencyName === JESS_KATE_PORTAL.name;
  const isTether = agencyName === TETHER_PORTAL.name;
  // Creator workspaces use this exact core block as well. The audience only
  // narrows navigation and authority; it does not fork the Tether design.
  const usesBrandedCore = isCreator || isJessKate || isTether;
  const primaryLinks = isCreator
    ? CREATOR_LINKS.filter(link => agencyName?.trim().toLowerCase() !== "flirt" || link.kind !== "route" || link.href !== "/creator/ppvs")
    : isFlirtOwner ? FLIRT_OWNER_LINKS : NAV_LINKS.flatMap(link => showUnavailable && link.kind === "tab" && link.tab === "ppvs" ? [link, ...MORE_LINKS.filter(item => item.kind === "tab" && item.tab === "identity")] : [link]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeTab = searchParams.get("tab") ?? "config";
  // /creator is the creator Earnings page, not a parent navigation section.
  // Exact matching prevents Earnings staying highlighted on all five child
  // routes at the same time as their own item.
  const isGlobalActive = (href: string) => (pathname === href || (!isCreator && href !== "/" && pathname.startsWith(href + "/"))) && !(href === "/clones" && isCreatorStudioRoute(pathname));
  const onConfigurePage = isCreatorStudioRoute(pathname);
  const pickClone = () => { onNavigate?.(); window.setTimeout(() => openCloneSwitcher(), 0); };

  const navLabel = (link: NavLink, colors: (typeof LINK_COLOR_CLASSES)[LinkColor]) => {
    if (link.icon === "FansCombo") return <><Icon d={PATHS.Users} className={"h-[18px] w-[18px] " + colors.icon} /><span className="flex-1">{link.label}</span><Icon d={PATHS.Messages} className="h-4 w-4 text-current opacity-45" /></>;
    if (link.icon === "EarningsCombo") return <><Icon d={PATHS.Dollar} className={"h-[18px] w-[18px] " + colors.icon} /><span className="flex-1">{link.label}</span></>;
    return <><Icon d={PATHS[link.icon]} className={"h-[18px] w-[18px] " + colors.icon} />{link.label}</>;
  };
  const linkKey = (link: NavLink) => link.kind === "route" ? link.href : link.tab;
  const renderLink = (link: NavLink) => {
    const colors = LINK_COLOR_CLASSES[link.color];
    const rowClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition";
    if (isAgency && link.kind === "route" && !agencyDashboardPath(link.href, agencyName, canManage)) {
      if (!showUnavailable) return null;
      return <div aria-disabled="true" className={rowClass + " cursor-not-allowed text-white/45"}><Icon d={PATHS[link.icon]} className="h-[18px] w-[18px] text-white/35" /><span className="flex-1">{link.label}</span><span className="whitespace-nowrap rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-medium text-white/60">Not available</span></div>;
    }
    if (link.kind === "tab") {
      const active = onConfigurePage && (isFlirtOwner && link.tab === "identity" ? activeTab !== "ppvs" : activeTab === link.tab);
      if (!activeCloneId) return <button type="button" onClick={pickClone} title="Pick a creator first" className={rowClass + " " + colors.idle}>{navLabel(link, colors)}</button>;
      return <Link href={`/clones/${activeCloneId}?tab=${link.tab}`} onClick={onNavigate} aria-current={active ? "page" : undefined} className={rowClass + " " + (active ? colors.active : colors.idle)}>{navLabel(link, colors)}</Link>;
    }
    if (link.gateOnClone && !activeCloneId) return <button type="button" onClick={pickClone} title="Pick a creator first" className={rowClass + " " + colors.idle}>{navLabel(link, colors)}</button>;
    return <Link href={link.href} onClick={onNavigate} aria-current={isGlobalActive(link.href) && !(link.href === "/clones" && onConfigurePage) ? "page" : undefined} className={rowClass + " " + (isGlobalActive(link.href) ? colors.active : colors.idle)}>{navLabel(link, colors)}</Link>;
  };

  return <>
    {isTether ? <style dangerouslySetInnerHTML={{__html:TETHER_SIDEBAR_THEME}} /> : null}
    <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/14 px-5"><Link href={isCreator ? "/creator" : "/revenue"} className="min-w-0" aria-label={agencyName || "FLIRT"} onClick={onNavigate}><TwinWordmark inverse agencyName={agencyName === "Twin" ? undefined : agencyName} /></Link>{headerAction}</div>
    {showUnavailable || usesBrandedCore ? <div className="shrink-0 px-4 pb-2 pt-4" data-creator-core={isCreator ? "hero" : undefined}><div aria-disabled={showUnavailable || undefined} className={"flex " + (showUnavailable ? "cursor-not-allowed " : "") + "items-center gap-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-3 py-3"}><IntelligenceCoreIcon size={64} /><div className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-5 text-[#38bdf8]">AI Intelligence Core</span>{showUnavailable && <span className="mt-1.5 inline-block rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-medium text-white/60">Not available</span>}</div></div></div> : isAgency ? <div className="px-7 py-4 text-sm text-white/75">{isFlirtOwner ? "Flirt Creator Management" : <>{agencyName} · {readOnly ? "Read only" : "Creator management"}</>}</div> : <div className="shrink-0 px-4 pb-3 pt-4"><Link href="/clones/new" onClick={onNavigate} className="sidebar-create-button flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"><Icon d={PATHS.Plus} className="h-4 w-4" />Create new creator</Link></div>}
    <nav aria-label={isCreator ? "Creator navigation" : "Main navigation"} className="flex flex-1 flex-col overflow-y-auto px-4 py-2"><div className="space-y-1">{primaryLinks.map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}{!isCreator && !isFlirtOwner && !usesBrandedCore && (!readOnly || showUnavailable) && <><div className="mb-2 mt-3 border-t border-white/14 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">CRM</div>{CRM_LINKS.map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}</>}{isCreator || isFlirtOwner ? null : showUnavailable ? <div className="mt-3 space-y-1 border-t border-white/14 pt-2">{MORE_LINKS.filter(link => link.kind !== "route" || !["/jarvis", "/agency-admin", "/agency-admin/creator-codes"].includes(link.href)).filter(link => link.kind !== "tab" || link.tab !== "identity").map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div> : usesBrandedCore ? <div className="mt-3 border-t border-white/14 pt-3"><h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">More</h2><div className="space-y-1">{MORE_LINKS.filter(link => link.kind === "tab" || agencyDashboardPath(link.href, agencyName, canManage)).map(link => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div></div> : <div className="mt-3 border-t border-white/14 pt-2"><button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/62 transition hover:bg-white/10 hover:text-white"><Icon d={PATHS.More} className="h-[18px] w-[18px] text-white/50" /><span className="flex-1">More</span><svg className={(moreOpen ? "rotate-180 " : "") + "h-4 w-4 transition-transform"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>{moreOpen ? <div className="mt-1 space-y-1">{MORE_LINKS.filter(link => !isAgency || showUnavailable || link.kind === "tab" || agencyDashboardPath(link.href, agencyName, canManage)).map((link) => <div key={linkKey(link)}>{renderLink(link)}</div>)}</div> : null}</div>}</div>{showAssistant && !isAgency && !isCreator ? <div className="mt-auto pt-4 [@media(max-height:850px)]:pt-2"><TwinAssistant /></div> : null}</nav>
  </>;
}

export default function Sidebar({ clones: _clones, activeCloneId }: { clones: CloneLite[]; activeCloneId: string | null }) {
  const { isCreator } = useDashboardAccess();
  const studio = !isCreator && isDashboardWorkspaceRoute(usePathname());
  return <aside data-studio-sidebar={studio || undefined} className="dashboard-sidebar sticky top-0 hidden h-screen w-72 shrink-0 flex-col lg:flex"><SidebarContent activeCloneId={activeCloneId} /></aside>;
}

