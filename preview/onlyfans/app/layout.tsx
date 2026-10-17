// The preview's own root layout.
//
// It exists precisely so the preview does NOT mount the dashboard's root layout
// in app/layout.tsx, which resolves real identity, fleet, scope and financial
// helpers. What it mounts instead is the dashboard's **shell** — the real
// Sidebar, MobileMenu, TopBar and MainShell — with fixture creators and a
// fixture access context, so the OnlyFans channel is reviewed inside the actual
// product rather than beside a copy of it.
//
// The data-free boundary is unchanged: no session, no Supabase client, no
// environment file and no server action is reachable from here. The clone
// switcher is locked because writing the scope cookie is the dashboard's job,
// and the assistant dock is off because it talks to model endpoints.

import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Inter_Tight, Space_Grotesk } from "next/font/google";
import { cn } from "../../../lib/utils";
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

// Same four font roles as app/layout.tsx, so text metrics match the dashboard
// pixel for pixel.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const plexMono = Inter({ subsets: ["latin"], variable: "--font-mono" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-display" });
const fontClass = cn(
  "font-sans",
  inter.variable,
  plexMono.variable,
  spaceGrotesk.variable,
  interTight.variable,
);

export const metadata: Metadata = {
  title: "Twin OnlyFans preview (OF-D0)",
  description: "Fixture-based preview of the Twin OnlyFans channel.",
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
