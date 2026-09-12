import { dashboardReader } from "@/lib/dashboard-reader";
import { NextRequest, NextResponse } from "next/server";
import { getCloneScope } from "@/lib/clone-scope";
import { getCachedRevenueWhyChanged } from "@/lib/revenue-why-changed";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isZaneDemo } from "@/lib/creator-demo-policy";
import { creatorDemoInsight } from "@/lib/creator-demo-data";
import { isCatDemoRequest } from "@/lib/cat-demo-policy";
import { catDemoInsight } from "@/lib/cat-demo-data";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function read(req: NextRequest) {
  const day = req.nextUrl.searchParams.get("date");
  if (!day) return NextResponse.json({ error: "date is required" }, { status: 400 });
  try {
    const access = await getDashboardAccess();
    if (isZaneDemo(access)) return NextResponse.json(creatorDemoInsight(day), { headers: { "Cache-Control": "private, no-store", "X-Data-Mode": "synthetic-demo" } });
    const requestedClone = req.nextUrl.searchParams.get("clone");
    if (isCatDemoRequest(req.nextUrl.searchParams, access, requestedClone)) return NextResponse.json(catDemoInsight(day), { headers: { "Cache-Control": "private, no-store", "X-Data-Mode": "cat-presentation-demo" } });
    const cloneId = await getCloneScope();
    return NextResponse.json(await getCachedRevenueWhyChanged(day, cloneId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const message = error instanceof Error ? error.message : "failed to explain this day"; return NextResponse.json({ error: message }, { status: /date|Choose today/i.test(message) ? 400 : 500 }); }
}
export const GET = dashboardReader(read);
