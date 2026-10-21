"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { House, Users, MessageCircle, ChartNoAxesCombined } from "lucide-react";
import { useDashboardAccess } from "./DashboardAccessProvider";
import MobileMenu from "./MobileMenu";
import { usesCompactWorkspace } from "@/lib/compact-workspace";
import { agencyDashboardPath, isPartnerPreview } from "@/lib/agency-policy";
import type { DashboardChannel } from "@/lib/channel-nav";

export default function WorkspaceMobileNav({ activeCloneId, channels }: { activeCloneId: string | null; channels: DashboardChannel[] }) {
  const { audience, agencyName, canManage } = useDashboardAccess();
  const pathname = usePathname();
  const query = useSearchParams();
  if (!usesCompactWorkspace(audience, agencyName) || isPartnerPreview(agencyName)) return null;
  const admin = audience === "admin";
  const earnings = pathname === "/dashboard" && query.get("workspace") === "telegram";
  const links = [
    { label: "Overview", href: admin ? "/dashboard" : "/revenue", Icon: House, active: admin ? pathname === "/dashboard" && !earnings : pathname === "/revenue" },
    { label: "Creators", href: "/clones", Icon: Users, active: pathname === "/clones" || pathname.startsWith("/clones/") },
    { label: "Messages", href: "/users", Icon: MessageCircle, active: pathname === "/users" },
    ...(admin && channels.includes("telegram") ? [{ label: "Earnings", href: "/dashboard?workspace=telegram", Icon: ChartNoAxesCombined, active: earnings }] : []),
  ].filter(link => admin || agencyDashboardPath(link.href, agencyName, canManage));
  return <nav className="compact-mobile-nav" aria-label="Quick navigation">
    {links.map(({ label, href, Icon, active }) => <Link key={label} href={href} aria-current={active ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{label}</span></Link>)}
    <MobileMenu activeCloneId={activeCloneId} channels={channels} variant="bottom" />
  </nav>;
}
