import { cloneBotToken } from "@/lib/clone-credentials";
import { getDashboardAccess, requireCloneAccess } from "@/lib/dashboard-access";
import { dashboardReader } from "@/lib/dashboard-reader";
import dns from "node:dns";
import net from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Real fan profile pics via Bot API getUserProfilePhotos → getFile → stream.
// 404 when the fan has no pic or privacy-blocks it — the frontend falls back
// to an initials circle (no placeholder-face services, per Ronan).
// This machine's IPv6 is dead — same two-line fix as src/index.ts (ipv4first
// alone is NOT enough, Happy-Eyeballs still races onto the dead route).
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

export const runtime = "nodejs";

// telegramId → { body, type } or null (no pic). In-memory, 1h.
const cache = new Map<string, { at: number; body: ArrayBuffer | null; type: string }>();
const TTL = 60 * 60 * 1000;

async function read(req: NextRequest) {
  const clone = req.nextUrl.searchParams.get("clone");
  const tg = req.nextUrl.searchParams.get("tg");
  if (!clone || !tg) return new NextResponse("missing params", { status: 400 });

  await requireCloneAccess(clone);
  if (await getDashboardAccess()) {
    const {data,error}=await supabaseAdmin.from("users").select("id").eq("clone_id",clone).eq("telegram_id",tg).limit(1).maybeSingle();
    if(error || !data) return new NextResponse("Not found",{status:404});
  }
  const key = `${clone}:${tg}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    if (!hit.body) return new NextResponse(null, { status: 404 });
    return new NextResponse(hit.body, { headers: { "content-type": hit.type, "cache-control": "private, max-age=3600" } });
  }

  const token = await cloneBotToken(clone);
  if (!token) return new NextResponse("no clone", { status: 404 });

  try {
    const api = `https://api.telegram.org/bot${token}`;
    const photos = await (await fetch(`${api}/getUserProfilePhotos?user_id=${tg}&limit=1`)).json();
    const sizes: { file_id: string }[] | undefined = photos?.result?.photos?.[0];
    // Middle size (~320px) is plenty for a 24px avatar; last = largest.
    const fileId = sizes?.[Math.min(1, (sizes?.length ?? 1) - 1)]?.file_id;
    if (!fileId) throw new Error("no photo");
    const file = await (await fetch(`${api}/getFile?file_id=${fileId}`)).json();
    const path = file?.result?.file_path;
    if (!path) throw new Error("no file path");
    const img = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!img.ok) throw new Error(`file fetch ${img.status}`);
    const body = await img.arrayBuffer();
    const type = img.headers.get("content-type") ?? "image/jpeg";
    cache.set(key, { at: Date.now(), body, type });
    return new NextResponse(body, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch {
    cache.set(key, { at: Date.now(), body: null, type: "" });
    return new NextResponse(null, { status: 404 });
  }
}


export const GET = dashboardReader(read);
