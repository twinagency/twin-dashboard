import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/test-run/thumb?path=<storage_path> — signs a real media-library
// storage path (from a photo/video/bundle event, read live off the actual
// clone's library) and redirects to it. A run never uploads anything new to
// Telegram, but the photo/video it "sends" is a real library item, so the
// Test page can show the real thumbnail, not just the caption/price text.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("path");
  if (!p || p.includes("..") || p.length > 300) return new NextResponse("bad path", { status: 400 });
  const { data, error } = await supabaseAdmin.storage.from("media").createSignedUrl(p, 300);
  if (error || !data?.signedUrl) return new NextResponse("not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
