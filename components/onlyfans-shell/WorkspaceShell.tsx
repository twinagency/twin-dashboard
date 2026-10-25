"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardAccess } from "@/components/DashboardAccessProvider";
import { isDashboardWorkspaceRoute } from "@/lib/dashboard-creator-route";

import { usesCompactWorkspace } from "@/lib/compact-workspace";
import { channelForPath } from "@/lib/channel-nav";
import { usesTwinAgencyRefresh } from "@/lib/twin-agency-refresh";
import workspaceStyles from "@/components/WorkspaceStudio.module.css";
import creatorPlatformStyles from "@/components/onlyfans-preview/OnlyFansStudio.module.css";
import { InboxIdentityProvider } from "@/components/onlyfans-preview/InboxIdentity";
import { OnlyFansPortraitProvider, type PortraitCreator } from "@/components/onlyfans-preview/CreatorPortrait";

export default function WorkspaceShell({ activeCloneId, children, creators = [] }: { activeCloneId: string | null; children: React.ReactNode; creators?: PortraitCreator[] }) {
  const { audience, agencyName } = useDashboardAccess();
  const pathname = usePathname();
  const query = useSearchParams();
  const operator = audience === "admin";
  const studio = operator || audience !== "creator" && (isDashboardWorkspaceRoute(pathname) || channelForPath(pathname) === "onlyfans");
  const creatorPlatform = audience !== "creator" && channelForPath(pathname) === "onlyfans";
  const creatorBrand = agencyName?.trim().toLowerCase() === "moxy" ? "moxy" : agencyName?.trim().toLowerCase() === "flirt" ? "flirt" : "twin";
  const unbranded = false;
  return <div className={operator || creatorPlatform ? `${workspaceStyles.workspace}${creatorPlatform ? ` ${creatorPlatformStyles.platform}` : ""}` : "flex h-screen"} data-twin-agency-refresh={usesTwinAgencyRefresh(audience, agencyName, pathname) || undefined} data-compact-workspace={usesCompactWorkspace(audience, agencyName) || undefined} data-workspace-theme={operator ? "dark" : undefined} data-of-inbox-shell={creatorPlatform && pathname === "/onlyfans/inbox" || undefined} data-onlyfans-ui={creatorPlatform || undefined} data-creator-platform={creatorPlatform || undefined} data-creator-studio={creatorPlatform ? creatorBrand : undefined} data-studio-workspace={studio || undefined} data-workspace-brand={agencyName?.trim().toLowerCase() || "twin"} data-workspace-unbranded={unbranded || undefined}>{creatorPlatform ? <OnlyFansPortraitProvider creators={creators}><InboxIdentityProvider>{children}</InboxIdentityProvider></OnlyFansPortraitProvider> : children}</div>;
}

