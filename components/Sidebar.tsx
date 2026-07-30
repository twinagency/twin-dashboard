"use client";

// Left sidebar app shell (desktop). "Create new clone" is always the first
// thing in it, then one flat nav list, each page type appears ONCE, scoped
// by the clone switcher in the header (components/CloneSwitcher.tsx, "All
// clones" by default). Picking/managing a clone lives in the header switcher
// popup + the /clones page, not here, no duplicate clone list in the
// sidebar. Settings/AI/Feedback/Changelog used to live in a separate footer
// section; they're folded into the one list now, ordered by importance.
//
// Mobile keeps the existing hamburger (MobileMenu), this component only
// renders at lg+ (see layout.tsx).

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { openCloneSwitcher } from "@/lib/clone-switcher-bus";
import TwinAssistant from "@/components/TwinAssistant";
import TwinWordmark from "@/components/TwinWordmark";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };

// One flat nav list, 7 rows total, all in the same row format (icon + label,
// full width, consistent size). PPVs/Edit are "tab" links into the current
// clone's Configure page (inert until a clone is picked in the header
// switcher); everything else is a plain route link.
type NavLink =
  | { kind: "route"; label: string; href: string; icon: string; color: LinkColor; gateOnClone?: boolean }
  | { kind: "tab"; label: string; tab: string; icon: string; color: LinkColor };

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className + " shrink-0"}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

const PATHS: Record<string, string> = {
  Revenue: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 7h5v5"/>',
  Clones: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  Edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  Users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Logs: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  Info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  Flows:
    '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  Media: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  Feedback: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  Messages: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  Dials: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  Dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  Settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  Plus: '<path d="M12 5v14M5 12h14"/>',
  Code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  SignOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  Search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  ArrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  ArrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  Inbox:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  Database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  Bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  ListChecks: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  Bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
};

