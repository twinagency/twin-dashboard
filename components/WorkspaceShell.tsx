"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { isBriannaWorkspaceRoute, isDashboardWorkspaceRoute } from "@/lib/dashboard-creator-route";

import { channelForPath } from "@/lib/channel-nav";
import creatorPlatformStyles from "./onlyfans-preview/OnlyFansStudio.module.css";

export default function WorkspaceShell({ activeCloneId, children }: { activeCloneId: string | null; children: React.ReactNode }) {
  const { audience, agencyName } = useDashboardAccess();
  const pathname = usePathname();
  const query = useSearchParams();
  const studio = audience !== "creator" && (isDashboardWorkspaceRoute(pathname) || channelForPath(pathname) === "onlyfans");
  const creatorPlatform = audience !== "creator" && channelForPath(pathname) === "onlyfans";
  const creatorBrand = agencyName?.trim().toLowerCase() === "moxy" ? "moxy" : agencyName?.trim().toLowerCase() === "flirt" ? "flirt" : "twin";
  const unbranded = audience === "admin" && isBriannaWorkspaceRoute(pathname, query.get("creator"), activeCloneId);
  return <div className={creatorPlatform ? creatorPlatformStyles.platform : "flex h-screen"} data-creator-platform={creatorPlatform || undefined} data-creator-studio={creatorPlatform ? creatorBrand : undefined} data-studio-workspace={studio || undefined} data-workspace-brand={agencyName?.trim().toLowerCase() || "twin"} data-workspace-unbranded={unbranded || undefined}>{children}</div>;
}
