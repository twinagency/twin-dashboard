import LiveDashboardOverview from "./dashboard/LiveDashboardOverview";
import CombinedEarnings from "./CombinedEarnings";
import { getFleetClones } from "@/lib/query-cache";

export default async function AllChannelsDashboard() {
  const clones = await getFleetClones();
  return <div className="min-w-0" data-all-channels-dashboard>
    <section className="dashboard-page" aria-label="Earnings across channels"><CombinedEarnings embedded /></section>
    <LiveDashboardOverview cloneId={null} clones={clones} combined />
  </div>;
}
