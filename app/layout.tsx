import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import CurrencyProvider from "@/components/CurrencyProvider";
import CurrencyToggle from "@/components/CurrencyToggle";
import ThemeProvider from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import MainNav from "@/components/MainNav";
import MobileMenu from "@/components/MobileMenu";
import { supabaseAdmin } from "@/lib/supabase";
import { colorForIndex } from "@/lib/colors";
import { isAuthed } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export const metadata: Metadata = {
  title: "Allie Admin",
  description: "Manage and build the bot fleet",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthed();

  if (!authed) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){document.documentElement.classList.add('dark');}})();`,
            }}
          />
        </head>
        <body className="min-h-screen">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    );
  }

  let clones: { id: string; name: string; color: string; photoUrl?: string }[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("clones")
      .select("id,name")
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as { id: string; name: string }[];

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
      color: colorForIndex(i),
      photoUrl: photoByClone.get(c.id),
    }));
  } catch {
    // header nav still renders with an empty clone list if the DB is unreachable
  }

  return (
    <html lang="en">
      <head>
        {/* Apply saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
        <CurrencyProvider>
          <header className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4 dark:border-neutral-900 dark:bg-black">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-6">
                <Link href="/revenue" className="text-2xl font-bold tracking-tight sm:text-3xl text-gray-900 dark:text-white">
                  Allie<span className="text-brand">.</span>
                </Link>
                <CurrencyToggle />
              </div>
              <div className="hidden flex-1 justify-center lg:flex">
                <MainNav clones={clones} />
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/clones/new"
                  className="hidden rounded-lg bg-amber-400 px-4 py-2 text-xs font-medium text-gray-900 border-b-4 border-amber-600 shadow-md hover:bg-amber-500 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-2 active:shadow-sm transition-all lg:inline-block sm:px-5 sm:text-sm"
                >
                  + Create New Clone
                </Link>
                <ThemeToggle />
                <MobileMenu clones={clones} />
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition lg:block dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>
                <form action={logout}>
                  <button
                    type="submit"
                    aria-label="Sign out"
                    className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition lg:block dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
