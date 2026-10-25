"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDashboardAccess } from "./DashboardAccessProvider";
import Sidebar from "./onlyfans-shell/Sidebar";
import TopBar from "./onlyfans-shell/TopBar";
import MobileMenu from "./onlyfans-shell/MobileMenu";
import WorkspaceShell from "./onlyfans-shell/WorkspaceShell";
import MainShell from "./onlyfans-shell/MainShell";
import TwinWordmark from "./TwinWordmark";
import Link from "./NavigationLink";
import type { DashboardChannel } from "@/lib/channel-nav";
export default function FlirtOnlyFansShell({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const pathname = usePathname();
  const { agencyName } = useDashboardAccess();
  if (!pathname.startsWith("/onlyfans")) return fallback;
  const channels: DashboardChannel[] = ["all", "onlyfans"];
  return <WorkspaceShell activeCloneId={null} creators={[]}>
    <Sidebar clones={[]} activeCloneId={null} channels={channels}/>
    <div className="workspace-content flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <Link href="/revenue"><TwinWordmark agencyName={agencyName}/></Link><MobileMenu activeCloneId={null} channels={channels}/>
      </header>
      <TopBar clones={[]} activeCloneId={null} allTimeStars={0} creatorName="All creators" lockCreatorScope channels={channels}/>
      <MainShell showAssistant={false}>{children}</MainShell>
    </div>
  </WorkspaceShell>;
}
