"use client";

// Left sidebar app shell (desktop). Global nav only — each page type appears
// ONCE: Revenue, Fans, Info, Drip, Media, Logs, Feedback. All 7 are scoped by
// the clone switcher in the header (components/CloneSwitcher.tsx, "All
// clones" by default). Picking/managing a clone lives in the header switcher
// popup + the /clones page, not here — no duplicate clone list in the
// sidebar.
//
// Mobile keeps the existing hamburger (MobileMenu) — this component only
// renders at lg+ (see layout.tsx).

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type CloneLite = { id: string; name: string; color: string; photoUrl?: string };

// Configure's own sub-sections, surfaced as quick-jump tiles under the main
// Configure button — icon big, centered, label below, matching the tab bar
// on the Configure page itself. Advanced (Prompts/Flow) is deliberately left
// off the sidebar — still reachable from the tab bar on the page itself.
// Keys match the Configure page's flat tab bar. Monetize is deliberately NOT a
// tile any more — money is just one tab inside Edit now, so a separate sidebar
// entry pointed at a tab that no longer exists as its own section.
const CONFIGURE_TILES: { key: string; label: string; icon: string; color: LinkColor }[] = [
  { key: "ppvs", label: "PPVs", icon: "Media", color: "red" },
  { key: "identity", label: "Edit", icon: "Dials", color: "blue" },
];

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
  Campaigns:
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
  ListChecks: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
};

// Icons always show their own color. Labels stay plain ink until selected,
// at which point the label + row background switch to that same icon color.
type LinkColor = "neutral" | "good" | "purple" | "orange" | "blue" | "red" | "pink" | "gray";
const LINK_COLOR_CLASSES: Record<LinkColor, { icon: string; active: string; idle: string }> = {
  neutral: { icon: "text-muted", active: "bg-muted/15 text-ink", idle: "text-ink hover:bg-muted/10" },
  good: { icon: "text-good", active: "bg-good/15 text-good", idle: "text-ink hover:bg-good/10" },
  purple: { icon: "text-purple-400", active: "bg-purple-500/15 text-purple-400", idle: "text-ink hover:bg-purple-500/10" },
  orange: { icon: "text-orange-400", active: "bg-orange-500/15 text-orange-400", idle: "text-ink hover:bg-orange-500/10" },
  blue: { icon: "text-accent", active: "bg-accent/15 text-accent", idle: "text-ink hover:bg-accent/10" },
  pink: { icon: "text-pink-400", active: "bg-pink-500/15 text-pink-400", idle: "text-ink hover:bg-pink-500/10" },
  red: { icon: "text-red-400", active: "bg-red-500/15 text-red-400", idle: "text-ink hover:bg-red-500/10" },
  gray: { icon: "text-slate-400", active: "bg-slate-500/15 text-slate-300", idle: "text-ink hover:bg-slate-500/10" },
};

// Each page type appears exactly once — scoped by the header clone switcher,
// not by a route param.
const GLOBAL_LINKS: { label: string; href: string; icon: string; color: LinkColor }[] = [
  { label: "Earnings", href: "/revenue", icon: "EarningsCombo", color: "good" },
  { label: "Fans", href: "/users", icon: "FansCombo", color: "purple" },
  { label: "Campaigns", href: "/drip", icon: "Campaigns", color: "pink" },
];

// Lower-priority pages — smaller, side by side, at the foot of the nav list.
const MINOR_LINKS: { label: string; href: string; icon: string }[] = [
  { label: "Info", href: "/info", icon: "Info" },
  { label: "Logs", href: "/logs", icon: "Logs" },
];

