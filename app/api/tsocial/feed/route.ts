import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { corsHeaders, loadFeed, type TsocialDb } from "@/lib/tsocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, no login (exact-path exception in middleware.ts). Returns only the
// feed projection, never any other clones column.
export async function GET() {
  try {
    const feed = await loadFeed(serviceClient() as unknown as TsocialDb);
    return NextResponse.json(feed, { headers: { ...corsHeaders(), "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
  }
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
