import ChannelCreatorRoster from "./ChannelCreatorRoster";
import CombinedEarnings from "./CombinedEarnings";
import LiveDashboardOverview from "./dashboard/LiveDashboardOverview";
import { loadChannelRoster } from "@/lib/channel-workspace/roster";
import { getFleetClones } from "@/lib/query-cache";
import { getCloneScope } from "@/lib/clone-scope";

export default async function AllChannelsDashboard() {
  const [roster, clones, cloneId] = await Promise.all([loadChannelRoster("all"), getFleetClones(), getCloneScope()]);
  return <div className="min-w-0" data-all-channels-dashboard>
    <LiveDashboardOverview key={cloneId ?? "all"} cloneId={cloneId} clones={clones} />
    <section className="dashboard-page min-w-0 space-y-8" aria-label="All-channel creators and earnings">
      <ChannelCreatorRoster roster={roster} channel="all" />
      <CombinedEarnings embedded />
    </section>
  </div>;
}
