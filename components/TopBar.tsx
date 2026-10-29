"use client";
import Link from "next/link";
import { useInboxIdentity } from "./onlyfans-preview/InboxIdentity";
import { useEffect, useState } from "react";
import { mergeChannelCreators, type ChannelRoster } from "@/lib/channel-workspace/model";
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
import { workspaceChannel } from "@/lib/channel-nav";

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
  allTimeUsdPerStar,
  creatorName,
  lockCreatorScope = false,
  channels,
  signOut = "live",
  signOutAction,
}: {
  clones: { id: string; name: string; color: string; photoUrl?: string }[];
  activeCloneId: string | null;
  allTimeStars: number;
  /** Rate for the all-time figure (blends per-girl rates). Falls back to the viewer's rate. */
  allTimeUsdPerStar?: number;
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
  const [signOutError, setSignOutError] = useState("");
  const [signOutPending, setSignOutPending] = useState(false);
  const revokeAndSignOut = async (data: FormData) => {
    setSignOutError(""); setSignOutPending(true);
    try {
      if (!signOutAction) throw new Error("Sign out action unavailable");
      await signOutAction(data);
    } catch {
      setSignOutError("Could not sign out. Your session has not been confirmed revoked. Please try again.");
    } finally { setSignOutPending(false); }
  };
  const {isAgency,isCreator,agencyName,audience}=useDashboardAccess();
  const {identity:inboxIdentity}=useInboxIdentity();
  const { currency, rate, usdPerStar } = useCurrency();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const channel = workspaceChannel(pathname, searchParams.get("workspace"), audience === "admin");
  const combined = audience === "admin" && channel === "all" && ["/dashboard", "/overview"].includes(pathname);
  const [rosterRead, setRosterRead] = useState<{channel: string; status: "ready" | "unavailable"; creators: typeof clones} | null>(null);
  useEffect(() => {
    if (audience !== "admin" || channel === "all" || lockCreatorScope) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/channel-roster?channel=${channel}`, { cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() as ChannelRoster : null;
        const source = data?.schemaVersion === "channel-roster.v1" ? data[channel] : null;
        if (!controller.signal.aborted) setRosterRead({ channel, status: source?.status === "ready" ? "ready" : "unavailable", creators: source?.status === "ready" ? mergeChannelCreators(data!).map(creator => ({id: creator.id, name: creator.name, color: creator.color, photoUrl: creator.photoUrl})) : [] });
      } catch { if (!controller.signal.aborted) setRosterRead({channel, status:"unavailable", creators:[]}); }
    })();
    return () => controller.abort();
  }, [audience, channel, lockCreatorScope]);
  const channelScoped = audience === "admin" && channel !== "all" && !lockCreatorScope;
  const channelReady = rosterRead?.channel === channel && rosterRead.status === "ready";
  const scopedClones = channelScoped ? channelReady ? (rosterRead?.creators ?? []).map(creator => ({...creator, photoUrl: creator.photoUrl ?? clones.find(known => known.id === creator.id)?.photoUrl})) : [] : clones;
  const scopeId = combined ? null : channel === "onlyfans" ? searchParams.get("creator") : activeCloneId;
  const scopeLocked = isCreator || lockCreatorScope || combined || channelScoped && (!channelReady || scopedClones.length === 0);
  const fallbackScope = combined ? "All creators" : channelScoped && !channelReady ? rosterRead?.channel === channel ? "Creators unavailable" : "Loading creators…" : channelScoped && scopedClones.length === 0 ? `No ${channel === "onlyfans" ? "OnlyFans" : "Telegram"} creators` : creatorName;
  const pageMeta = getPageMeta(pathname, scopedClones, scopeId);
  const workspaceLabel = !isCreator && isDashboardWorkspaceRoute(pathname) ? dashboardWorkspacePageLabel(pathname) : null;
  const pageLabel = isCreator
    ? CREATOR_DASHBOARD_NAV.find((item) => item.href === pathname)?.label ?? "Earnings"
    : pathname?.startsWith("/clones/") && searchParams.get("tab") === "ppvs" ? "PPVs" : workspaceLabel ?? pageMeta.pageLabel;
  const scopeLabel = combined ? "All creators" : isCreator ? creatorName || clones.find((clone) => clone.id === activeCloneId)?.name || "Creator" : pageMeta.scopeLabel;
  const scopeIsCreator = !combined && (isCreator || pageMeta.scopeIsCreator);
  if (isAgency && ["moxy", "top onlyfans agency"].includes(agencyName?.trim().toLowerCase() ?? "") && pathname === "/revenue") {
    return <div className="dashboard-topbar moxy-overview-topbar">
      <div className="moxy-overview-breadcrumb"><span>{agencyName}</span> / Earnings</div>
      <div className="moxy-overview-account-controls">
        <div className="moxy-overview-creator"><CloneSwitcher clones={clones} activeCloneId={activeCloneId} /></div>
        <div className="moxy-overview-lifetime">
          <span>All-time revenue</span>
          <strong className="tabular-nums">{fmtMoney(starsToMoneyRate(allTimeStars, currency, rate, allTimeUsdPerStar ?? usdPerStar), currency)}</strong>
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
      {/* Channel selection lives in the sidebar and mobile drawer. */}
      <div className="hidden min-w-0 flex-col items-start gap-1.5 sm:flex">
        <h1 className="min-w-0 truncate font-heading text-sm font-semibold tracking-[-0.02em] text-ink">
          <span className={scopeIsCreator ? "creator-name" : undefined}>{workspaceLabel && /twin/i.test(scopeLabel) ? "Workspace" : scopeLabel}</span>
          {pageLabel != null && <span className="text-muted"> / {pageLabel}</span>}
        </h1>
      </div>

      <div className="workspace-account-controls flex shrink-0 items-center gap-1.5 rounded-xl border border-line/80 bg-white/82 px-2 py-1.5 shadow-[0_8px_26px_rgb(6_23_47/0.06)] backdrop-blur-xl">
        {isCreator ? <CloneSwitcher clones={clones} activeCloneId={activeCloneId} locked={isCreator} fallbackName={creatorName} /> : <CloneSwitcher clones={scopedClones} activeCloneId={channel === "onlyfans" ? inboxIdentity?.creatorId ?? scopeId : scopeId} locked={scopeLocked} fallbackName={channel === "onlyfans" ? inboxIdentity?.creatorName ?? fallbackScope : fallbackScope} allowNewCreator={channel !== "onlyfans"} />}
        <div className="h-5 w-px shrink-0 bg-line" />
        {channel === "onlyfans" ? <span className="of-workspace-context"><img src="/brand/platforms/onlyfans.svg" alt="" width="24" height="24" />OnlyFans workspace</span> : null}
        {/* All-time cash made, scoped to the clone switcher above - not
            time-windowed like the Revenue page's period toggle.
            Telegram Stars are Telegram money. On the OnlyFans channel this pill
            is withheld rather than shown at zero: a Stars figure on an OF
            account would read as that account's earnings, and the two must
            never be silently aggregated. */}
        {channel !== "onlyfans" && !combined ? (
          <>
            <span className="hidden items-baseline gap-1 px-1.5 sm:flex">
              <span className="text-xs">💵</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                {fmtMoney(starsToMoneyRate(allTimeStars, currency, rate, allTimeUsdPerStar ?? usdPerStar), currency)}
              </span>
            </span>
            <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
          </>
        ) : null}
        {channel === "onlyfans" ? <span className="of-currency-label" title="OnlyFans amounts retain their recorded currency. Summary earnings are in USD.">USD</span> : <CurrencyToggle compact />}
        <BlurToggle />
        <div className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        {/* Agency and creator portals sign out through their own route so the
            portal's scope is cleared with the session; the internal operator
            signs out through the login action the layout supplies. */}
        {signOut === "simulated" ? (
          <SignOutButton mode="simulated" />
        ) : (
          <form
            action={isCreator ? "/creator-auth/logout" : isAgency ? "/agency/logout" : revokeAndSignOut}
            method={isCreator || isAgency ? "post" : undefined}
          >
            <fieldset disabled={!isAgency && !isCreator && signOutPending} className="m-0 border-0 p-0">
              <SignOutButton showLabel={isAgency || isCreator} />
            </fieldset>
            {!isAgency && !isCreator && signOutError && <p role="alert" className="max-w-64 text-xs text-crit">{signOutError}</p>}
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
