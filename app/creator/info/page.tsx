import Link from "next/link";
import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function CreatorInfoPage() {
  const identity = await requireCreatorDashboard();
  return <div className="dashboard-page text-ink"><h1 className="mb-5 text-2xl font-semibold">Creator info</h1><Card><CardHeader><CardTitle>Your creator account</CardTitle></CardHeader><CardContent><dl className="divide-y divide-line text-sm">{[["Creator", identity.displayName], ["Clone", identity.cloneName || "Awaiting connection"], ["Agency", identity.name], ["Status", identity.cloneStatus || "Onboarding submitted"]].map(([label, value]) => <div key={label} className="flex justify-between gap-5 py-4"><dt className="text-muted">{label}</dt><dd className="font-medium capitalize">{value}</dd></div>)}</dl><div className="mt-5 flex flex-wrap gap-4"><Link href="/creator/onboarding" className="font-medium text-accent hover:underline">View onboarding</Link><Link href="/creator/business" className="font-medium text-accent hover:underline">Business connection</Link></div></CardContent></Card></div>;
}
