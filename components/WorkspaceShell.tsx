"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isBriannaWorkspaceRoute, isDashboardWorkspaceRoute } from "@/lib/dashboard-creator-route";

export default function WorkspaceShell({ activeCloneId, children }: { activeCloneId: string | null; children: React.ReactNode }) {
  const { audience, agencyName } = useDashboardAccess();
  const pathname = usePathname();
  const query = useSearchParams();
  const studio = audience !== "creator" && isDashboardWorkspaceRoute(pathname);
  const unbranded = audience === "admin" && isBriannaWorkspaceRoute(pathname, query.get("creator"), activeCloneId);
  return <div className="flex h-screen" data-studio-workspace={studio || undefined} data-workspace-brand={agencyName?.trim().toLowerCase() || "twin"} data-workspace-unbranded={unbranded || undefined}>{children}</div>;
}

