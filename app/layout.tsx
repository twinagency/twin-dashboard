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
import { supabaseAdmin } from "@/lib/supabase";
import { chartColorForClone, profileImagePathForClone } from "@/lib/colors";
import { isAuthed } from "@/lib/auth";
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

export const metadata: Metadata = {
  title: "Allie Admin",
  description: "Manage and build the bot fleet",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Mirrors middleware.ts's dev bypass — otherwise the app shell (sidebar, nav)
  // never renders in development even though middleware already lets the
  // request through, since this check runs independently of the cookie. /login
  // itself is excluded — it must always render standalone (no sidebar), the
  // same as it would once real auth is re-enabled.
  const pathname = (await headers()).get("x-pathname");
  const devBypass =
    pathname !== "/login" &&
    (process.env.NODE_ENV !== "production" || process.env.DASHBOARD_NO_AUTH === "true");
  const authed = devBypass || (await isAuthed());

  if (!authed) {
    return (
      <html lang="en" className={cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable)} style={{ colorScheme: "light" }} suppressHydrationWarning>
        <body className="min-h-screen bg-bg">
          {children}
        </body>
      </html>
    );
  }

  let clones: { id: string; name: string; color: string; photoUrl?: string }[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("clones")
      .select("id,name,intake")
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as { id: string; name: string; intake: unknown }[];

    // Cover photo per clone (first uploaded), batch-signed for the avatars.
    const photoByClone = new Map<string, string>();
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: photos } = await supabaseAdmin
        .from("photos")
        .select("clone_id, storage_path")
        .in("clone_id", ids)
        .order("created_at", { ascending: true });
      const firstPath = new Map<string, string>();
      for (const clone of rows) {
        const customPath = profileImagePathForClone(clone.intake);
        if (customPath) firstPath.set(clone.id, customPath);
      }
      for (const p of photos ?? []) {
        if (p.clone_id && !firstPath.has(p.clone_id)) firstPath.set(p.clone_id, p.storage_path);
      }
      const entries = [...firstPath.entries()];
      if (entries.length) {
        const { data: signed } = await supabaseAdmin.storage
          .from("media")
          .createSignedUrls(entries.map((e) => e[1]), 3600);
        (signed ?? []).forEach((s, i) => {
          if (s.signedUrl) photoByClone.set(entries[i][0], s.signedUrl);
        });
      }
    }

    clones = rows.map((c, i) => ({
      id: c.id,
      name: c.name,
      color: chartColorForClone(c.intake, i),
      photoUrl: photoByClone.get(c.id),
    }));
  } catch {
    // header nav still renders with an empty clone list if the DB is unreachable
  }

  const activeCloneId = await getCloneScope();

  // All-time cash + stars for the small header readout — scoped by the same
  // clone switcher as everything else, never time-windowed.
  let allTimeStars = 0;
  try {
    let txQuery = supabaseAdmin.from("star_transactions").select("amount_stars");
    if (activeCloneId) txQuery = txQuery.eq("clone_id", activeCloneId);
    const { data } = await txQuery;
    allTimeStars = ((data ?? []) as { amount_stars: number }[]).reduce((s, r) => s + (r.amount_stars || 0), 0);
  } catch {
    // header still renders with zero if the DB is unreachable
  }

  // NOTE: nothing below may depend on `pathname` — this layout does NOT
  // re-render on client-side navigation, so any path-derived value computed
  // here freezes on the first full page load (that bug shipped twice today:
  // stale breadcrumb + Fans full-bleed leaking across pages). Path-dependent
  // rendering lives in the TopBar/MainShell CLIENT components (usePathname).

  return (
    <html lang="en" className={cn("font-sans", inter.variable, plexMono.variable, spaceGrotesk.variable, interTight.variable)} style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-screen bg-bg">
        <CurrencyProvider>
        <BlurProvider>
          <div className="flex h-screen">
            <Sidebar clones={clones} activeCloneId={activeCloneId} />
            {/* Every page (Fans/inbox included) is a fixed-height shell: the
                sidebar and TopBar never move, only this column's own <main>
                scrolls internally. No page-level (document) scroll anywhere. */}
            <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
              {/* Mobile-only top bar - the Sidebar above only renders at lg+ */}
              <header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-line px-4 py-3 lg:hidden">
                <Link href="/revenue" aria-label="Twin Technologies">
                  <TwinWordmark />
                </Link>
                <div className="flex items-center gap-1">
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
        </BlurProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}
