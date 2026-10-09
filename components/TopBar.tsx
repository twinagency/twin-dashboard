"use client";
import { useDashboardAccess } from "./DashboardAccessProvider";

import { usePathname, useSearchParams } from "next/navigation";
import CloneSwitcher from "@/components/CloneSwitcher";
import CurrencyToggle from "@/components/CurrencyToggle";
import { useCurrency } from "@/components/CurrencyProvider";
import BlurToggle from "@/components/BlurToggle";
import { logout } from "@/app/login/actions";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";
import { getPageMeta } from "@/lib/page-meta";
import { CREATOR_DASHBOARD_NAV } from "@/lib/creator-dashboard-policy";

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
  creatorName,
}: {
  clones: { id: string; name: string; color: string; photoUrl?: string }[];
  activeCloneId: string | null;
  allTimeStars: number;
  /** Verified creator identity. Supplying it locks the shared clone chip. */
  creatorName?: string;
}) {
  const {isAgency,isCreator,agencyName}=useDashboardAccess();
  const { currency, rate, usdPerStar } = useCurrency();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageMeta = getPageMeta(pathname, clones, activeCloneId);
  const pageLabel = isCreator
    ? CREATOR_DASHBOARD_NAV.find((item) => item.href === pathname)?.label ?? "Earnings"
    : pathname?.startsWith("/clones/") && searchParams.get("tab") === "ppvs" ? "PPVs" : pageMeta.pageLabel;
  const scopeLabel = isCreator ? creatorName || clones.find((clone) => clone.id === activeCloneId)?.name || "Creator" : pageMeta.scopeLabel;
  const scopeIsCreator = isCreator || pageMeta.scopeIsCreator;
  // The fan workspace has a local creator selector over isolated presentation
  // relationships. Do not display an unrelated live creator or revenue total.
  if (!isAgency && !isCreator && pathname === "/fans") {
    return <div className="dashboard-topbar flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-5 lg:px-8">
      <div className="text-sm font-semibold text-ink">Twin <span className="font-normal text-muted">/ Fan profiles</span></div>
      <div className="flex items-center gap-3"><span className="hidden text-xs text-muted sm:inline">Creator relationships</span><BlurToggle /></div>
    </div>;
  }
  if (isAgency && agencyName?.trim().toLowerCase() === "moxy" && pathname === "/revenue") {
    return <div className="dashboard-topbar moxy-overview-topbar">
      <div className="moxy-overview-breadcrumb"><span>Moxy</span> / Earnings</div>
      <div className="moxy-overview-account-controls">
        <div className="moxy-overview-creator"><CloneSwitcher clones={clones} activeCloneId={activeCloneId} /></div>
        <div className="moxy-overview-lifetime">
          <span>All-time revenue</span>
          <strong className="tabular-nums">{fmtMoney(starsToMoneyRate(allTimeStars, currency, rate, usdPerStar), currency)}</strong>
        </div>
        <div className="moxy-overview-currency"><CurrencyToggle compact /></div>
        <div className="moxy-overview-blur"><BlurToggle /></div>
        <form action="/agency/logout" method="post" className="moxy-overview-signout"><button type="submit">Sign out</button></form>
      </div>
    </div>;
  }
  return (
    // 3-col grid so the controls sit dead-center of the bar regardless of
    // how wide the breadcrumb text is; right column is an empty balancer.
    // Fixed h-16 (not padding-driven height) so this bar's bottom border lines
    // up exactly with the Sidebar's brand-row border next to it - the two were
    // drifting apart whenever content pushed either row's natural height.
    //
    // The grid only exists from sm up, because that is the only place there is
    // a breadcrumb to balance. Below sm the h1 is display:none, so it is not a
    // grid item at all: auto-placement then dropped the control pill into the
    // FIRST 1fr column and the empty balancer into the auto column, which is
    // what made the pill sit left of centre on a phone. A plain centred flex
    // has nothing to mis-place. Everything here is breakpoint-scoped, so sm+
    // (and lg+) renders exactly as before.
    <div className="dashboard-topbar sticky top-0 z-40 flex h-20 shrink-0 justify-center items-center gap-3 border-b border-line px-5 sm:grid sm:grid-cols-[1fr_auto_1fr] lg:px-8">
      <h1 className="hidden min-w-0 truncate font-heading text-sm font-semibold tracking-[-0.02em] text-ink sm:block">
        <span className={scopeIsCreator ? "creator-name" : undefined}>{scopeLabel}</span>
        {pageLabel != null && <span className="text-muted"> / {pageLabel}</span>}
      </h1>

      <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line/80 bg-white/82 px-2 py-1.5 shadow-[0_8px_26px_rgb(6_23_47/0.06)] backdrop-blur-xl">
        <CloneSwitcher clones={clones} activeCloneId={activeCloneId} locked={isCreator} fallbackName={creatorName} />
        <div className="h-5 w-px shrink-0 bg-line" />
        {/* All-time cash made, scoped to the clone switcher above - not
            time-windowed like the Revenue page's period toggle. */}
        <span className="hidden items-baseline gap-1 px-1.5 sm:flex">
          <span className="text-xs">💵</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-ink">
            {fmtMoney(starsToMoneyRate(allTimeStars, currency, rate, usdPerStar), currency)}
          </span>
        </span>
        <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        <CurrencyToggle compact />
        <BlurToggle />
        <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        <form action={isCreator ? "/creator-auth/logout" : isAgency ? "/agency/logout" : logout} method={isCreator || isAgency ? "post" : undefined}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center justify-center gap-1.5 rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink"
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
            {(isAgency || isCreator) && <span className="hidden text-xs font-medium sm:inline">Sign out</span>}
          </button>
        </form>
      </div>
      {/* Empty right column - balances the breadcrumb so the controls stay
          truly centered. Mirrors the breadcrumb's own visibility: below sm
          there is no breadcrumb to balance, and leaving it in the flex row
          would cost a gap-3 and shove the pill 6px off centre. */}
      <div className="hidden sm:block" />
    </div>
  );
}


