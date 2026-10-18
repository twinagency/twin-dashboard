"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  channelForPath,
  offeredChannels,
  shouldShowChannelSwitch,
  type DashboardChannel,
} from "@/lib/channel-nav";

// The top-level channel switch: All channels / Telegram / OnlyFans.
//
// One Twin CRM with three transports, so this is a scope selector inside the
// product, not a switcher between products. It is route-driven — each channel
// has a real, bookmarkable path — so the control and the URL can never
// disagree, and the sidebar, the breadcrumb and the page all derive the channel
// from the same place (`lib/channel-nav.ts`).
//
// Styling is the dashboard's own segmented control (`CurrencyToggle`'s
// non-compact variant): `gap-1 rounded-lg bg-muted/10 p-1`, active
// `bg-muted/15 text-ink shadow-sm`. No new visual language.

export default function ChannelSwitch({
  className = "",
  channels,
}: {
  className?: string;
  /**
   * Which channels to offer, from the server's channel scope
   * (`lib/channel-scope.ts`).
   *
   * The default is "no channel switch": a caller that has not been told which
   * channels this session may open gets exactly the bar this feature found, so
   * forgetting the prop cannot hand a channel workspace to a surface that
   * should not have one. The dashboard and the isolated preview both pass an
   * explicit list.
   */
  channels?: DashboardChannel[];
}) {
  const pathname = usePathname();
  const active = channelForPath(pathname);
  const allowed = channels ?? ["all"];
  const offered = offeredChannels(allowed);

  // A switch with nothing to switch to is a control that does nothing. Below two
  // options the bar renders exactly as it did before this feature existed, which
  // is what a session with no channel workspace should see.
  if (!shouldShowChannelSwitch(allowed)) return null;

  return (
    <div
      role="group"
      aria-label="Channel workspace"
      data-channel-switch={active}
      className={"inline-flex gap-1 rounded-lg bg-muted/10 p-1 text-xs " + className}
    >
      {offered.map((channel) => {
        const selected = channel.channel === active;
        return (
          <Link
            key={channel.channel}
            href={channel.href}
            aria-current={selected ? "page" : undefined}
            aria-pressed={selected}
            title={channel.summary}
            className={
              "whitespace-nowrap rounded-md px-3 py-1 font-semibold transition " +
              (selected ? "bg-muted/15 text-ink shadow-sm" : "text-muted hover:text-ink")
            }
          >
            {channel.label}
          </Link>
        );
      })}
    </div>
  );
}
