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

export async function GET(req: NextRequest) {
  const clone = req.nextUrl.searchParams.get("clone");
  const tg = req.nextUrl.searchParams.get("tg");
  if (!clone || !tg) return new NextResponse("missing params", { status: 400 });

  const key = `${clone}:${tg}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    if (!hit.body) return new NextResponse(null, { status: 404 });
    return new NextResponse(hit.body, { headers: { "content-type": hit.type, "cache-control": "private, max-age=3600" } });
  }

  const { data: row } = await supabaseAdmin.from("clones").select("bot_token").eq("id", clone).maybeSingle();
  const token = (row as { bot_token?: string } | null)?.bot_token;
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
