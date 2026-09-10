import { isMarketingPath } from "@/lib/marketing-routing";
import { isTwinLoginPath } from "@/lib/login-routing";
import { isCreatorPath, isCreatorAuthPath, isCreatorPublicPath } from "@/lib/creator-routing";
import { getCreatorDashboardIdentity } from "@/lib/creator-dashboard-access";
import { agencyCanManage } from "@/lib/agency-management-policy";
import DashboardAccessProvider from "@/components/DashboardAccessProvider";
import { getDashboardAccess } from "@/lib/dashboard-access";
import "./globals.css";
import "./jess-kate-theme.css";
import "./creator-dashboard.css";
import { JESS_KATE_PORTAL } from "@/lib/partner-portals";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import CurrencyProvider from "@/components/CurrencyProvider";
import BlurProvider from "@/components/BlurProvider";
import Sidebar from "@/components/Sidebar";
import MobileMenu from "@/components/MobileMenu";
import TopBar from "@/components/TopBar";
import MainShell from "@/components/MainShell";
import TwinWordmark from "@/components/TwinWordmark";
import TwinUpdatePopup from "@/components/TwinVersionBadge";
import { getCachedTwinVersion, getFleetClones, getHeaderAllTimeStars } from "@/lib/query-cache";
import { isAuthed } from "@/lib/auth";
import { isAgencyPath } from "@/lib/agency-policy";
import { isLynq, isMoxy, pathAgencyName } from "@/lib/agency-brand";
import { getCloneScope } from "@/lib/clone-scope";
import { Inter, Inter_Tight, Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
// Keep all money figures in Inter with tabular numbers, not a slashed-zero coding font.
const plexMono = Inter({subsets:['latin'],variable:'--font-mono'});
const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-heading'});
const interTight = Inter_Tight({subsets:['latin'],variable:'--font-display'});
const fontClass = cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable);

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname");
  if (pathname && (isCreatorPath(pathname) || isCreatorAuthPath(pathname))) return {
    title: "Creator dashboard", description: "Your creator earnings and profile", robots: { index: false, follow: false },
  };
  if (isMarketingPath(pathname)) return {
    title: "Twin Agency", description: "Your audience. Your AI twin.", robots: { index: false, follow: false },
    icons: { icon: { url: "/icon.png", type: "image/png" } },
  };
  const agencyName = pathname && isAgencyPath(pathname)
    ? pathAgencyName(pathname)
    : isTwinLoginPath(pathname) ? undefined : (await getDashboardAccess())?.name;
  return agencyName ? {
    title: `${agencyName} Dashboard`, description: `${agencyName} creator dashboard`,
    icons: { icon: { url: isMoxy(agencyName) ? "/moxy/icon.svg" : "/agency/icon.svg", type: "image/svg+xml" } },
  } : {
    title: "Twin Console", description: "Intelligence infrastructure operations console",
    icons: { icon: { url: "/icon.png", type: "image/png" } },
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (isMarketingPath(pathname)) return <html lang="en" className={fontClass}><body>{children}</body></html>;
  // Creator routes own their shell. Do not fetch the fleet or render an agency
  // sidebar here, even when an operator cookie also exists in this browser.
  if (pathname && (isCreatorPath(pathname) || isCreatorAuthPath(pathname))) {
    const identity = !isCreatorPublicPath(pathname) && !isCreatorAuthPath(pathname)
      ? await getCreatorDashboardIdentity().catch(() => null) : null;
    return <html lang="en" className={fontClass} data-creator-brand={identity?.brandSlug} data-brand-theme={identity?.name === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined} style={{ colorScheme: "light" }} suppressHydrationWarning><body className="min-h-screen bg-bg"><script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("blurMedia")==="true")document.documentElement.classList.add("blur-media")}catch(e){}` }} />{children}</body></html>;
  }
  // Agency public entries remain independent of fleet data and creator identity.
  if (isTwinLoginPath(pathname) || (pathname && isAgencyPath(pathname))) {
    return <html lang="en" data-agency={pathname && isAgencyPath(pathname) && isMoxy(pathAgencyName(pathname)) ? "moxy" : undefined} data-brand-theme={pathname && isAgencyPath(pathname) && pathAgencyName(pathname) === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined} className={fontClass}><body className="min-h-screen bg-bg">{children}</body></html>;
  }
  const devBypass = !isTwinLoginPath(pathname) && (process.env.NODE_ENV !== "production");
  const agency = await getDashboardAccess();
  const authed = !!agency || devBypass || (await isAuthed());
  if (!authed) return <html lang="en" className={fontClass} style={{ colorScheme: "light" }} suppressHydrationWarning><body className="min-h-screen bg-bg">{children}</body></html>;

  // Existing per-identity caches and clone switcher behaviour are unchanged.
  const [twinVersion, clones, activeCloneId] = await Promise.all([
    agency ? Promise.resolve(null) : getCachedTwinVersion(), getFleetClones(), getCloneScope(),
  ]);
  const allTimeStars = await getHeaderAllTimeStars(activeCloneId);
  // Path-dependent rendering stays in the client TopBar/MainShell components.
  return (
    <html lang="en" data-agency={isMoxy(agency?.name) ? "moxy" : isLynq(agency?.name) ? "lynq" : undefined} data-brand-theme={isLynq(agency?.name) ? "lynq-light" : agency?.name === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined} className={fontClass} style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-screen bg-bg">
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("blurMedia")==="true")document.documentElement.classList.add("blur-media")}catch(e){}` }} />
        <DashboardAccessProvider agencyName={agency?.name} canManage={agencyCanManage(agency)}><CurrencyProvider><BlurProvider>
          <div className="flex h-screen">
            <Sidebar clones={clones} activeCloneId={activeCloneId} />
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
              <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
                <Link href="/revenue" aria-label={agency?.name || "Twin Technologies"}><TwinWordmark inverse agencyName={agency?.name} /></Link>
                <div className="flex items-center gap-1">
                  {agency && <form action="/agency/logout" method="post"><button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10">Sign out</button></form>}
                  <MobileMenu activeCloneId={activeCloneId} />
                </div>
              </header>
              <TopBar clones={clones} activeCloneId={activeCloneId} allTimeStars={allTimeStars} />
              <MainShell>{children}</MainShell>
            </div>
          </div>
          {!agency && <TwinUpdatePopup version={twinVersion?.version ?? null} name={twinVersion?.name ?? ""} summary={twinVersion?.summary ?? ""} changes={twinVersion?.changes ?? []} />}
        </BlurProvider></CurrencyProvider></DashboardAccessProvider>
      </body>
    </html>
  );
}
