import { isMarketingPath } from "@/lib/marketing-routing";
import { isTwinLoginPath } from "@/lib/login-routing";
import { agencyCanManage } from "@/lib/agency-management-policy";
import DashboardAccessProvider from "@/components/DashboardAccessProvider";
import { getDashboardAccess } from "@/lib/dashboard-access";
import "./globals.css";
import "./jess-kate-theme.css";
import "./creator-workspace.css";
import "./flirt-theme.css";
import "./studio-workspace.css";
import "./compact-workspace.css";
import WorkspaceMobileNav from "@/components/WorkspaceMobileNav";
import WorkspaceShell from "@/components/WorkspaceShell";
import { JESS_KATE_PORTAL, TETHER_PORTAL } from "@/lib/partner-portals";
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
import { creatorPublicPortal, isCreatorPath, isCreatorPublicPath } from "@/lib/creator-routing";
import { isCreatorDashboardPath } from "@/lib/creator-dashboard-policy";
import { getCreatorWorkspace } from "@/lib/creator-dashboard";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
const plexMono = Inter({subsets:['latin'],variable:'--font-mono'});
const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-heading'});
const interTight = Inter_Tight({subsets:['latin'],variable:'--font-display'});
const fontClass = cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable);

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname");
  if (isCreatorPath(pathname)) {
    const creator = !isCreatorPublicPath(pathname) ? await getCreatorWorkspace() : null;
    const publicPortal = creatorPublicPortal(pathname);
    const link = publicPortal === "link" || isLynq(creator?.name);
    const tether = publicPortal === "tether" || creator?.name === TETHER_PORTAL.name;
    return {
      title: link ? "LYNQ creator workspace" : tether ? "Tether creator workspace" : "FLIRT creator dashboard",
      description: link ? "Private LYNQ creator access" : tether ? "Private Tether creator access" : "Your creator workspace",
      robots: { index: false, follow: false },
      icons: { icon: { url: "/brand/flirt-icon.svg", type: "image/svg+xml" }, apple: "/brand/flirt-apple-touch-icon.png" },
    };
  }
  if (isMarketingPath(pathname)) return {
    title: "FLIRT", description: "Your personal AI, built to chat like you.", robots: { index: false, follow: false },
    icons: { icon: { url: "/brand/flirt-icon.svg", type: "image/svg+xml" }, apple: "/brand/flirt-apple-touch-icon.png" },
  };
  const agencyName = pathname && isAgencyPath(pathname) ? pathAgencyName(pathname) : isTwinLoginPath(pathname) ? undefined : (await getDashboardAccess())?.name;
  return agencyName ? {
    title: `${agencyName} Dashboard`, description: `${agencyName} creator dashboard`,
    icons: { icon: { url: isMoxy(agencyName) ? "/moxy/icon.svg" : "/agency/icon.svg", type: "image/svg+xml" } },
  } : { title: "FLIRT Console", description: "Intelligence infrastructure operations console", icons: { icon: { url: "/brand/flirt-icon.svg", type: "image/svg+xml" }, apple: "/brand/flirt-apple-touch-icon.png" } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  // Creator pages never mount the operator shell or fetch its fleet/version.
  // The dedicated creator layout supplies the same earnings geometry with a
  // fixed, verified creator identity. Login/onboarding remain standalone.
  if (isCreatorPath(pathname)) {
    const creator = !isCreatorPublicPath(pathname) ? await getCreatorWorkspace() : null;
    const publicPortal = creatorPublicPortal(pathname);
    const link = publicPortal === "link" || isLynq(creator?.name);
    const theme = link ? "lynq-light" : creator?.name === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined;
    return <html lang="en" data-app-brand="flirt" data-creator-workspace={isCreatorDashboardPath(pathname) ? "true" : undefined} data-brand-theme={theme} data-agency={link ? "lynq" : isMoxy(creator?.name) ? "moxy" : undefined} className={fontClass} style={{colorScheme:"light"}} suppressHydrationWarning><body className="min-h-screen bg-bg"><script dangerouslySetInnerHTML={{__html:'try{if(localStorage.getItem("blurMedia")==="true")document.documentElement.classList.add("blur-media")}catch(e){}'}} />{children}</body></html>;
  }
  if (isMarketingPath(pathname)) return <html lang="en" data-app-brand="flirt" className={fontClass}><body>{children}</body></html>;
  // These two live under the /agency/ prefix but are authenticated operator
  // pages, not part of the login/portal shell that prefix otherwise means:
  // they need the real Sidebar and DashboardAccessProvider below, not the
  // bare shell every other /agency/* path gets.
  const isAgencyOperatorPage = pathname === "/agency/creators" || pathname?.startsWith("/agency/creators/") || pathname === "/agency/creator-invites";
  if (isTwinLoginPath(pathname) || (pathname && isAgencyPath(pathname) && !isAgencyOperatorPage)) {
    return <html lang="en" data-app-brand="flirt" data-agency={pathname && isAgencyPath(pathname) && isMoxy(pathAgencyName(pathname)) ? "moxy" : undefined} data-brand-theme={pathname && isAgencyPath(pathname) && pathAgencyName(pathname) === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined} className={fontClass}><body className="min-h-screen bg-bg">{children}</body></html>;
  }
  const devBypass = !isTwinLoginPath(pathname) && process.env.NODE_ENV !== "production";
  const agency = await getDashboardAccess();
  const authed = !!agency || devBypass || await isAuthed();
  if (!authed) return <html lang="en" data-app-brand="flirt" className={fontClass} style={{colorScheme:"light"}} suppressHydrationWarning><body className="min-h-screen bg-bg">{children}</body></html>;
  const [twinVersion, clones, activeCloneId] = await Promise.all([
    agency ? Promise.resolve(null) : getCachedTwinVersion(), getFleetClones(), getCloneScope(),
  ]);
  const allTimeStars = await getHeaderAllTimeStars(activeCloneId);
  // Path-dependent navigation stays in client components, not frozen here.
  return <html lang="en" data-app-brand="flirt" data-agency={isMoxy(agency?.name) ? "moxy" : isLynq(agency?.name) ? "lynq" : undefined} data-brand-theme={isLynq(agency?.name) ? "lynq-light" : agency?.name === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined} className={fontClass} style={{ colorScheme: "light" }} suppressHydrationWarning>
    <body className="min-h-screen bg-bg">
      <script dangerouslySetInnerHTML={{__html:'try{if(localStorage.getItem("blurMedia")==="true")document.documentElement.classList.add("blur-media")}catch(e){}'}} />
      <DashboardAccessProvider agencyName={agency?.name} canManage={agencyCanManage(agency)}><CurrencyProvider><BlurProvider>
        <WorkspaceShell activeCloneId={activeCloneId}>
          <Sidebar clones={clones} activeCloneId={activeCloneId} />
          <div className="workspace-content flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
            <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
              <Link href="/revenue" aria-label={agency?.name || "FLIRT"}><TwinWordmark inverse agencyName={agency?.name} /></Link>
              <div className="flex items-center gap-1">{agency && <form action="/agency/logout" method="post"><button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10">Sign out</button></form>}<MobileMenu activeCloneId={activeCloneId} /></div>
            </header>
            <TopBar clones={clones} activeCloneId={activeCloneId} allTimeStars={allTimeStars} /><MainShell activeCloneId={activeCloneId}>{children}</MainShell>
            <WorkspaceMobileNav activeCloneId={activeCloneId} />
          </div>
        </WorkspaceShell>
        {!agency && <TwinUpdatePopup version={twinVersion?.version ?? null} name={twinVersion?.name ?? ""} summary={twinVersion?.summary ?? ""} changes={twinVersion?.changes ?? []} />}
      </BlurProvider></CurrencyProvider></DashboardAccessProvider>
    </body>
  </html>;
}
