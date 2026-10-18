// Isolated synthetic integration shell; actual read routes and session gates are imported unchanged.
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import DashboardAccessProvider from "@/components/DashboardAccessProvider";
import CurrencyProvider from "@/components/CurrencyProvider";
import BlurProvider from "@/components/BlurProvider";
import Sidebar from "@/components/Sidebar";
import MobileMenu from "@/components/MobileMenu";
import TopBar from "@/components/TopBar";
import MainShell from "@/components/MainShell";
import TwinWordmark from "@/components/TwinWordmark";
import { PREVIEW_CLONES } from "@/lib/onlyfans-preview/workspace";
import type { DashboardChannel } from "@/lib/channel-nav";

// The preview is the one place that must show all three channels: demonstrating
// the switch is its job. The dashboard passes the server's own answer here
// instead, and the creator shell passes nothing at all.
const PREVIEW_CHANNELS: DashboardChannel[] = ["all", "telegram", "onlyfans"];

// Local font fallback keeps this harness independent of remote font services.
const fontClass = "font-sans";

export const metadata: Metadata = {
  title: "Twin OnlyFans synthetic integration",
  description: "Authenticated reads from a disposable synthetic PostgreSQL backend.",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  const activeCloneId = PREVIEW_CLONES[0]?.id ?? null;

  return (
    <html lang="en" className={fontClass} style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-screen bg-bg">
        <DashboardAccessProvider canManage>
          <CurrencyProvider>
            <BlurProvider>
              <div className="flex h-screen">
                <Sidebar clones={PREVIEW_CLONES} activeCloneId={activeCloneId} />
                <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
                  <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
                    <Link href="/overview" aria-label="Twin Technologies">
                      <TwinWordmark inverse />
                    </Link>
                    <div className="flex items-center gap-1">
                      <MobileMenu activeCloneId={activeCloneId} channels={PREVIEW_CHANNELS} />
                    </div>
                  </header>
                  <TopBar
                    clones={PREVIEW_CLONES}
                    activeCloneId={activeCloneId}
                    allTimeStars={0}
                    lockCreatorScope
                    channels={PREVIEW_CHANNELS}
                    // The preview must not be able to clear a real session, so
                    // its sign-out is inert and labelled. `TopBar` carries no
                    // import of the login action at all.
                    signOut="simulated"
                  />
                  <MainShell showAssistant={false}>
                    <div className="mb-3 text-xs text-ink-muted">Synthetic integration · no real accounts or sending</div>
                    {children}
                  </MainShell>
                </div>
              </div>
            </BlurProvider>
          </CurrencyProvider>
        </DashboardAccessProvider>
      </body>
    </html>
  );
}