// Faint left stripe per row — just a quiet visual grouping cue, not tied to
// the icon/active color system the rest of the nav uses.
const ADMIN_LINKS: { label: string; href: string; icon: string; stripe: string }[] = [
  { label: "New Form Submissions", href: "/admin/submissions", icon: "Inbox", stripe: "bg-blue-500/25" },
  { label: "Client Database", href: "/admin/clients", icon: "Database", stripe: "bg-green-500/25" },
  { label: "Team To Do", href: "/admin/todo", icon: "ListChecks", stripe: "bg-yellow-500/25" },
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
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-panel lg:flex">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-4">
        <Link href="/revenue" className="text-2xl font-extrabold tracking-tight text-ink">
          Twin<span className="text-ink">.</span>
        </Link>
        {/* Static tag only — no popup built yet. Will later open a versioned
            "what's new" panel (see changelog UI idea in memory). */}
        <span className="rounded-full bg-muted/10 px-2 py-1 text-[10px] font-medium text-muted">
          v1.0 beta
        </span>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        {/* Developer — tiles + regular page nav. Grows to take up most of the
            sidebar's height; Admin below gets a smaller share, and the
            footer (outside nav) stays fixed to its own content height.
            flex + justify-between spreads the 3 content groups down to fill
            that height instead of leaving them top-packed with dead space
            below Minor pages. */}
        <div className="flex flex-[4] flex-col justify-between">
        {/* Configure — the clone-editing surface. Only meaningful once a
            single clone is picked in the header switcher; greyed out and
            inert on "All clones" instead of hidden, so it's discoverable. */}
        <div className="mb-3 mt-1">
          <div className="mb-3 text-[11px] font-semibold tracking-wide text-muted">Developer</div>
          {/* Quick-jump tiles into Configure's own sections — icon big,
              centered, label below. Each tile has its own icon color; label +
              tile background pick up that color only once it's active. */}
          <div className="grid grid-cols-2 divide-x divide-line">
            {CONFIGURE_TILES.map((t) => {
              const active = onConfigurePage && activeTab === t.key;
              const colors = LINK_COLOR_CLASSES[t.color];
              return activeCloneId ? (
                <Link
                  key={t.key}
                  href={`/clones/${activeCloneId}?tab=${t.key}`}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-lg px-2 py-4 text-sm font-medium transition " +
                    (active ? colors.active : colors.idle)
                  }
                >
                  <Icon d={PATHS[t.icon]} className={"h-7 w-7 " + colors.icon} />
                  {t.label}
                </Link>
              ) : (
                <span
                  key={t.key}
                  className="flex cursor-not-allowed flex-col items-center gap-1.5 rounded-lg px-2 py-4 text-sm font-medium text-muted opacity-40"
                >
                  <Icon d={PATHS[t.icon]} className="h-7 w-7" />
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Global links */}
        <div className="mb-3 divide-y divide-line">
          {GLOBAL_LINKS.map((l) => {
            const colors = LINK_COLOR_CLASSES[l.color];
            const active = isGlobalActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition " +
                  (active ? colors.active : colors.idle)
                }
              >
                {l.icon === "FansCombo" ? (
                  <>
                    <Icon d={PATHS.Users} className={"h-5 w-5 " + colors.icon} />
                    <span className="flex-1">{l.label}</span>
                    <Icon d={PATHS.Messages} className="h-4 w-4 text-ink" />
                  </>
                ) : l.icon === "EarningsCombo" ? (
                  <>
                    <Icon d={PATHS.Dollar} className={"h-5 w-5 " + colors.icon} />
                    <span className="flex-1">{l.label}</span>
                  </>
                ) : (
                  <>
                    <Icon d={PATHS[l.icon]} className={"h-5 w-5 " + colors.icon} />
                    {l.label}
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Minor pages — smaller, side by side, out of the main flow. */}
        <div className="grid grid-cols-2 gap-1.5">
          {MINOR_LINKS.map((l) => {
            const active = isGlobalActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition " +
                  (active ? LINK_COLOR_CLASSES.neutral.active : LINK_COLOR_CLASSES.neutral.idle)
                }
              >
                <Icon d={PATHS[l.icon]} className="h-3.5 w-3.5 text-muted" />
                {l.label}
              </Link>
            );
          })}
        </div>
        </div>

        {/* Admin — its own section, kept grey/neutral like Info+Logs. Smaller
            growth share than Developer above (flex-[4] vs flex-[2]).
            -mx-3 cancels nav's own px-3 so the line runs edge-to-edge, same
            as the border under the brand header up top. */}
        <div className="flex-[2] mt-5 -mx-3 border-t border-line">
          <div className="flex items-center gap-1.5 px-3 pt-6 text-[11px] font-semibold tracking-wide text-muted">
            Admin
            <span className="rounded-full bg-muted/10 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal">
              coming soon
            </span>
          </div>
          {/* Greyed out — not wired up yet, so every row stays inert/muted
              regardless of route, instead of picking up the active-link color. */}
          <div className="mt-2 space-y-0.5 px-3 opacity-50">
            {ADMIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-2.5 rounded-lg py-2.5 pl-2.5 pr-2.5 text-xs font-medium text-muted transition hover:bg-muted/10"
              >
                <span className={"h-5 w-1 shrink-0 rounded-full " + l.stripe} />
                <Icon d={PATHS[l.icon]} className="h-4 w-4 text-muted" />
                <span className="flex-1">{l.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer — kept compact so Admin above has room to breathe without
          forcing the sidebar to scroll. */}
      <div className="space-y-0.5 border-t border-line p-2">
        <Link
          href="/settings"
          className={
            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition " +
            (isGlobalActive("/settings") ? LINK_COLOR_CLASSES.neutral.active : "text-muted hover:bg-muted/10 hover:text-ink")
          }
        >
          <Icon d={PATHS.Settings} className="h-4 w-4" />
          Settings
        </Link>
        <span
          className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted opacity-50"
        >
          <Icon d={PATHS.Feedback} className="h-4 w-4" />
          <span className="flex-1">Feedback</span>
          <span className="rounded-full bg-muted/10 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-muted">
            coming soon
          </span>
        </span>
        <span
          className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted opacity-50"
        >
          <Icon d={PATHS.Code} className="h-4 w-4" />
          <span className="flex-1">API</span>
          <span className="rounded-full bg-muted/10 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-muted">
            coming soon
          </span>
        </span>
      </div>
    </aside>
  );
}
