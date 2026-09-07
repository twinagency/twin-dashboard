import { dashboardReader } from "@/lib/dashboard-reader";
import { NextRequest, NextResponse } from "next/server";
import { getCloneScope } from "@/lib/clone-scope";
import { getCachedRevenueWhyChanged } from "@/lib/revenue-why-changed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// This stays under the ordinary session-gated `/api/dashboard` prefix. It is
// deliberately not part of the public revenue API: buyer concentration and the
// names behind an unusual payment are operator-only information.
async function read(req: NextRequest) {
  const day = req.nextUrl.searchParams.get("date");
  if (!day) return NextResponse.json({ error: "date is required" }, { status: 400 });

  try {
    // Do not take a clone id from the browser. The same signed scope cookie that
    // rendered the page defines this response, so a URL edit cannot make an
    // individual-clone view explain a different clone's buyers.
    const cloneId = await getCloneScope();
    return NextResponse.json(await getCachedRevenueWhyChanged(day, cloneId), {
      // Buyer identities stay private to the signed-in operator. The server
      // module has its own one-minute single-flight cache, so no browser or
      // proxy cache may retain this response.
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to explain this day";
    const status = /date|Choose today/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}


export const GET = dashboardReader(read);
