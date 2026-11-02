import { dashboardReader } from "@/lib/dashboard-reader";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function read(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const { data, error } = await supabaseAdmin.storage
    .from("media")
    .createSignedUrl(path, 300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl, expiresAt: Date.now() + 300_000 }, { headers: { "Cache-Control": "private, no-store" } });
}


export const GET = dashboardReader(read);
