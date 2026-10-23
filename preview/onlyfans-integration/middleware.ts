import { NextResponse, type NextRequest } from "next/server";

/** Synthetic component review may read its two local fixture projections only. */
export function middleware(request: NextRequest) {
  if (process.env.ONLYFANS_UI_FIXTURE === "1") {
    const localRead = ["GET", "HEAD"].includes(request.method) && (
      /^\/api\/onlyfans-configuration\/accounts\/[^/]+\/?$/.test(request.nextUrl.pathname) ||
      /^\/api\/onlyfans-content\/accounts\/[^/]+\/vault\/?$/.test(request.nextUrl.pathname));
    if (!localRead) return NextResponse.json({ error: "Not connected in synthetic UI review. No live reads or writes are performed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/:path*"] };
