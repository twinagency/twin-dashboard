"use client";

import Link from "@/components/NavigationLink";
import CreatorStudioShell from "./CreatorStudioShell";
import type { CreatorStudioBrand, CreatorStudioStatus } from "@/lib/creator-studio-model";
import type { ReactNode } from "react";
import BlurProvider from "./BlurProvider";
import CurrencyProvider from "./CurrencyProvider";
import DashboardAccessProvider from "./DashboardAccessProvider";
import MainShell from "./MainShell";
import MobileMenu from "./MobileMenu";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TwinWordmark from "./TwinWordmark";
import CreatorContentAccess from "./CreatorContentAccess";
import CreatorCloneSetupBanner from "./CreatorCloneSetupBanner";
import { isMoxy } from "@/lib/agency-brand";

type CreatorClone = { id: string; name: string; color: string; photoUrl?: string };

/** Brand-specific presentation inside the existing verified creator permission boundary.
 * Other agency workspaces retain their shared operator shell. */
export default function CreatorWorkspaceShell({
  studioBrand,
  studioStatus,
  contentHref = "/creator/onboarding?step=content",
  agencyName,
  creatorName,
  clones,
  activeCloneId,
  connected,
  onboardingFinished = true,
  connectionPage = false,
  homePage = false,
  allTimeStars,
  usdPerStar,
  children,
}: {
  studioBrand?: CreatorStudioBrand | null;
  studioStatus?: CreatorStudioStatus | null;
  contentHref?: string;
  agencyName: string;
  creatorName: string;
  clones: CreatorClone[];
  activeCloneId: string | null;
  connected: boolean;
  onboardingFinished?: boolean;
  connectionPage?: boolean;
  homePage?: boolean;
  allTimeStars: number;
  usdPerStar?: number;
  children: ReactNode;
}) {
  if (studioBrand && studioStatus) return (
    <DashboardAccessProvider agencyName={agencyName} audience="creator">
      <CurrencyProvider usdPerStar={usdPerStar}><BlurProvider>
        <CreatorStudioShell brand={studioBrand} creatorName={creatorName} photoUrl={clones.find(clone => clone.id === activeCloneId)?.photoUrl} status={studioStatus} contentHref={contentHref}>{children}</CreatorStudioShell>
      </BlurProvider></CurrencyProvider>
    </DashboardAccessProvider>
  );
  const cloneBeingCreated = !connected && onboardingFinished && isMoxy(agencyName);
  const wordmarkAgency = agencyName === "Twin" ? undefined : agencyName;
  return (
    <DashboardAccessProvider agencyName={agencyName} audience="creator">
      <CurrencyProvider usdPerStar={usdPerStar}>
        <BlurProvider>
          <div className="flex h-screen" data-creator-workspace-shell="true">
            <Sidebar clones={clones} activeCloneId={activeCloneId} />
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
              <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
                <Link href="/creator" aria-label={agencyName || "Twin Technologies"}>
                  <TwinWordmark inverse agencyName={wordmarkAgency} />
                </Link>
                <div className="flex items-center gap-1">
                  <form action="/creator-auth/logout" method="post">
                    <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10">
                      Sign out
                    </button>
                  </form>
                  <MobileMenu activeCloneId={activeCloneId} />
                </div>
              </header>
              <TopBar
                clones={clones}
                activeCloneId={activeCloneId}
                allTimeStars={allTimeStars}
                creatorName={creatorName}
              />
              <MainShell>
                {cloneBeingCreated && <CreatorCloneSetupBanner brand="moxy" />}
                {!connectionPage && !homePage && <CreatorContentAccess />}
                {!connectionPage && !connected && !cloneBeingCreated && (
                  <div role="status" className="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
                    {onboardingFinished
                      ? "Your onboarding has been submitted. Live earnings and your Pay Per View catalogue will become available when your AI creator profile is connected."
                      : <>You haven&apos;t finished onboarding yet. <a href="/creator/onboarding" className="font-semibold text-ink underline underline-offset-4">Finish onboarding here</a></>}
                  </div>
                )}
                {children}
              </MainShell>
            </div>
          </div>
        </BlurProvider>
      </CurrencyProvider>
    </DashboardAccessProvider>
  );
}

