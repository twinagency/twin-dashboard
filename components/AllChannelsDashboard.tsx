import ChannelCreatorRoster from "./ChannelCreatorRoster";
import CombinedEarnings from "./CombinedEarnings";
import { loadChannelRoster } from "@/lib/channel-workspace/roster";
export default async function AllChannelsDashboard() {
  const roster = await loadChannelRoster("all");
  return <div className="dashboard-page min-w-0 space-y-8" data-all-channels-dashboard><ChannelCreatorRoster roster={roster} channel="all" /><CombinedEarnings embedded /></div>;
}