// Icons keep their own Aurora color while labels use Stripe's dark navy ink.
// The sidebar itself is a pale, multicolor Atlas-style field, so selected rows
// use translucent white surfaces rather than dark-mode treatments.
type LinkColor = "neutral" | "good" | "purple" | "orange" | "blue" | "red" | "pink" | "gray";
const LINK_COLOR_CLASSES: Record<LinkColor, { icon: string; active: string; idle: string }> = {
  neutral: { icon: "text-ink/55", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  good: { icon: "text-good", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  purple: { icon: "text-accent", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  orange: { icon: "text-warn", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  blue: { icon: "text-accent-2", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  pink: { icon: "text-love", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  red: { icon: "text-crit", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
  gray: { icon: "text-muted", active: "bg-white/75 text-ink shadow-[0_6px_18px_rgb(16_24_40/0.07)] ring-1 ring-white/70", idle: "text-ink/80 hover:bg-white/50 hover:text-ink" },
};

// Each page type appears exactly once, scoped by the header clone switcher,
// not by a route param. Ordered by importance: day-to-day fleet views first,
// girl-only editors next, then reference/meta pages last. One list, one visual
// language, rather than a main block plus a separate footer block.
const NAV_LINKS: NavLink[] = [
  { kind: "route", label: "Earnings", href: "/revenue", icon: "EarningsCombo", color: "good" },
  { kind: "route", label: "Fans", href: "/users", icon: "FansCombo", color: "purple" },
  // Fleet-wide, not girl-specific, so no gateOnClone: it answers questions
  // across every clone and is useful before you've picked one in the header
  // switcher. Sits up here with the other day-to-day views rather than down
  // with the reference pages, per the ordering note above.
  { kind: "route", label: "AI", href: "/ai", icon: "Sparkle", color: "blue" },
  { kind: "route", label: "Flows", href: "/flows", icon: "Flows", color: "pink", gateOnClone: true },
  { kind: "tab", label: "PPVs", tab: "ppvs", icon: "Media", color: "red" },
  { kind: "tab", label: "Edit", tab: "identity", icon: "Dials", color: "blue" },
  { kind: "route", label: "Info", href: "/info", icon: "Info", color: "neutral" },
  { kind: "route", label: "Logs", href: "/logs", icon: "Logs", color: "neutral" },
  { kind: "route", label: "Settings", href: "/settings", icon: "Settings", color: "gray" },
];

export default function Sidebar({
  clones,
  activeCloneId,
}: {
  clones: CloneLite[];
  activeCloneId: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "config";

  const isGlobalActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  const onConfigurePage = activeCloneId ? pathname === `/clones/${activeCloneId}` : false;

  return (
    <aside className="dashboard-sidebar sticky top-0 hidden h-screen w-64 shrink-0 flex-col lg:flex">
      {/* Brand - fixed height so its bottom border lines up exactly with the
          TopBar's border in the column next to it (both h-16). */}
      <div className="flex h-16 shrink-0 items-center border-b border-ink/10 px-4">
        <Link href="/revenue" className="min-w-0" aria-label="Twin Technologies">
          <TwinWordmark />
        </Link>
      </div>

      {/* Create new clone - always the first thing in the sidebar, its own
          row so it reads as an action, not just another nav destination.
          No bottom border: the generous space above it already separates it
          from the brand header, so a hairline as well just reads as clutter. */}
      <div className="shrink-0 px-3 pb-3 pt-10 [@media(max-height:850px)]:pt-6">
        <Link
          href="/clones/new"
          className="sidebar-create-button flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white transition"
        >
          <Icon d={PATHS.Plus} className="h-4 w-4" />
          Create new clone
        </Link>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-3">
        {/* One flat list, icon left, label, full-width row. Rows are spaced
            apart (not divided by hairlines) so each rounded, hoverable row
            reads as its own control instead of a table. PPVs/Edit/Flows
            are girl-specific: on "All clones" they render exactly like any
            other idle row (no dimming - a plain nav row that happens to open
            the clone picker instead of navigating reads as broken, not as
            "pick someone first"), and tapping one opens the clone picker
            instead of navigating anywhere - editing a single girl's config
            always requires picking her first. */}
        <div className="space-y-1">
          {NAV_LINKS.map((l) => {
            const colors = LINK_COLOR_CLASSES[l.color];

            if (l.kind === "tab") {
              const active = onConfigurePage && activeTab === l.tab;
              if (!activeCloneId) {
                return (
                  <button
                    key={l.label}
                    type="button"
                    onClick={() => openCloneSwitcher()}
                    title="Pick a clone first"
                    className={
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition [@media(max-height:850px)]:py-2 " +
                      colors.idle
                    }
                  >
                    <Icon d={PATHS[l.icon]} className={"h-[18px] w-[18px] " + colors.icon} />
                    {l.label}
                  </button>
                );
              }
              return (
                <Link
                  key={l.label}
                  href={`/clones/${activeCloneId}?tab=${l.tab}`}
                  className={
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition [@media(max-height:850px)]:py-2 " +
                    (active ? colors.active : colors.idle)
                  }
                >
                  <Icon d={PATHS[l.icon]} className={"h-[18px] w-[18px] " + colors.icon} />
                  {l.label}
                </Link>
              );
            }

            if (l.kind === "route" && l.gateOnClone && !activeCloneId) {
              return (
                <button
                  key={l.href}
                  type="button"
                  onClick={() => openCloneSwitcher()}
                  title="Pick a clone first"
                  className={
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition [@media(max-height:850px)]:py-2 " +
                    colors.idle
                  }
                >
                  <Icon d={PATHS[l.icon]} className={"h-[18px] w-[18px] " + colors.icon} />
                  {l.label}
                </button>
              );
            }

            const active = isGlobalActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition [@media(max-height:850px)]:py-2 " +
                  (active ? colors.active : colors.idle)
                }
              >
                {l.icon === "FansCombo" ? (
                  <>
                    <Icon d={PATHS.Users} className={"h-[18px] w-[18px] " + colors.icon} />
                    <span className="flex-1">{l.label}</span>
                    <Icon d={PATHS.Messages} className="h-4 w-4 text-ink/40" />
                  </>
                ) : l.icon === "EarningsCombo" ? (
                  <>
                    <Icon d={PATHS.Dollar} className={"h-[18px] w-[18px] " + colors.icon} />
                    <span className="flex-1">{l.label}</span>
                  </>
                ) : (
                  <>
                    <Icon d={PATHS[l.icon]} className={"h-[18px] w-[18px] " + colors.icon} />
                    {l.label}
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Still not built - kept separate from the real nav list above. */}
        <div className="mt-1 border-t border-ink/10 pt-1">
          <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink/40 opacity-70 [@media(max-height:850px)]:py-2">
            <Icon d={PATHS.Code} className="h-[18px] w-[18px]" />
            <span className="flex-1">API</span>
            <span className="rounded-full bg-white/45 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-ink/50">
              coming soon
            </span>
          </span>
        </div>

        <div className="mt-auto pt-4 [@media(max-height:850px)]:pt-2">
          <TwinAssistant />
        </div>
      </nav>
    </aside>
  );
}
