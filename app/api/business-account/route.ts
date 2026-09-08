import { requireManagedClone } from "@/lib/agency-management";
import { trustedFormOrigin } from "@/lib/form-origin";
import { cloneBotToken } from "@/lib/clone-credentials";
import { dashboardReader } from "@/lib/dashboard-reader";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { tgCall, tgUpload, TelegramApiError } from "@/lib/telegram-raw";

// Manage the CONNECTED BUSINESS ACCOUNT itself (her Telegram profile: name,
// username, bio, profile photo, stories) — Bot API 9.0. Distinct from
// app/api/send/route.ts, which messages a specific fan; there is no chatId
// here, only the clone's business_connection_id.
//
// Mechanism: same as api/send — raw fetch against Telegram's Bot API using
// the clone's stored bot_token, because the bot repo is a long-polling
// worker with no HTTP endpoint to call into (see bot/src/index.ts). See
// lib/telegram-raw.ts for the shared fetch helpers.
//
// business_connection_id isn't stored on the clone row anywhere — the bot only
// ever sees it arrive per fan message (src/index.ts business_message handler),
// and stores it per `users` row. Since one clone = one connected business
// account, every fan's stored id should be identical; we just need any one
// non-null value observed recently to call getBusinessConnection / the
// mutation methods, which return the CURRENT live connection + rights, so
// staleness doesn't matter.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BusinessBotRights field required for each action. Telegram's method-prose
// says "can_change_name/can_change_username/can_change_bio" but the actual
// field on a live BusinessConnection.rights object is can_edit_* — verified
// against @grammyjs/types (Bot API 9.0), not guessed. Checked here BEFORE
// calling Telegram so a missing right surfaces as a clear, specific message
// instead of a generic 400 from the API.
const RIGHT_FOR_ACTION: Record<string, { field: string; label: string }> = {
  name: { field: "can_edit_name", label: "change her name" },
  username: { field: "can_edit_username", label: "change her username" },
  bio: { field: "can_edit_bio", label: "change her bio" },
  photo: { field: "can_edit_profile_photo", label: "change her profile photo" },
  removePhoto: { field: "can_edit_profile_photo", label: "remove her profile photo" },
  story: { field: "can_manage_stories", label: "post a story" },
};

const ACTIVE_PERIODS = new Set([21600, 43200, 86400, 172800]);

async function resolveConnection(cloneId: string): Promise<
  | { ok: true; token: string; bcid: string }
  | { ok: false; status: number; error: string }
> {
  const { data: clone } = await supabaseAdmin
    .from("clones")
    .select("id,bot_token")
    .eq("id", cloneId)
    .maybeSingle();
  const token = await cloneBotToken(cloneId);
  if (!token) return { ok: false, status: 404, error: "clone not found" };

  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("business_connection_id")
    .eq("clone_id", cloneId)
    .not("business_connection_id", "is", null)
    .order("last_message_received", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const bcid = (userRow as any)?.business_connection_id as string | undefined;
  if (!bcid) {
    return {
      ok: false,
      status: 409,
      error:
        "No business connection observed yet for this clone. She needs to connect the bot as her Telegram Business chatbot and receive at least one message before this page can find the connection.",
    };
  }
  return { ok: true, token, bcid };
}

// ── GET: connection status + granted rights, for the UI to enable/disable
// each action and explain a missing one before the operator even tries. ────
async function read(req: NextRequest) {
  const cloneId = req.nextUrl.searchParams.get("cloneId");
  if (!cloneId) return NextResponse.json({ error: "missing cloneId" }, { status: 400 });

  const resolved = await resolveConnection(cloneId);
  if (!resolved.ok) return NextResponse.json({ connected: false, error: resolved.error }, { status: 200 });

  try {
    const conn = await tgCall(resolved.token, "getBusinessConnection", { business_connection_id: resolved.bcid });
    // getBusinessConnection doesn't carry bio, but ChatFullInfo does — one
    // extra call against the connection's own chat (conn.user_chat_id) to
    // fill it in so the editor can show CURRENT bio, not a blank box.
    const bio = conn.user_chat_id
      ? await tgCall(resolved.token, "getChat", { chat_id: conn.user_chat_id })
          .then((chat) => chat.bio ?? null)
          .catch(() => null)
      : null;
    return NextResponse.json({
      connected: true,
      isEnabled: !!conn.is_enabled,
      businessConnectionId: resolved.bcid,
      rights: conn.rights ?? {},
      account: {
        id: conn.user?.id ?? null,
        firstName: conn.user?.first_name ?? null,
        lastName: conn.user?.last_name ?? null,
        username: conn.user?.username ?? null,
        bio,
      },
    });
  } catch (e) {
    const msg = e instanceof TelegramApiError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ connected: false, error: msg }, { status: 200 });
  }
}

