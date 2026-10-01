import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/supabase-service";
import { corsHeaders, parseEventBody, rateLimited, TSOCIAL_TOKEN_KEY, verifiedTelegramId } from "@/lib/tsocial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, no login (exact-path exception in middleware.ts). Identity comes only
// from Telegram-signed initData checked against the T-Social bot token.
export async function POST(req: NextRequest) {
  const headers = { ...corsHeaders(), "Cache-Control": "no-store" };
  // Rightmost X-Forwarded-For entry is the one our proxy appended.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ ok: false }, { status: 429, headers });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers }); }
  const ev = parseEventBody(body);
  if (!ev) return NextResponse.json({ ok: false }, { status: 400, headers });
  try {
    const db = serviceClient();
    const { data: setting } = await db.from("app_settings").select("value").eq("key", TSOCIAL_TOKEN_KEY).maybeSingle();
    const telegramId = verifiedTelegramId(ev.initData, (setting?.value as string | undefined) ?? null);
    let cloneId: string | null = null;
    if (ev.cloneSlug) {
      const { data: clone } = await db.from("clones").select("id").eq("slug", ev.cloneSlug).maybeSingle();
      cloneId = (clone?.id as string | undefined) ?? null;
    }
    const { error } = await db.from("tsocial_events").insert({
      kind: ev.kind, telegram_id: telegramId, clone_id: cloneId, post_id: ev.postId, verified: telegramId !== null,
    });
    if (error) return NextResponse.json({ ok: false }, { status: 503, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
