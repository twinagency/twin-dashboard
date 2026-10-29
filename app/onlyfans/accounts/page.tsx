import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";
import { CreatorHubProvider } from "@/components/onlyfans-preview/CreatorHub";
import { NextResponse } from "next/server";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { configuredConnectionBackend } from "@/lib/onlyfans-connections/backend";
import { listConnectionCreators } from "@/lib/onlyfans/connection-creators";
import { hubPeriod, loadHubEarnings } from "@/lib/onlyfans/creator-hub";

export const dynamic = "force-dynamic";
// The OnlyFans accounts. One creator can run several; each keeps its own
// connection health, conversations, fans and money.
export default async function OnlyFansAccountsPage({ searchParams }: { searchParams: Promise<{ creator?: string | string[]; account?: string | string[]; period?: string | string[] }> }) {
  const ctx = await requireOnlyFansRead({ agency: true });
  if (ctx instanceof NextResponse) return <div className="dashboard-page"><h1 className="text-2xl font-semibold">Creators</h1><p role="status" className="mt-3 text-sm text-muted">Your session cannot read these accounts. Sign in again.</p></div>;
  const connectionsConfigured = ctx.canManage && !!configuredConnectionBackend();
  const connectionCreators = connectionsConfigured ? await listConnectionCreators() : [];
  // Earnings are read only when one creator or account is requested; the combined list needs none.
  const query = await searchParams;
  const selected = [query.creator, query.account].some(value => typeof value === "string" && requestId(value));
  const period = hubPeriod(query.period);
  const hub = selected ? await loadHubEarnings(ctx.backend, period) : { earnings: null, error: null };
  return <CreatorHubProvider data={{ ...hub, period }}><OnlyFansWorkspace view="accounts" source="server" canManage={ctx.canManage} agencyViewer={ctx.auth.agency} connectionsConfigured={connectionsConfigured} connectionCreators={connectionCreators} /></CreatorHubProvider>;
}
