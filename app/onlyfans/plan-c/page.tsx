import { NextResponse } from "next/server";
import PlanCConsole from "@/components/onlyfans-preview/PlanCConsole";
import { CreatorPlatformEmpty, CreatorPlatformHeading } from "@/components/onlyfans-preview/CreatorPlatformPage";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { planCOperatorOnly } from "@/lib/onlyfans/plan-c-route";
import { configuredPlanCBackend } from "@/lib/onlyfans/plan-c-backend";

export const dynamic = "force-dynamic";

/** Plan C supervised approvals. Operator only: agency, view-as and read-only sessions get no controls. */
export default async function PlanCPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const description = "Review each drafted reply or offer exactly as it would be sent. Nothing is sent until you approve it.";
  const unavailable = (message: string) => <div className="dashboard-page"><CreatorPlatformHeading title="Plan C approvals" description={description} /><CreatorPlatformEmpty title="Plan C approvals are unavailable." description={message} /></div>;
  const ctx = await requireOnlyFansRead({ agency: false, pilotIdentity: true });
  if (ctx instanceof NextResponse) return unavailable("Your session cannot open this page. Sign in as the operator.");
  const operator = planCOperatorOnly(ctx);
  if (!operator.ok) return unavailable("Plan C is available to the configured administrator only.");
  const backend = configuredPlanCBackend();
  if (!backend) return unavailable("The pilot backend is not configured.");
  const requested = await searchParams;
  const rawAccount = typeof requested.account === "string" ? requested.account : process.env.ONLYFANS_PLAN_C_ACCOUNT;
  const accountId = requestId(rawAccount);
  if (!accountId) return unavailable("Select the configured pilot account.");
  const access = await backend.drafts(accountId, operator.actor);
  if (!access.ok) return unavailable("This pilot account is not available to this session.");
  return <div className="dashboard-page">
    <CreatorPlatformHeading title="Plan C approvals" description={description} />
    <p className="mb-3 text-sm text-muted" data-plan-c-account>Account {accountId}</p>
    <PlanCConsole accountId={accountId} canAct={ctx.canManage} />
  </div>;
}
