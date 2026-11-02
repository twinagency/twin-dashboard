"use client";

import Link from "@/components/NavigationLink";
import PlatformIcon from "@/components/PlatformIcon";
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
          <PlatformIcon platform={channel.channel === "telegram" || channel.channel === "onlyfans" ? channel.channel : "all"} size={22} className="workspace-channel-logo" />
          <span>{channel.label}</span>
          {moxyTelegram && channel.channel === "onlyfans" && <span className="workspace-channel-new" aria-label="New">New</span>}
        </Link>
      ))}
    </div>
  );
}
