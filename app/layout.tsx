import { agencyCanManage } from "@/lib/agency-management-policy";
import DashboardAccessProvider from "@/components/DashboardAccessProvider";
import { getDashboardAccess } from "@/lib/dashboard-access";
import "./globals.css";
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
import { isMoxy, pathAgencyName } from "@/lib/agency-brand";
import { getCloneScope } from "@/lib/clone-scope";
import { Inter, Inter_Tight, Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
// Money figures use Inter + tabular-nums instead of a coding monospace font —
// every mono font tried (Roboto Mono, Source Code Pro, Inconsolata) rendered
// a slashed/dotted zero in at least one real browser. Stripe/Whop-style
// fintech UIs don't use a code font for numbers either — same UI typeface,
// just tabular-aligned. Loading Inter again under the --font-mono variable
// means every `font-mono tabular-nums` usage in the app renders in Inter.
const plexMono = Inter({subsets:['latin'],variable:'--font-mono'});
const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-heading'});
const interTight = Inter_Tight({subsets:['latin'],variable:'--font-display'});

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname");
  const agencyName = pathname && isAgencyPath(pathname)
    ? pathAgencyName(pathname)
    : pathname === "/login" ? undefined : (await getDashboardAccess())?.name;
  return agencyName ? {
    title: `${agencyName} Dashboard`,
    description: `${agencyName} creator dashboard`,
    icons: { icon: { url: isMoxy(agencyName) ? "/moxy/icon.svg" : "/agency/icon.svg", type: "image/svg+xml" } },
  } : {
    title: "Twin Console",
    description: "Intelligence infrastructure operations console",
    icons: { icon: { url: "/icon.png", type: "image/png" } },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Mirrors middleware.ts's dev bypass — otherwise the app shell (sidebar, nav)
  // never renders in development even though middleware already lets the
  // request through, since this check runs independently of the cookie. /login
  // itself is excluded — it must always render standalone (no sidebar), the
  // same as it would once real auth is re-enabled.
  const pathname = (await headers()).get("x-pathname");
  // The agency shell must never fetch or serialize the internal fleet data.
  if (pathname === "/login" || (pathname && isAgencyPath(pathname))) {
    return <html lang="en" data-agency={pathname && isAgencyPath(pathname) && isMoxy(pathAgencyName(pathname)) ? "moxy" : undefined} className={cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable)}><body className="min-h-screen bg-bg">{children}</body></html>;
  }
  const devBypass =
    pathname !== "/login" &&
    (process.env.NODE_ENV !== "production");
  const agency = await getDashboardAccess();
  const authed = !!agency || devBypass || (await isAuthed());

  if (!authed) {
    return (
      <html lang="en" className={cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable)} style={{ colorScheme: "light" }} suppressHydrationWarning>
        <body className="min-h-screen bg-bg">
          {children}
        </body>
      </html>
    );
  }

  // Migration 117: which version of Twin this is. Fetched here, once, so both
  // the sidebar chip and the update popup read the same row.
  //
  // twinVersion, the clones+photos block and activeCloneId (a cookie read, not
  // a DB round trip) share no inputs, so they run together instead of one
  // after another — same "dashboard is slow" pass as lib/dashboard-data.ts and
  // lib/analytics-data.ts. This runs on every full/hard page load (see the
  // note below on why it does NOT re-run on client-side nav), so it is the
  // first-load cost, not the per-navigation one.
  //
  // All three now come from lib/query-cache.ts. The bodies that used to be
  // inline here moved there unchanged — same queries, same shapes, same
  // "render the shell anyway if the DB is unreachable" fallbacks — so that a
  // repeat page load serves them from cache instead of re-running four round
  // trips (clones, photos, twin_versions, plus the RPC below) on every hard
  // load. See that file for the TTLs and for the keying rule; note in
  // particular that the avatar URLs are still signed fresh on every request,
  // only the storage paths are cached.
  const [twinVersion, clones, activeCloneId] = await Promise.all([
    agency ? Promise.resolve(null) : getCachedTwinVersion(),
    getFleetClones(),
    getCloneScope(),
  ]);

  // All-time cash + stars for the small header readout — scoped by the same
  // clone switcher as everything else, never time-windowed.
  // Aggregated in SQL (migration 135). This used to select amount_stars and sum
  // it here, unpaged: PostgREST returned its default 1,000 rows of 8,532 and the
  // header quietly showed 653,816 stars ($8,499.61) against an actual 4,042,272
  // ($52,549.54), an 84% understatement that looked like a plausible number and
  // never moved. Same defect the two paged star_transactions reads in
  // lib/dashboard-data.ts and lib/analytics-data.ts already carry comments about.
  // Money out of this table is paged or aggregated in SQL, never bare-selected.
  //
  // Cached for 60s, the same bound lib/revenue-cache.ts puts on every other
  // money number here. activeCloneId is passed as an explicit argument and ends
  // up in the cache key — it must never be read from the cookie inside the
  // cached function, or one operator's clone total would be served as another's.
  const allTimeStars = await getHeaderAllTimeStars(activeCloneId);

  // NOTE: nothing below may depend on `pathname` — this layout does NOT
  // re-render on client-side navigation, so any path-derived value computed
  // here freezes on the first full page load (that bug shipped twice today:
  // stale breadcrumb + Fans full-bleed leaking across pages). Path-dependent
  // rendering lives in the TopBar/MainShell CLIENT components (usePathname).

  return (
    <html lang="en" data-agency={isMoxy(agency?.name) ? "moxy" : undefined} className={cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable)} style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-screen bg-bg">
        {/* Privacy mode has to be on the <html> element BEFORE first paint.
            BlurProvider applies it too, but only in a useEffect after
            hydration, which meant a hard reload flashed every creator photo
            and name on screen for a beat before blurring them. For a feature
            whose whole job is that nobody over your shoulder sees this, that
            flash is the bug. This runs synchronously during body parse.
            <html> already carries suppressHydrationWarning, which is what
            makes mutating its class list here safe. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("blurMedia")==="true")document.documentElement.classList.add("blur-media")}catch(e){}`,
          }}
        />
        <DashboardAccessProvider agencyName={agency?.name} canManage={agencyCanManage(agency)}>
        <CurrencyProvider>
        <BlurProvider>
          <div className="flex h-screen">
            <Sidebar
              clones={clones}
              activeCloneId={activeCloneId}
            />
            {/* Every page (Fans/inbox included) is a fixed-height shell: the
                sidebar and TopBar never move, only this column's own <main>
                scrolls internally. No page-level (document) scroll anywhere. */}
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
              {/* Mobile-only top bar - the Sidebar above only renders at lg+ */}
              <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
                <Link href="/revenue" aria-label={agency?.name || "Twin Technologies"}>
                  <TwinWordmark inverse agencyName={agency?.name} />
                </Link>
                <div className="flex items-center gap-1">
                  {agency && <form action="/agency/logout" method="post">
                    <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10">Sign out</button>
                  </form>}
                  <MobileMenu activeCloneId={activeCloneId} />
                </div>
              </header>
              {/* Straight, full-width divider bar - clone/page breadcrumb +
                  account controls in one row. Not floating, not rounded; see
                  components/TopBar.tsx. */}
              <TopBar clones={clones} activeCloneId={activeCloneId} allTimeStars={allTimeStars} />
              <MainShell>{children}</MainShell>
            </div>
          </div>
          {/* Mounted ONCE, outside the sidebar, so a phone gets it too. It
              renders nothing until the version actually changes. */}
          {!agency && <TwinUpdatePopup
            version={twinVersion?.version ?? null}
            name={twinVersion?.name ?? ""}
            summary={twinVersion?.summary ?? ""}
            changes={twinVersion?.changes ?? []}
          />}
        </BlurProvider>
        </CurrencyProvider>
        </DashboardAccessProvider>
      </body>
    </html>
  );
}
