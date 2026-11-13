import { NextResponse } from "next/server";
import PlanCConsole from "@/components/onlyfans-preview/PlanCConsole";
import { CreatorPlatformEmpty, CreatorPlatformHeading } from "@/components/onlyfans-preview/CreatorPlatformPage";
import { requireOnlyFansRead, requestId } from "@/lib/onlyfans/route";
import { planCKeyScope, planCOperatorOnly } from "@/lib/onlyfans/plan-c-route";
import { configuredPlanCBackend } from "@/lib/onlyfans/plan-c-backend";

export const dynamic = "force-dynamic";

/** Plan C supervised approvals. Operator only: agency, view-as and read-only sessions get no controls. */
export default async function PlanCPage({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const description = "Monitor this pilot, its delivery receipts and any unresolved work.";
  const unavailable = (message: string) => <div className="dashboard-page"><CreatorPlatformHeading title="Plan C approvals" description={description} /><CreatorPlatformEmpty title="Plan C approvals are unavailable." description={message} /></div>;
  const ctx = await requireOnlyFansRead({ agency: false, pilotIdentity: true });
  if (ctx instanceof NextResponse) return unavailable("Your session cannot open this page. Sign in as the operator.");
  const operator = planCOperatorOnly(ctx);
  if (!operator.ok) return unavailable("Plan C is available to the configured administrator only.");
  const backend = configuredPlanCBackend();
  if (!backend) return unavailable("The pilot backend is not configured.");
  const requested = await searchParams;
  // Only an absent ?account= falls back to the configured pilot; a malformed (array) one is refused, never silently replaced.
  const rawAccount = requested.account === undefined ? process.env.ONLYFANS_PLAN_C_ACCOUNT : typeof requested.account === "string" ? requested.account : null;
  const accountId = requestId(rawAccount);
  if (!accountId) return unavailable("Select the configured pilot account.");
  // Gated on pilot scope alone: a failing draft read must not take STOP away. The console shows its own draft error.
  const scope = await backend.scope(accountId, operator.actor);
  if (!scope.ok) return unavailable(scope.status === 502 || scope.status === 503 ? "Pilot configuration is unavailable. Retry." : "This pilot account is not available to this session.");
  return <div className="dashboard-page">
    <CreatorPlatformHeading title={scope.data.authorizationMode === "autonomous" ? "Pilot monitoring" : "Plan C approvals"} description={description} />
    <p className="mb-3 text-sm text-muted" data-plan-c-account>Account {accountId}</p>
    <PlanCConsole accountId={accountId} operatorScope={planCKeyScope(operator.actor)} sessionScope={ctx.actor ? planCKeyScope(ctx.actor) : undefined}
      canAct={ctx.canManage} authorizationMode={scope.data.authorizationMode} />
  </div>;
}
