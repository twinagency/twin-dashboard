import { NextRequest, NextResponse } from "next/server";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as dayInsight } from "@/app/api/dashboard/day-insight/route";
import { GET as mediaSign } from "@/app/api/media-sign/route";
import { GET as avatar } from "@/app/api/avatar/route";
import { GET as fx } from "@/app/api/fx/route";
import { GET as businessAccount } from "@/app/api/business-account/route";
import { GET as businessConnection } from "@/app/api/business-connection/route";
import { resolveCreatorDashboardIdentity } from "@/lib/creator-dashboard-access";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { scopeCreatorRequestUrl } from "@/lib/creator-dashboard-policy";
import { redactAgencyData } from "@/lib/agency-query";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const readers: Record<string, (req: NextRequest) => Promise<Response>> = {
  dashboard, "day-insight": dayInsight, "media-sign": mediaSign, avatar, fx,
  "business-account": businessAccount, "business-connection": businessConnection,
};
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string[] }> }) {
  const key = (await params).resource.join("/");
  const reader = readers[key];
  if (!reader) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const identity = await resolveCreatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
    if (!identity) return NextResponse.json({ error: "Please sign in to your creator account." }, { status: 401 });
    if (!identity.ready) return NextResponse.json({ error: "Complete onboarding first." }, { status: 403 });
    let url: URL;
    try { url = scopeCreatorRequestUrl(new URL(req.url), identity.cloneId, identity.accountId); }
    catch { return NextResponse.json({ error: "Creator access denied" }, { status: 403 }); }
    if (!identity.cloneId && !["dashboard", "fx"].includes(key)) return NextResponse.json({ error: "Your clone is not connected yet." }, { status: 409 });
    // Original handlers use the existing mandatory clone filters and per-identity caches.
    // No admin token, agency membership, or unscoped dashboard request is created.
    const response = await withDashboardAccess(identity, () => reader(new NextRequest(url, { headers: req.headers })));
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    if (response.status >= 500) return NextResponse.json({ error: "Unable to load this data. Please refresh." }, { status: response.status, headers });
    if (headers.get("content-type")?.includes("application/json")) {
      headers.delete("content-length");
      return NextResponse.json(redactAgencyData(await response.json()), { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return NextResponse.json({ error: "Creator data is unavailable. Please sign in again." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
}
