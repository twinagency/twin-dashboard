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
  channel: "telegram",
  label: "Telegram",
  href: "/telegram",
  summary: "The Telegram fleet: one combined Fans and Messages screen per creator scope.",
  nav: [
    {
      key: "fans",
      label: "Fans and Messages",
      href: "/users",
      icon: "FansCombo",
      availability: "existing",
      note: "Telegram keeps its existing combined list-and-thread screen.",
    },
    { key: "flows", label: "Flows", href: "/flows", icon: "Flows", availability: "existing" },
    { key: "media", label: "Media", href: "/media", icon: "Media", availability: "existing" },
    { key: "business", label: "Business", href: "/business", icon: "Bot", availability: "existing" },
  ],
};

export const ONLYFANS_CHANNEL: ChannelDefinition = {
  channel: "onlyfans",
  label: "OnlyFans",
  href: "/onlyfans/inbox",
  summary: "OnlyFans accounts and conversations, account by account.",
  nav: [
    { key: "of-inbox", label: "Inbox", href: "/onlyfans/inbox", icon: "Inbox", availability: "built" },
    { key: "of-accounts", label: "Accounts", href: "/onlyfans/accounts", icon: "Users", availability: "built" },
    { key: "of-operations", label: "Operations", href: "/onlyfans/operations", icon: "Settings", availability: "built" },
    {
      key: "of-content",
      label: "Content",
      href: "/onlyfans/content",
      icon: "Media",
      availability: "built",
      note: "Recorded catalogue descriptions, media checks and prices.",
    },
    {
      key: "of-sales",
      label: "Sales",
      href: "/onlyfans/sales",
      icon: "Dollar",
      availability: "built",
      note: "Recorded purchases and reversals, separated by currency and status.",
    },
    {
      key: "of-settings",
      label: "Settings",
      href: "/onlyfans/settings",
      icon: "Settings",
      availability: "built",
      note: "Saved creator configuration and runtime permissions.",
    },
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
