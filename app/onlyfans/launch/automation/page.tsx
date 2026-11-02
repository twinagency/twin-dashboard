import BAutomationPanel from "@/components/onlyfans-launch/automation/BAutomationPanel";
import { NextResponse } from "next/server";
import { requireOnlyFansRead } from "@/lib/onlyfans/route";

export const dynamic = "force-dynamic";
export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const initialAccountId = (await searchParams).account;
  const context = await requireOnlyFansRead({ agency: true });
  const canManage = !(context instanceof NextResponse) && context.canManage;
  return <BAutomationPanel canManage={canManage} initialAccountId={initialAccountId} />;
}
