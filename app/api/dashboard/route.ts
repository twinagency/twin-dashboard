import { NextRequest, NextResponse } from "next/server";
import { getDashboard, type Period } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const VALID: Period[] = ["ALL", "6M", "3M", "1M", "2W", "1W", "1D"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("period");
  const period: Period = VALID.includes(p as Period) ? (p as Period) : "1M";
  try {
    const data = await getDashboard(period);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
