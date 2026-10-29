"use client";

import Link from "@/components/NavigationLink";
import { usePathname, useSearchParams } from "next/navigation";
import { House, Users, MessageCircle, ChartNoAxesCombined, Images } from "lucide-react";
import { useDashboardAccess } from "./DashboardAccessProvider";
import MobileMenu from "./MobileMenu";
import { usesCompactWorkspace } from "@/lib/compact-workspace";
import { agencyDashboardPath, isPartnerPreview } from "@/lib/agency-policy";
import type { DashboardChannel } from "@/lib/channel-nav";
import { parseWorkspaceScope, workspaceHref } from "@/lib/onlyfans-preview/scope";

export default function WorkspaceMobileNav({ activeCloneId, channels }: { activeCloneId: string | null; channels: DashboardChannel[] }) {
  const { audience, agencyName, canManage } = useDashboardAccess();
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname.startsWith("/onlyfans/") && audience !== "creator") {
    // The four everyday pages; Earnings, Campaigns and Settings stay in More.
    // Links carry the selected creator and account so a tab never resets them,
    // except Today, which is the every-creator view.
    const scope = parseWorkspaceScope(params);
    const items = [
      { label: "Today", href: "/onlyfans/overview", Icon: House },
      { label: "Inbox", href: "/onlyfans/inbox", Icon: MessageCircle },
      { label: "Content", href: "/onlyfans/content", Icon: Images },
      { label: "Creators", href: "/onlyfans/accounts", Icon: Users },
    ];
    return <nav className="of-mobile-nav" aria-label="OnlyFans quick navigation">{items.map(({ label, href, Icon }) => <Link key={href} href={href === "/onlyfans/overview" ? href : workspaceHref(href, scope)} aria-current={pathname === href || pathname.startsWith(href + "/") ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{label}</span></Link>)}<MobileMenu activeCloneId={activeCloneId} channels={channels} variant="bottom" /></nav>;
  }
  if (!usesCompactWorkspace(audience, agencyName) || isPartnerPreview(agencyName)) return null;
  const admin = audience === "admin";
  const earnings = pathname === "/revenue";
  const links = [
    { label: "Overview", href: admin ? "/dashboard" : "/revenue", Icon: House, active: admin ? pathname === "/dashboard" && !earnings : pathname === "/revenue" },
    { label: "Creators", href: "/clones", Icon: Users, active: pathname === "/clones" || pathname.startsWith("/clones/") },
    { label: "Messages", href: "/users", Icon: MessageCircle, active: pathname === "/users" },
    ...(admin && channels.includes("telegram") ? [{ label: "Earnings", href: "/revenue", Icon: ChartNoAxesCombined, active: earnings }] : []),
  ].filter(link => admin || agencyDashboardPath(link.href, agencyName, canManage));
  return <nav className="compact-mobile-nav" aria-label="Quick navigation">
    {links.map(({ label, href, Icon, active }) => <Link key={label} href={href} aria-current={active ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{label}</span></Link>)}
    <MobileMenu activeCloneId={activeCloneId} channels={channels} variant="bottom" />
  </nav>;
}

