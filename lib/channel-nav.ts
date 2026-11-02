// The channel workspaces inside the one Twin CRM.
//
// Twin is one product with three transports, not three dashboards. This module
// is the single definition of which channel a route belongs to and what that
// channel's own navigation is, so the sidebar, the top bar and the page
// breadcrumb cannot disagree about where the operator is.
//
// It is deliberately data-free: constants and one pure function, no provider,
// no database and no fixture import. `components/Sidebar.tsx`,
// `components/TopBar.tsx` and `lib/page-meta.ts` read it, and the isolated
// OnlyFans preview mounts those same components, so the channel extension in
// the preview is the channel extension that would ship.
//
// Ownership: the OF dashboard track owns this file's content today. Telegram's
// entries are links into routes that already ship (`/users`, `/flows`,
// `/media`, `/business`) — it reproduces none of them. See
// docs/onlyfans/NAVIGATION_INTEGRATION.md for the integration proposal.

export type DashboardChannel = "all" | "telegram" | "onlyfans";

/**
 * How a navigation entry relates to reality today.
 *
 * `built` and `existing` both render as working links; `existing` means the
 * route already ships in the dashboard, so the entry points at it rather than
 * reproducing it. `planned` has no route at all and renders as inert labelled
 * text — a nav chip that looks tappable and does nothing is the same defect
 * class as a configured-but-inert setting.
 */
export type ChannelNavAvailability = "built" | "existing" | "planned";

export type ChannelNavItem = {
  key: string;
  label: string;
  /** The route the integrated dashboard serves for this entry. */
  href: string;
  /** Key into the shared sidebar icon set (components/Sidebar.tsx `PATHS`). */
  icon: string;
  availability: ChannelNavAvailability;
  /** Shown for planned entries, and as the link's tooltip otherwise. */
  note?: string;
  /** `settings` entries render under the Settings heading, after the everyday pages. */
  group?: "settings";
  /** A combined, every-creator page: its link drops the selected creator and account. */
  combined?: true;
};

export type ChannelDefinition = {
  channel: DashboardChannel;
  label: string;
  /** Where selecting the channel lands. */
  href: string;
  /** One line describing what the channel is for. */
  summary: string;
  nav: ChannelNavItem[];
};

export const ALL_CHANNELS: ChannelDefinition = {
  channel: "all",
  label: "All channels",
  href: "/overview",
  summary: "Every transport in one place: creators, earnings and every account they run.",
  nav: [
    { key: "overview", label: "Overview", href: "/overview", icon: "Dials", availability: "built" },
    {
      key: "earnings",
      label: "Earnings",
      href: "/revenue",
      icon: "Dollar",
      availability: "existing",
      note: "The existing earnings page.",
    },
    { key: "creators", label: "Creators", href: "/clones", icon: "Clones", availability: "existing" },
    { key: "fans", label: "Fans", href: "/users", icon: "FansCombo", availability: "existing" },
    {
      key: "platforms",
      label: "Platforms",
      href: "/crm/platforms",
      icon: "Database",
      availability: "existing",
    },
  ],
};

export const TELEGRAM_CHANNEL: ChannelDefinition = {
  channel: "telegram", label: "Telegram", href: "/telegram",
  summary: "Your Telegram creators, conversations, content and earnings.",
  nav: [
    { key: "telegram-creators", label: "Creators", href: "/telegram", icon: "Clones", availability: "built" },
    { key: "fans", label: "Fans and Messages", href: "/users?workspace=telegram", icon: "FansCombo", availability: "existing" },
    { key: "media", label: "Content", href: "/media?workspace=telegram", icon: "Media", availability: "existing" },
    { key: "flows", label: "Flows", href: "/flows?workspace=telegram", icon: "Flows", availability: "existing" },
    { key: "business", label: "Telegram Stories", href: "/business?workspace=telegram", icon: "Bot", availability: "existing" },
    { key: "telegram-earnings", label: "Earnings", href: "/revenue", icon: "Dollar", availability: "existing" },
    { key: "telegram-payouts", label: "Payouts", href: "/payouts", icon: "Payouts", availability: "built" },
  ],
};

