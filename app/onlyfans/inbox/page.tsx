import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";
import { NextResponse } from "next/server";
import { requireOnlyFansRead } from "@/lib/onlyfans/route";
export default async function OnlyFansInboxPage() {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return <div className="dashboard-page" role="status">Sign in to access your assigned accounts.</div>;
  return <OnlyFansWorkspace view="inbox" source="server" canManage={ctx.canManage} agencyViewer={ctx.auth.agency} />;
}
