import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";
import { NextResponse } from "next/server";
import { requireOnlyFansRead } from "@/lib/onlyfans/route";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { listConnectionCreators } from "@/lib/onlyfans/connection-creators";

// The OnlyFans accounts. One creator can run several; each keeps its own
// connection health, conversations, fans and money.
export default async function OnlyFansAccountsPage() {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return <div className="dashboard-page"><h1 className="text-2xl font-semibold">Accounts</h1><p role="status" className="mt-3 text-sm text-muted">Your session cannot read these accounts. Sign in again.</p></div>;
  const connectionsConfigured = ctx.canManage && !!configuredConnectionBackend();
  const connectionCreators = connectionsConfigured ? await listConnectionCreators() : [];
  return <OnlyFansWorkspace view="accounts" source="server" canManage={ctx.canManage} agencyViewer={ctx.auth.agency} connectionsConfigured={connectionsConfigured} connectionCreators={connectionCreators} />;
}
