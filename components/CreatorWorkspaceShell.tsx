"use client";

import Link from "next/link";
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
import { OnboardingBanner } from "./FlirtOnboardingLinks";

type CreatorClone = { id: string; name: string; color: string; photoUrl?: string };

/**
 * Permission adapter for the shared dashboard shell.
 *
 * All visible structure below is the same Sidebar/MobileMenu/TopBar/MainShell
 * composition used by Tether operators in app/layout.tsx. Creator-specific
 * behaviour is supplied by the explicit provider audience: six direct routes,
 * a locked identity chip, creator logout, read-only operational controls and no
 * internal assistant. There is deliberately no second navigation or top bar.
 */
export default function CreatorWorkspaceShell({
  agencyName,
  creatorName,
  clones,
  activeCloneId,
  connected,
  onboardingEditable = false,
  onboardingFinished = true,
  allTimeStars,
  children,
}: {
  agencyName: string;
  creatorName: string;
  clones: CreatorClone[];
  activeCloneId: string | null;
  connected: boolean;
  onboardingEditable?: boolean;
  /** False while the creator has skipped onboarding without submitting. */
  onboardingFinished?: boolean;
  allTimeStars: number;
  children: ReactNode;
}) {
  const wordmarkAgency = agencyName === "Twin" ? undefined : agencyName;
  return (
    <DashboardAccessProvider agencyName={agencyName} audience="creator">
      <CurrencyProvider>
        <BlurProvider>
          <div className="flex h-screen" data-creator-workspace-shell="true">
            <Sidebar clones={clones} activeCloneId={activeCloneId} />
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
              <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
                <Link href="/creator" aria-label={agencyName || "FLIRT"}>
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
                <CreatorContentAccess />
                {onboardingEditable && <OnboardingBanner finished={onboardingFinished} />}
                {!connected && (
                  <div role="status" className="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
                    Live earnings and your Pay Per View catalogue will become available when your AI creator profile is connected.
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

