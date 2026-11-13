import { cloneBotToken } from "@/lib/clone-credentials";
import { requireCloneAccess } from "@/lib/dashboard-access";
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
type CloneInfo = { id: string; name: string; slug: string };
const DB_DOWN = "Database unavailable.";
async function resolveConnection(cloneId: string): Promise<
  | { ok: true; token: string; bcid: string; clone: CloneInfo }
  | { ok: false; status: number; unavailable?: true; error: string; clone?: CloneInfo }
> {
  const { data: clone, error: cloneError } = await supabaseAdmin
    .from("clones")
    .select("id,name,slug")
    .eq("id", cloneId)
    .maybeSingle();
  if (cloneError) return { ok: false, status: 502, unavailable: true, error: DB_DOWN };
  const c = clone as CloneInfo | null;
  if (!c) return { ok: false, status: 404, error: "Clone not found." };
  const cloneInfo = { id: c.id, name: c.name, slug: c.slug };
  // Access was checked before this ran, so a throw here is the bot_token read failing, not a sign-in problem.
  let token: string | null;
  try { token = await cloneBotToken(cloneId); } catch { return { ok: false, status: 502, unavailable: true, error: DB_DOWN, clone: cloneInfo }; }
  if (!token) return { ok: false, status: 200, clone: cloneInfo, error: "This clone has no bot token." };

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("business_connection_id")
    .eq("clone_id", cloneId)
    .not("business_connection_id", "is", null)
    .order("last_message_received", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (userError) return { ok: false, status: 502, unavailable: true, error: DB_DOWN, clone: cloneInfo };
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

  // Outside resolveConnection's catch on purpose: a denied or expired session stays dashboardReader's 403, and no clone
  // is read for a caller who may not see it.
  await requireCloneAccess(cloneId);
  const resolved = await resolveConnection(cloneId);
  if (!resolved.ok) {
    const { status, unavailable, error, clone } = resolved;
    return NextResponse.json({ connected: false, ...(unavailable && { unavailable }), error, clone: clone ?? null }, { status });
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
