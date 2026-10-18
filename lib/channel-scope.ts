// ── The server's channel-scope authority ────────────────────────────────
//
// `lib/channel-nav.ts` says *which channel a path is*. This module says *which
// channels the current request may open*, and it is the only place allowed to
// decide that. A channel route declares its own channel and asks here before it
// renders anything; `app/layout.tsx` asks here once and passes the answer down,
// so a channel this session may not enter is never offered as a control.
//
// It is deliberately the server's answer and not the browser's:
//
//   * the path comes from middleware's `x-pathname` header, not from a client
//     hook, so the request cannot claim to be a different channel than it is;
//   * the audience is the verified identity from `lib/dashboard-access`, not a
//     cookie a page chose to read;
//   * a refusal is a 404 at the route, so no channel page renders at all for a
//     session that may not have it.
//
// Why the *active* channel is still read from the pathname inside the shell: the
// root layout does not re-render on client-side navigation (see the note in
// components/TopBar.tsx), so a channel frozen there would go stale the moment
// the operator clicked a channel link — the exact bug that comment records.
// The shell therefore derives the active channel through the same pure function
// used here, while the server keeps the authority over what is *allowed*. One
// definition, one function, so the two cannot disagree.
//
// Nothing here is a claim about the OnlyFans backend. The channel workspaces it
// gates render fixture surfaces today; the gate is about who may open the
// workspace, not about what is behind it.

import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "./dashboard-access";
import { getViewAsBannerInfo } from "./view-as-banner";
import {
  CHANNELS,
  channelDefinition,
  channelForPath,
  type ChannelDefinition,
  type DashboardChannel,
} from "./channel-nav";

/**
 * Who is asking, as far as channel scope is concerned.
 *
 * `isOperator` is the internal operator or an agency that can manage creators.
 * A read-only agency and a view-as session are not operators: viewing as
 * somebody is a look, never an administration, and the dashboard already
 * forces view-as read-only for that reason.
 */
export type ChannelAccess = { isOperator: boolean };

/**
 * The gate, as a pure function so it can be asserted without a request.
 *
 * `all` is every session's home because it *is* the existing dashboard: this
 * feature adds a workspace dimension to the current product rather than
 * replacing it, so the operator navigation must stay reachable exactly as it
 * was. The channel workspaces are new surfaces and are operator-only.
 */
export function channelVerdict(
  channel: DashboardChannel,
  access: ChannelAccess,
): { allowed: boolean; reason: string } {
  if (channel === "all") {
    return { allowed: true, reason: "The existing dashboard, unchanged." };
  }
  if (access.isOperator) {
    return { allowed: true, reason: "Operator workspace." };
  }
  return {
    allowed: false,
    reason: `${channelDefinition(channel).label} is an operator workspace, and this session is not an operator.`,
  };
}

export function channelAccess(input: { hasAgency: boolean; hasViewAs: boolean }): ChannelAccess {
  return { isOperator: !input.hasAgency && !input.hasViewAs };
}

export function allowedChannels(access: ChannelAccess): DashboardChannel[] {
  return CHANNELS.filter((entry) => channelVerdict(entry.channel, access).allowed).map(
    (entry) => entry.channel,
  );
}

export type ChannelScope = {
  /** The request's path, from middleware. Null only in the isolated preview. */
  pathname: string | null;
  channel: DashboardChannel;
  definition: ChannelDefinition;
  access: ChannelAccess;
  /** In display order, for the channel switch. */
  allowed: DashboardChannel[];
};

/**
 * Resolve access from the request.
 *
 * `getDashboardAccess()` is request-cached, so the agency half costs nothing
 * beyond what the layout already paid. `getViewAsBannerInfo()` is consulted
 * only when there is no agency identity, because that is the only case where it
 * can change the answer: a live view-as always resolves to a non-null agency or
 * creator identity, and a real agency is not the internal operator.
 */
const resolveAccess = cache(async (): Promise<ChannelAccess> => {
  const agency = await getDashboardAccess();
  if (agency) return channelAccess({ hasAgency: true, hasViewAs: false });
  return channelAccess({ hasAgency: false, hasViewAs: !!(await getViewAsBannerInfo()) });
});

/**
 * The scope for this request.
 *
 * `access` may be passed in when the caller has already resolved the same
 * facts — `app/layout.tsx` has, because it needs them for the shell — so the
 * layout does not resolve the view-as identity a second time on every page.
 */
export async function resolveChannelScope(access?: ChannelAccess): Promise<ChannelScope> {
  const pathname = (await headers()).get("x-pathname") ?? null;
  const channel = channelForPath(pathname);
  const resolved = access ?? (await resolveAccess());
  return {
    pathname,
    channel,
    definition: channelDefinition(channel),
    access: resolved,
    allowed: allowedChannels(resolved),
  };
}

/**
 * A route declaring its own channel, and refusing to render when this request
 * may not have it.
 *
 * `declared` is the channel the route file belongs to, so a route served at a
 * path belonging to a different channel is a mismatch rather than a silent one.
 * There is no `x-pathname` in the isolated preview harness, which sets up no
 * middleware, so the path check is skipped when it is absent — and the preview
 * does not mount these routes in any case.
 */
export async function requireChannel(declared: DashboardChannel): Promise<ChannelScope> {
  const scope = await resolveChannelScope();
  if (scope.pathname && scope.channel !== declared) notFound();
  if (!channelVerdict(declared, scope.access).allowed) notFound();
  return scope;
}

/**
 * The combined overview is a new operator surface rather than an existing
 * dashboard route, so it is gated on the operator directly: it cannot borrow
 * `all`'s "everybody has the dashboard" allowance.
 */
export async function requireOperatorSurface(): Promise<ChannelScope> {
  const scope = await resolveChannelScope();
  if (!scope.access.isOperator) notFound();
  return scope;
}
