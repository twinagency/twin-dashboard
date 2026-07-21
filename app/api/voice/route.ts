import dns from "node:dns";
import net from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Streams a sent voice note back for the /users inbox player: Bot API getFile on
// the tg_file_id stored in chat_history.meta (migration 030) → stream the OGG.
// Zero storage cost — Telegram keeps the bytes, we just proxy them.
// This machine's IPv6 is dead — same two-line fix as src/index.ts (ipv4first
// alone is NOT enough, Happy-Eyeballs still races onto the dead route).
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

export const runtime = "nodejs";

// `${cloneId}:${fileId}` → audio bytes (or null = fetch failed). A voice note is
// immutable per file_id, so 1h in memory is safe and saves Telegram round-trips.
const cache = new Map<string, { at: number; body: ArrayBuffer | null; type: string }>();
const TTL = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const clone = req.nextUrl.searchParams.get("clone");
  const file = req.nextUrl.searchParams.get("file");
  if (!clone || !file) return new NextResponse("missing params", { status: 400 });

  const key = `${clone}:${file}`;
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
    const info = await (await fetch(`${api}/getFile?file_id=${encodeURIComponent(file)}`)).json();
    const path = info?.result?.file_path;
    if (!path) throw new Error("no file path");
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!res.ok) throw new Error(`file fetch ${res.status}`);
    const body = await res.arrayBuffer();
    // Telegram serves voice notes as .oga (OGG/Opus) but often with a generic
    // content-type — pin audio/ogg so <audio> always knows what it's playing.
    const type = "audio/ogg";
    cache.set(key, { at: Date.now(), body, type });
    return new NextResponse(body, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch {
    cache.set(key, { at: Date.now(), body: null, type: "" });
    return new NextResponse(null, { status: 404 });
  }
}