export const ONLYFANS_CHANNEL: ChannelDefinition = {
  channel: "onlyfans",
  label: "OnlyFans",
  href: "/onlyfans/overview",
  summary: "OnlyFans accounts and conversations, account by account.",
  nav: [
    // Everyday pages first, in the order an operator works through a day.
    // Keys and routes are unchanged, so bookmarks and older links still land.
    { key: "of-overview", label: "Today", href: "/onlyfans/overview", icon: "Home", availability: "built", combined: true, note: "Who needs attention, what was earned and what needs a person." },
    { key: "of-inbox", label: "Inbox", href: "/onlyfans/inbox", icon: "Messages", availability: "built" },
    { key: "of-accounts", label: "Creators", href: "/onlyfans/accounts", icon: "Users", availability: "built", note: "Creators, their OnlyFans accounts and connections." },
    { key: "of-content", label: "Content", href: "/onlyfans/content", icon: "Media", availability: "built", note: "Your media library and prepared offers." },
    { key: "of-revenue", label: "Revenue", href: "/onlyfans/revenue", icon: "Dollar", availability: "built", note: "Revenue across all creators, by creator and by source." },
    { key: "of-sales", label: "Earnings", href: "/onlyfans/sales", icon: "Revenue", availability: "built", note: "Recorded transactions and open offers." },
    { key: "of-campaigns", label: "Campaigns", href: "/onlyfans/campaigns", icon: "Flows", availability: "built", note: "Saved message campaigns and recipient delivery." },
    // Team, configuration and technical controls.
    { key: "of-settings", label: "Settings", href: "/onlyfans/settings", icon: "Settings", availability: "built", group: "settings", note: "Saved creator configuration and runtime permissions." },
    { key: "of-launch", label: "Launch control", href: "/onlyfans/launch", icon: "Settings", availability: "built", group: "settings", note: "Account readiness, purchase recovery, approved personality, fan memory and account automation controls." },
    { key: "of-operations", label: "Operations", href: "/onlyfans/operations", icon: "Database", availability: "built", group: "settings" },
  ],
};

/** Display order in the channel switch. */
export const CHANNELS: ChannelDefinition[] = [ALL_CHANNELS, TELEGRAM_CHANNEL, ONLYFANS_CHANNEL];

export function channelDefinition(channel: DashboardChannel): ChannelDefinition {
  return CHANNELS.find((entry) => entry.channel === channel) ?? ALL_CHANNELS;
}

/**
 * Which channel a path belongs to.
 *
 * Anything that is not an OnlyFans or Telegram route belongs to All channels,
 * which is where the existing dashboard lives: the channel switch adds a
 * workspace dimension to the current product rather than replacing it.
 */
export function channelForPath(pathname: string | null | undefined): DashboardChannel {
  const path = pathname ?? "";
  if (path === "/onlyfans" || path.startsWith("/onlyfans/")) return "onlyfans";
  if (path === "/telegram" || path.startsWith("/telegram/")) return "telegram";
  return "all";
}

/** True when the sidebar should show this channel's nav instead of the operator nav. */
export function isChannelScoped(pathname: string | null | undefined): boolean {
  return channelForPath(pathname) !== "all";
}

/**
 * The channels a switch may offer, given the scope the server allowed.
 *
 * This is the gating rule as a pure function so both the control and its checks
 * read the same definition: the switch filters its own entries here and nowhere
 * else, and the order is always the canonical display order rather than the
 * order a caller happened to list them in.
 */
export function offeredChannels(allowed: readonly DashboardChannel[]): ChannelDefinition[] {
  return CHANNELS.filter((entry) => allowed.includes(entry.channel));
}

/**
 * Whether the switch has anything to switch to.
 *
 * Below two options there is no switching, so the bar renders exactly as it did
 * before this feature existed. A one-option segmented control is a control that
 * does nothing, which is the defect class this codebase already treats as
 * worse than an absent control.
 */
export function shouldShowChannelSwitch(allowed: readonly DashboardChannel[]): boolean {
  return offeredChannels(allowed).length >= 2;
}

/** Presentation context for existing Telegram screens. Never grants access;
 * server channel authorization continues to use the route and verified identity. */
export function workspaceChannel(pathname: string | null | undefined, workspace: string | null | undefined, operator: boolean): DashboardChannel {
  const channel = channelForPath(pathname);
  if (channel !== "all" || !operator) return channel;
  const path = pathname ?? "";
  if (["/users", "/media", "/flows", "/business"].includes(path)) return "telegram";
  if (workspace !== "telegram") return "all";
  return ["/users", "/media", "/flows", "/business", "/dashboard", "/revenue", "/clones", "/clones/new"].includes(path) || /^\/clones\/[0-9a-f-]{36}\/?$/i.test(path) ? "telegram" : "all";
}
export function telegramWorkspaceHref(path: string): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query); params.set("workspace", "telegram");
  return `${pathname}?${params}`;
}

