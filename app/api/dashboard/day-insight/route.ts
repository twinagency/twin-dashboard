import { dashboardReader } from "@/lib/dashboard-reader";
import { NextRequest, NextResponse } from "next/server";
import { getCloneScope } from "@/lib/clone-scope";
import { getCachedRevenueWhyChanged } from "@/lib/revenue-why-changed";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { creatorShare } from "@/lib/creator-share";
import { isZaneDemo } from "@/lib/creator-demo-policy";
import { creatorDemoInsight } from "@/lib/creator-demo-data";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function read(req: NextRequest) {
  const day = req.nextUrl.searchParams.get("date");
  if (!day) return NextResponse.json({ error: "date is required" }, { status: 400 });
  try {
    if (isZaneDemo(await getDashboardAccess())) return NextResponse.json(creatorDemoInsight(day), { headers: { "Cache-Control": "private, no-store", "X-Data-Mode": "synthetic-demo" } });
    // Not yet scaled to the creator's share, so it must not show full earnings.
    if (creatorShare(await getDashboardAccess()) < 1) return NextResponse.json({ error: "Day detail is unavailable for this account" }, { status: 403 });
    const cloneId = await getCloneScope();
    return NextResponse.json(await getCachedRevenueWhyChanged(day, cloneId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : "failed to explain this day"; return NextResponse.json({ error: message }, { status: /date|Choose today/i.test(message) ? 400 : 500 }); }
}
export const GET = dashboardReader(read);