// ── POST: perform one action (multipart — photo/story actions carry a file). ─
export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return NextResponse.json({error:"Untrusted request origin"},{status:403});
  try {
    const form = await req.formData();
    const cloneId = String(form.get("cloneId") ?? "");
    const action = String(form.get("action") ?? "");
    try { await requireManagedClone(cloneId); } catch { return NextResponse.json({error:"Creator access denied"},{status:403}); }
    if (!cloneId || !action) return NextResponse.json({ error: "cloneId and action are required" }, { status: 400 });
    const rightDef = RIGHT_FOR_ACTION[action];
    if (!rightDef) return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });

    const resolved = await resolveConnection(cloneId);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { token, bcid } = resolved;

    // Proactive permission check — fetch the LIVE connection rights right
    // before acting (rights can change any time from her side; never trust a
    // cached value) and refuse with a clear, specific reason rather than
    // letting Telegram's generic 400 be the only explanation the operator sees.
    const conn = await tgCall(token, "getBusinessConnection", { business_connection_id: bcid }).catch((e) => {
      throw new Error(`could not read the business connection: ${e instanceof Error ? e.message : String(e)}`);
    });
    if (!conn.is_enabled) {
      return NextResponse.json(
        { error: "This business connection is currently disabled on her side. Nothing can be sent or changed until she re-enables it." },
        { status: 409 },
      );
    }
    if (!conn.rights?.[rightDef.field]) {
      return NextResponse.json(
        {
          error: `She hasn't granted this bot permission to ${rightDef.label}. In Telegram: Settings > Telegram Business > Chatbots > Permissions, she needs to turn that on.`,
          permissionDenied: true,
          missingRight: rightDef.field,
        },
        { status: 403 },
      );
    }

    let result: unknown;
    switch (action) {
      case "name": {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        if (!firstName) return NextResponse.json({ error: "first name is required" }, { status: 400 });
        result = await tgCall(token, "setBusinessAccountName", {
          business_connection_id: bcid,
          first_name: firstName,
          last_name: lastName || undefined,
        });
        break;
      }
      case "username": {
        const username = String(form.get("username") ?? "").trim();
        result = await tgCall(token, "setBusinessAccountUsername", {
          business_connection_id: bcid,
          username: username || undefined,
        });
        break;
      }
      case "bio": {
        const bio = String(form.get("bio") ?? "").trim();
        result = await tgCall(token, "setBusinessAccountBio", {
          business_connection_id: bcid,
          bio: bio || undefined,
        });
        break;
      }
      case "photo": {
        const file = form.get("file");
        if (!(file instanceof Blob)) return NextResponse.json({ error: "a photo file is required" }, { status: 400 });
        const isPublic = form.get("isPublic") === "true";
        const bytes = Buffer.from(await file.arrayBuffer());
        result = await tgUpload(
          token,
          "setBusinessAccountProfilePhoto",
          {
            business_connection_id: bcid,
            photo: { type: "static", photo: "attach://profile_photo" },
            is_public: isPublic,
          },
          { field: "profile_photo", bytes, filename: "profile.jpg", mime: file.type || "image/jpeg" },
        );
        break;
      }
      case "removePhoto": {
        const isPublic = form.get("isPublic") === "true";
        result = await tgCall(token, "removeBusinessAccountProfilePhoto", {
          business_connection_id: bcid,
          is_public: isPublic,
        });
        break;
      }
      case "story": {
        const file = form.get("file");
        if (!(file instanceof Blob)) return NextResponse.json({ error: "a photo or video file is required" }, { status: 400 });
        const contentType = form.get("contentType") === "video" ? "video" : "photo";
        const activePeriod = Number(form.get("activePeriod"));
        if (!ACTIVE_PERIODS.has(activePeriod)) {
          return NextResponse.json({ error: "activePeriod must be 6h, 12h, 24h or 48h (in seconds)" }, { status: 400 });
        }
        const caption = String(form.get("caption") ?? "").trim();
        const postToChatPage = form.get("postToChatPage") === "true";
        const bytes = Buffer.from(await file.arrayBuffer());
        const content =
          contentType === "photo"
            ? { type: "photo", photo: "attach://story_file" }
            : { type: "video", video: "attach://story_file" };
        result = await tgUpload(
          token,
          "postStory",
          {
            business_connection_id: bcid,
            content,
            active_period: activePeriod,
            caption: caption || undefined,
            post_to_chat_page: postToChatPage,
          },
          {
            field: "story_file",
            bytes,
            filename: contentType === "photo" ? "story.jpg" : "story.mp4",
            mime: file.type || (contentType === "photo" ? "image/jpeg" : "video/mp4"),
          },
        );
        break;
      }
    }

    // Audit trail — real, consequential identity changes to her live Telegram
    // account. Same reasoning as operator-send (app/api/send/route.ts): fire
    // and forget, never block or fail the action over a logging hiccup.
    void supabaseAdmin
      .from("system_logs")
      .insert({
        level: "info",
        source: "business-account",
        clone_id: cloneId,
        message: `Operator ${rightDef.label} via the business account`,
        detail: { action, result },
      })
      .then(({ error }) => {
        if (error) console.error("business-account: system_logs insert failed (non-fatal):", error.message);
      });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof TelegramApiError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


export const GET = dashboardReader(read);
