"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Users, MessageCircle } from "lucide-react";
import { useDashboardAccess } from "./DashboardAccessProvider";
import MobileMenu from "./MobileMenu";
import { usesCompactWorkspace } from "@/lib/compact-workspace";
import { agencyDashboardPath } from "@/lib/agency-policy";

export default function WorkspaceMobileNav({ activeCloneId }: { activeCloneId: string | null }) {
  const { audience, agencyName, canManage } = useDashboardAccess();
  const pathname = usePathname();
  if (!usesCompactWorkspace(audience, agencyName)) return null;
  const admin = audience === "admin";

  const links = [
    { label: "Overview", href: "/revenue", Icon: House, active: pathname === "/revenue" },
    { label: "Creators", href: "/clones", Icon: Users, active: pathname === "/clones" || pathname.startsWith("/clones/") },
    { label: "Messages", href: "/users", Icon: MessageCircle, active: pathname === "/users" },
  ].filter(link => admin || agencyDashboardPath(link.href, agencyName, canManage));
  return <nav className="compact-mobile-nav" aria-label="Quick navigation">
    {links.map(({ label, href, Icon, active }) => <Link key={label} href={href} aria-current={active ? "page" : undefined}><Icon size={21} aria-hidden="true" /><span>{label}</span></Link>)}
    <MobileMenu activeCloneId={activeCloneId} variant="bottom" />
  </nav>;
}
