"use client";
import { useDashboardAccess } from "./DashboardAccessProvider";

import { usePathname, useSearchParams } from "next/navigation";
import CloneSwitcher from "@/components/CloneSwitcher";
import CurrencyToggle from "@/components/CurrencyToggle";
import { useCurrency } from "@/components/CurrencyProvider";
import BlurToggle from "@/components/BlurToggle";
import SignOutButton from "@/components/SignOutButton";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";
import { getPageMeta } from "@/lib/page-meta";
import { isDashboardWorkspaceRoute, dashboardWorkspacePageLabel } from "@/lib/dashboard-creator-route";
import { CREATOR_DASHBOARD_NAV } from "@/lib/creator-dashboard-policy";
import ChannelSwitch from "@/components/ChannelSwitch";
import type { DashboardChannel } from "@/lib/channel-nav";
import { channelForPath } from "@/lib/channel-nav";

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
  lockCreatorScope = false,
  channels,
  signOut = "live",
  signOutAction,
}: {
  clones: { id: string; name: string; color: string; photoUrl?: string }[];
  activeCloneId: string | null;
  allTimeStars: number;
  /** Verified creator identity. Supplying it locks the shared clone chip. */
  creatorName?: string;
  /**
   * Pin the creator scope. Used by the isolated OnlyFans preview, where the
   * creator is a fixture and there is no scope cookie to write. False in the
   * dashboard, so nothing about the live switcher changes.
   */
  lockCreatorScope?: boolean;
  /**
   * Which channels this session may switch to, from the server's channel scope.
   * Omitted means every channel, which is only correct for the isolated
   * preview: the dashboard always passes the server's answer, so a channel the
   * operator cannot open is never offered as a control.
   */
  channels?: DashboardChannel[];
  /**
   * `simulated` renders an inert, labelled sign-out instead of the live one.
   * Only the isolated preview passes it — a preview must not be able to clear a
   * real session.
   */
  signOut?: "live" | "simulated";
  /**
   * The signed-in sign-out action, supplied by the server layout rather than
   * imported here. Importing it would put the login server action in the module
   * graph of every surface that mounts this bar, including the isolated
   * preview's; the preview's import audit asserts that it is not.
   */
  signOutAction?: (formData: FormData) => void | Promise<void>;
}) {
  const {isAgency,isCreator,agencyName,audience}=useDashboardAccess();
  const { currency, rate, usdPerStar } = useCurrency();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const channel = channelForPath(pathname);
  const pageMeta = getPageMeta(pathname, clones, activeCloneId);
  const workspaceLabel = !isCreator && isDashboardWorkspaceRoute(pathname) ? dashboardWorkspacePageLabel(pathname) : null;
  const pageLabel = isCreator
    ? CREATOR_DASHBOARD_NAV.find((item) => item.href === pathname)?.label ?? "Earnings"
    : pathname?.startsWith("/clones/") && searchParams.get("tab") === "ppvs" ? "PPVs" : workspaceLabel ?? pageMeta.pageLabel;
  const scopeLabel = isCreator ? creatorName || clones.find((clone) => clone.id === activeCloneId)?.name || "Creator" : pageMeta.scopeLabel;
  const scopeIsCreator = isCreator || pageMeta.scopeIsCreator;
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
      {/* The channel switch sits above the breadcrumb in the same grid column,
          so the channel and the page it is showing read as one line and the
          centre control pill stays dead-centre. Below sm this column is
          display:none; the mobile drawer carries the same switch. */}
      <div className="hidden min-w-0 flex-col items-start gap-1.5 sm:flex">
        {audience !== "admin" ? <ChannelSwitch channels={channels} /> : null}
        <h1 className="min-w-0 truncate font-heading text-sm font-semibold tracking-[-0.02em] text-ink">
          <span className={scopeIsCreator ? "creator-name" : undefined}>{workspaceLabel && /twin/i.test(scopeLabel) ? "Workspace" : scopeLabel}</span>
          {pageLabel != null && <span className="text-muted"> / {pageLabel}</span>}
        </h1>
      </div>

      <div className="workspace-account-controls flex shrink-0 items-center gap-1.5 rounded-xl border border-line/80 bg-white/82 px-2 py-1.5 shadow-[0_8px_26px_rgb(6_23_47/0.06)] backdrop-blur-xl">
        <CloneSwitcher clones={clones} activeCloneId={activeCloneId} locked={isCreator || lockCreatorScope} fallbackName={creatorName} />
        <div className="h-5 w-px shrink-0 bg-line" />
        {/* All-time cash made, scoped to the clone switcher above - not
            time-windowed like the Revenue page's period toggle.
            Telegram Stars are Telegram money. On the OnlyFans channel this pill
            is withheld rather than shown at zero: a Stars figure on an OF
            account would read as that account's earnings, and the two must
            never be silently aggregated. */}
        {channel !== "onlyfans" ? (
          <>
            <span className="hidden items-baseline gap-1 px-1.5 sm:flex">
              <span className="text-xs">💵</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                {fmtMoney(starsToMoneyRate(allTimeStars, currency, rate, usdPerStar), currency)}
              </span>
            </span>
            <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
          </>
        ) : null}
        <CurrencyToggle compact />
        <BlurToggle />
        <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        {/* Agency and creator portals sign out through their own route so the
            portal's scope is cleared with the session; the internal operator
            signs out through the login action the layout supplies. */}
        {signOut === "simulated" ? (
          <SignOutButton mode="simulated" />
        ) : (
          <form
            action={isCreator ? "/creator-auth/logout" : isAgency ? "/agency/logout" : signOutAction}
            method={isCreator || isAgency ? "post" : undefined}
          >
            <SignOutButton showLabel={isAgency || isCreator} />
          </form>
        )}
      </div>
      {/* Empty right column - balances the breadcrumb so the controls stay
          truly centered. Mirrors the breadcrumb's own visibility: below sm
          there is no breadcrumb to balance, and leaving it in the flex row
          would cost a gap-3 and shove the pill 6px off centre. */}
      <div className="hidden sm:block" />
    </div>
  );
}
