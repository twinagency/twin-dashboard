import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { earningsStamp, validEarningsWindow } from "@/lib/onlyfans/earnings";
import { emptyOverviewRevenue, overviewOnlyFansRevenue, unavailableOverviewRevenue } from "@/lib/overview-channel-revenue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = await requireOnlyFansRead({ agency: true });
  if (context instanceof NextResponse) return context;
  const params = request.nextUrl.searchParams;
  const window = { start: params.get("start") ?? "", end: params.get("end") ?? "" };
  if ([...params.keys()].some(key => !["start", "end"].includes(key) || params.getAll(key).length !== 1) ||
      !earningsStamp(window.start) || !earningsStamp(window.end) || Date.parse(window.end) <= Date.parse(window.start)) {
    return NextResponse.json({ error: "Choose one reporting window." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!context.backend?.getEarnings) {
    return NextResponse.json({ error: "OnlyFans earnings could not be read." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const readWindow = { ...window, end: new Date(Math.min(Date.parse(window.end), Date.now())).toISOString() };
  if (Date.parse(readWindow.end) <= Date.parse(readWindow.start)) return NextResponse.json({ error: "Choose a reporting window that has started." }, { status: 400, headers: PRIVATE_HEADERS });
  if (!validEarningsWindow(readWindow)) {
    // Reject unsupported dates without substituting a shorter reporting period.
    const accounts = await context.backend.listAccounts({ creatorId: null });
    const value = accounts.ok && accounts.data.length === 0
      ? emptyOverviewRevenue(window, new Date().toISOString())
      : unavailableOverviewRevenue(window, "That reporting period is outside the supported payment history range.");
    return NextResponse.json(value, { headers: PRIVATE_HEADERS });
  }
  const result = await context.backend.getEarnings(readWindow);
  if (!result.ok) return NextResponse.json({ error: "OnlyFans earnings could not be read." }, { status: result.status, headers: PRIVATE_HEADERS });
  return NextResponse.json({ ...overviewOnlyFansRevenue(result.data), window }, { headers: PRIVATE_HEADERS });
}
