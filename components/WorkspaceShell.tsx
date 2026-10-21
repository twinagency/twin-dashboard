"use client";
import { usesCompactWorkspace } from "@/lib/compact-workspace";
import { usePathname } from "next/navigation";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isDashboardWorkspaceRoute } from "@/lib/dashboard-creator-route";
export default function WorkspaceShell({ children }: { children: React.ReactNode; activeCloneId?: string | null }) {
  const { audience, agencyName } = useDashboardAccess();
  const studio = audience !== "creator" && isDashboardWorkspaceRoute(usePathname());
  return <div className="flex h-screen" data-compact-workspace={usesCompactWorkspace(audience, agencyName) || undefined} data-studio-workspace={studio || undefined} data-workspace-brand={agencyName?.trim().toLowerCase() || "flirt"}>{children}</div>;
}
