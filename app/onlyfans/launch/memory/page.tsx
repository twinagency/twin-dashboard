import BMemoryPanel from "@/components/onlyfans-launch/memory/BMemoryPanel";
import { NextResponse } from "next/server";
import { requireOnlyFansRead } from "@/lib/onlyfans/route";
import { internalOperator } from "@/lib/onlyfans/reads";

export const dynamic = "force-dynamic";
export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const initialAccountId = (await searchParams).account;
  const context = await requireOnlyFansRead({ agency: true });
  const canManage = !(context instanceof NextResponse) && context.canChat;
  const canRecover = !(context instanceof NextResponse) && context.canManage;
  // Same predicate that sets cost=true on the memory routes, so "Model cost unavailable." never shows to an agency.
  const operator = !(context instanceof NextResponse) && internalOperator(context.auth);
  return <BMemoryPanel canManage={canManage} canRecover={canRecover} operator={operator} initialAccountId={initialAccountId} />;
}
