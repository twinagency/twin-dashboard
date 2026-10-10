"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isBriannaWorkspaceRoute } from "@/lib/dashboard-creator-route";

export default function WorkspaceShell({ activeCloneId, children }: { activeCloneId: string | null; children: React.ReactNode }) {
  const { audience } = useDashboardAccess();
  const pathname = usePathname();
  const query = useSearchParams();
  const studio = audience === "admin" && isBriannaWorkspaceRoute(pathname, query.get("creator"), activeCloneId);
  return <div className="flex h-screen" data-studio-workspace={studio || undefined}>{children}</div>;
}
