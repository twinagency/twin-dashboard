import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { activeViewAs } from "@/lib/view-as";
import { getCloneScope } from "@/lib/clone-scope";
import { getFleetClones } from "@/lib/query-cache";
import LiveDashboardOverview from "@/components/dashboard/LiveDashboardOverview";
import RevenueTooltipFix from "@/components/RevenueTooltipFix";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!await hasInternalAdminAccess()) redirect("/twin");
  if (await activeViewAs(await cookies())) redirect("/revenue");
  const [cloneId, clones] = await Promise.all([getCloneScope(), getFleetClones()]);
  return <><RevenueTooltipFix /><LiveDashboardOverview key={cloneId ?? "all"} cloneId={cloneId} clones={clones} /></>;
}
