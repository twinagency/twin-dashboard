import BMemoryPanel from "@/components/onlyfans-launch/memory/BMemoryPanel";
import { NextResponse } from "next/server";
import { requireOnlyFansRead } from "@/lib/onlyfans/route";

export const dynamic = "force-dynamic";
export default async function MemoryPage() {
  const context = await requireOnlyFansRead({ agency: true });
  const canManage = !(context instanceof NextResponse) && context.canManage;
  return <BMemoryPanel canManage={canManage} />;
}
