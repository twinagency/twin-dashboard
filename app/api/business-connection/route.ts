import { cloneBotToken } from "@/lib/clone-credentials";
import { dashboardReader } from "@/lib/dashboard-reader";
import dns from "node:dns";
import net from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// READ-ONLY info panel support. Shows the Telegram Business account connected
// to a clone's bot: name/username/id, granted rights (as information only),
// and whether the connection is live. No mutation methods live here — see
// app/info/BusinessConnectionCard.tsx for the panel and the deleted
// app/api/business-account/route.ts (git history) for the editing version
// this intentionally does NOT restore.
//
// This machine's IPv6 route is dead (same fix as api/avatar, api/send).
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// business_connection_id isn't stored on the clone row — the bot only ever
// sees it arrive per fan message and stores it per `users` row. One clone has
// one connected business account, so any one non-null value observed
// recently is enough to ask Telegram for the CURRENT live connection state.
async function resolveConnection(cloneId: string): Promise<
  | { ok: true; token: string; bcid: string; clone: { id: string; name: string; slug: string } }
  | { ok: false; status: number; error: string; clone?: { id: string; name: string; slug: string } }
> {
  const { data: clone } = await supabaseAdmin
    .from("clones")
    .select("id,name,slug,bot_token")
    .eq("id", cloneId)
    .maybeSingle();
  const c = clone as { id: string; name: string; slug: string; bot_token?: string } | null;
  const token = await cloneBotToken(cloneId);
  if (!c || !token) return { ok: false, status: 404, error: "Clone not found." };
  const cloneInfo = { id: c.id, name: c.name, slug: c.slug };

  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("business_connection_id")
    .eq("clone_id", cloneId)
    .not("business_connection_id", "is", null)
    .order("last_message_received", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const bcid = (userRow as { business_connection_id?: string } | null)?.business_connection_id;
  if (!bcid) {
    return {
      ok: false,
      status: 200,
      clone: cloneInfo,
      error:
        "No business connection observed yet for this clone. It shows up after she connects the bot as her Telegram Business chatbot and it receives at least one message through it.",
    };
  }
  return { ok: true, token, bcid, clone: cloneInfo };
}

async function read(req: NextRequest) {
  const cloneId = req.nextUrl.searchParams.get("cloneId");
  if (!cloneId) return NextResponse.json({ error: "missing cloneId" }, { status: 400 });

  const resolved = await resolveConnection(cloneId);
  if (!resolved.ok) {
    return NextResponse.json({ connected: false, error: resolved.error, clone: resolved.clone ?? null }, { status: 200 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${resolved.token}/getBusinessConnection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_connection_id: resolved.bcid }),
    });
    const j = await res.json();
    if (!j.ok) {
      const error = j.description ?? `getBusinessConnection failed (${res.status})`;
      // Only a 400 is Telegram saying the connection is gone. A 5xx, 429 or
      // auth failure is Telegram being unreachable, not her disconnecting.
      if (res.status === 400) return NextResponse.json({ connected: false, error, clone: resolved.clone }, { status: 200 });
      throw new Error(error);
    }
    const conn = j.result;
    return NextResponse.json({
      connected: true,
      clone: resolved.clone,
      isEnabled: !!conn.is_enabled,
      businessConnectionId: resolved.bcid,
      rights: conn.rights ?? {},
      account: {
        id: conn.user?.id ?? null,
        firstName: conn.user?.first_name ?? null,
        lastName: conn.user?.last_name ?? null,
        username: conn.user?.username ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ connected: false, unavailable: true, error: msg, clone: resolved.clone }, { status: 502 });
  }
}


export const GET = dashboardReader(read);
