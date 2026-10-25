"use client";

import Link from "@/components/NavigationLink";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { usePathname, useSearchParams } from "next/navigation";
import {
  workspaceChannel,
  offeredChannels,
  shouldShowChannelSwitch,
  type DashboardChannel,
} from "@/lib/channel-nav";

// Every authorized workspace stays visible, with one route-driven active state.
export default function ChannelSwitch({
  className = "",
  channels,
}: {
  className?: string;
  channels?: DashboardChannel[];
}) {
  const pathname = usePathname();
  const { audience, agencyName } = useDashboardAccess();
  const searchParams = useSearchParams();
  const allowed = channels ?? ["all"];
  // Moxy's Telegram tools already use agency-scoped routes. Link to those,
  // without granting access to the operator-only /telegram roster.
  const moxyTelegram = audience === "agency" && agencyName?.trim().toLowerCase() === "moxy" && !!channels?.includes("all");
  const visibleChannels: DashboardChannel[] = moxyTelegram ? [...allowed, "telegram"] : allowed;
  const active = workspaceChannel(pathname, searchParams.get("workspace"), audience === "admin" || moxyTelegram);
  const offered = offeredChannels(visibleChannels);

  if (!shouldShowChannelSwitch(visibleChannels)) return null;

  return (
    <div
      role="group"
      aria-label="Channel workspace"
      data-channel-switch={active}
      className={"workspace-channel-list " + className}
    >
      {offered.map((channel) => (
        <Link
          key={channel.channel}
          href={channel.channel === "all" && audience === "agency" ? "/revenue" : channel.channel === "telegram" && moxyTelegram ? "/revenue?workspace=telegram" : channel.href}
          aria-current={channel.channel === active ? "page" : undefined}
          title={channel.summary}
          data-channel-option={channel.channel}
          className="workspace-channel-option"
        >
          {channel.channel === "all" ? (
            <svg className="workspace-channel-logo" aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="2" />
              <rect x="14" y="3" width="7" height="7" rx="2" />
              <rect x="3" y="14" width="7" height="7" rx="2" />
              <rect x="14" y="14" width="7" height="7" rx="2" />
            </svg>
          ) : (
            <img className="workspace-channel-logo" src={"/brand/platforms/" + channel.channel + ".svg"} width="28" height="28" alt="" />
          )}
          <span>{channel.label}</span>
        </Link>
      ))}
    </div>
  );
}
