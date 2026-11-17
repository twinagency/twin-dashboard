import PayoutDashboard from "@/components/PayoutDashboard";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { payoutBrand } from "@/lib/payouts/model";
import { flirtLayoutEnabled } from "@/lib/flirt-layout";
export const dynamic = "force-dynamic";
export default async function CreatorPayoutsPage() {
  const creator = await requireCreatorWorkspace();
  return <PayoutDashboard audience="creator" brand={payoutBrand(creator.name)} bankDetails={flirtLayoutEnabled(creator.accountId)} />;
}
