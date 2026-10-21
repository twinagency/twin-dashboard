import LiveDashboardOverview from "./dashboard/LiveDashboardOverview";
import { getFleetClones } from "@/lib/query-cache";

export default async function AllChannelsDashboard() {
  const clones = await getFleetClones();
  return <div className="min-w-0" data-all-channels-dashboard>
    <LiveDashboardOverview cloneId={null} clones={clones} combined />
  </div>;
}
