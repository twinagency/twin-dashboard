"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isBriannaWorkspaceRoute } from "@/lib/dashboard-creator-route";

export default function WorkspaceShell({ activeCloneId, children }: { activeCloneId: string | null; children: React.ReactNode }) {
  const { audience } = useDashboardAccess();
  const pathname = usePathname();
  const query = useSearchParams();
  const studio = audience === "admin" && isBriannaWorkspaceRoute(pathname, query.get("creator"), activeCloneId);
  useEffect(() => {
    if (!studio) return;
    const previousTitle = document.title;
    document.title = "Creator workspace";
    return () => { document.title = previousTitle; };
  }, [studio, pathname]);
  return <div className="flex h-screen" data-studio-workspace={studio || undefined}>{children}</div>;
}
