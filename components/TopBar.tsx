"use client";

import { usePathname } from "next/navigation";
import CloneSwitcher from "@/components/CloneSwitcher";
import CurrencyToggle from "@/components/CurrencyToggle";
import BlurToggle from "@/components/BlurToggle";
import { logout } from "@/app/login/actions";
import { fmtMoney, starsToMoney } from "@/lib/money";
import { getPageMeta } from "@/lib/page-meta";

// Straight, full-width top bar — replaces the old floating/overlay pill.
// One row: breadcrumb on the left, account controls in the middle. Always in
// normal document flow (never absolute/overlay) so it never needs per-page
// clearance padding.
//
// CLIENT component on purpose: the breadcrumb depends on the current path,
// and the root layout (where this is mounted) does NOT re-render on
// client-side navigation — deriving the label server-side from the
// x-pathname header froze it on whatever page you first loaded. usePathname()
// updates on every navigation, so the breadcrumb always matches the page.
export default function TopBar({
  clones,
  activeCloneId,
  allTimeStars,
}: {
  clones: { id: string; name: string; color: string; photoUrl?: string }[];
  activeCloneId: string | null;
  allTimeStars: number;
}) {
  const pathname = usePathname();
  const { scopeLabel, pageLabel } = getPageMeta(pathname, clones, activeCloneId);
  return (
    // 3-col grid so the controls sit dead-center of the bar regardless of
    // how wide the breadcrumb text is; right column is an empty balancer.
    // Fixed h-16 (not padding-driven height) so this bar's bottom border lines
    // up exactly with the Sidebar's brand-row border next to it - the two were
    // drifting apart whenever content pushed either row's natural height.
    <div className="sticky top-0 z-40 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line bg-panel px-4">
      <h1 className="min-w-0 truncate text-base font-semibold text-ink">
        {scopeLabel}
        {pageLabel != null && <span className="text-muted"> / {pageLabel}</span>}
      </h1>

      <div className="flex shrink-0 items-center gap-1.5">
        <CloneSwitcher clones={clones} activeCloneId={activeCloneId} />
        <div className="h-5 w-px shrink-0 bg-line" />
        {/* All-time cash made, scoped to the clone switcher above - not
            time-windowed like the Revenue page's period toggle. */}
        <span className="hidden items-baseline gap-1 px-1.5 sm:flex">
          <span className="text-xs">💵</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-ink">
            {fmtMoney(starsToMoney(allTimeStars, "USD"), "USD")}
          </span>
        </span>
        <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        <CurrencyToggle compact />
        <BlurToggle />
        <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        {/* Mock - not wired up yet, just holding the spot. */}
        <button
          type="button"
          title="Search (coming soon)"
          className="flex items-center justify-center rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            className="flex items-center justify-center rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
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
      {/* Empty right column - balances the breadcrumb so the controls stay
          truly centered. */}
      <div />
    </div>
  );
}
