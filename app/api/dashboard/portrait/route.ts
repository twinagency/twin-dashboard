import { cookies } from "next/headers";
import sharp from "sharp";
import { hasInternalAdminAccess } from "@/lib/internal-admin";
import { activeViewAs } from "@/lib/view-as";
import { supabaseAdmin } from "@/lib/supabase";
import { dashboardPortraits } from "@/components/dashboard/portraits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const CREATOR = "0328e7b3-a1e5-465a-9a30-c9cf6519cba1";
const cache = new Map<string, { expires: number; bytes: Uint8Array }>();

// Only these reviewed upper-body crops are served. Never return the uncropped
// original, accept an arbitrary storage path, or publish the vault photograph.
export async function GET(request: Request) {
  const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
  if (!await hasInternalAdminAccess() || await activeViewAs(await cookies())) {
    return new Response("Not authorized", { status: 403, headers: privateHeaders });
  }
  const key = new URL(request.url).searchParams.get("image");
  const portrait = dashboardPortraits.find(item => item.key === key);
  if (!portrait) return new Response("Image not found", { status: 404, headers: privateHeaders });
  try {
    let cached = cache.get(portrait.key);
    if (!cached || cached.expires <= Date.now()) {
      const { data: row, error } = await supabaseAdmin.from("photos").select("storage_path")
        .eq("clone_id", CREATOR).eq("id", portrait.id).maybeSingle();
      if (error || !row?.storage_path?.startsWith(`${CREATOR}/photos/`) || row.storage_path.split("/").includes("..")) {
        return new Response("Image unavailable", { status: 404, headers: privateHeaders });
      }
      const source = await supabaseAdmin.storage.from("media").download(row.storage_path);
      if (source.error || !source.data) throw new Error("Photo unavailable");
      // Normalize before applying the visually reviewed pixel bounds. Originals
      // remain untouched in Storage; metadata is not copied to the response.
      const normalized = await sharp(Buffer.from(await source.data.arrayBuffer())).rotate().resize({ width: 1080 }).toBuffer();
      const output = await sharp(normalized).extract(portrait.crop).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      cached = { bytes: new Uint8Array(output), expires: Date.now() + 300_000 };
      cache.set(portrait.key, cached);
    }
    return new Response(cached.bytes as BodyInit, { headers: { ...privateHeaders, "Content-Type": "image/webp" } });
  } catch {
    return new Response("Image unavailable", { status: 503, headers: privateHeaders });
  }
}
