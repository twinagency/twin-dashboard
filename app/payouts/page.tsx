import PayoutDashboard from "@/components/PayoutDashboard";
import { redirect } from "next/navigation";
import { requirePayoutViewer } from "@/lib/payouts/server";
export const dynamic = "force-dynamic";
export default async function PayoutsPage() {
  const viewer = await requirePayoutViewer();
  if (viewer.audience === "creator") redirect("/creator/payouts");
  return <PayoutDashboard audience="admin" brand={viewer.brand} />;
}
