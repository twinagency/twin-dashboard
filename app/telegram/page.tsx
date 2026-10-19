import ChannelCreatorRoster from "@/components/ChannelCreatorRoster";
import { loadChannelRoster } from "@/lib/channel-workspace/roster";
import { requireChannel } from "@/lib/channel-scope";
export const dynamic = "force-dynamic";
export default async function TelegramPage() {
  await requireChannel("telegram");
  return <div className="dashboard-page" data-telegram-workspace><ChannelCreatorRoster channel="telegram" roster={await loadChannelRoster("telegram")} /></div>;
}
