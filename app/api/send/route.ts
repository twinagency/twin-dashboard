import dns from "node:dns";
import net from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { orChat } from "@/lib/openrouter";

// Operator sends from the /users inbox, straight through the clone's bot via raw
// Bot API fetch (no grammY dep in the dashboard). Business mode: every send
// carries the fan's business_connection_id (stored on their users row) so the
// message lands in the MAIN chat, exactly like the runtime's TelegramMessenger.
// This machine's IPv6 is dead — same two-line fix as src/index.ts.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same as the runtime's stripDashes: em dashes read as AI-written; never send one.
function stripDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/ ,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function tg(token: string, method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description ?? `Telegram ${method} failed (${res.status})`);
  return j.result;
}

// Multipart variant for raw bytes (media/voice uploads).
async function tgUpload(
  token: string,
  method: string,
  fields: Record<string, string>,
  file: { field: string; bytes: Buffer; filename: string; mime: string },
): Promise<any> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set(file.field, new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description ?? `Telegram ${method} failed (${res.status})`);
  return j.result;
}

// Mirrors src/services/secrets.ts: app_settings row wins, env is the fallback.
// Last resort: the bot runtime's root .env one level up — the dashboard's own
// .env.local doesn't carry the ElevenLabs key, the runtime's does.
async function elevenKey(): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "elevenlabs_api_key").maybeSingle();
  const v = (data as { value?: string } | null)?.value?.trim();
  if (v) return v;
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = fs.readFileSync(path.resolve(process.cwd(), "..", ".env"), "utf8");
    const m = raw.match(/^ELEVENLABS_API_KEY=(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

// ── GET: the clone's media library for the composer's picker ─────────────────
export async function GET(req: NextRequest) {
  const cloneId = req.nextUrl.searchParams.get("cloneId");
  if (!cloneId) return NextResponse.json({ error: "missing cloneId" }, { status: 400 });

  const [photosRes, videosRes] = await Promise.all([
    supabaseAdmin
      .from("photos")
      .select("id,storage_path,image_name,caption,star_value")
      .eq("clone_id", cloneId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("videos")
      .select("id,storage_path,caption,star_value")
      .eq("clone_id", cloneId)
      .order("created_at", { ascending: false }),
  ]);

  const items = [
    ...((photosRes.data ?? []) as any[]).map((p) => ({
      id: p.id,
      type: "photo" as const,
      name: p.image_name || p.caption || "Photo",
      starValue: p.star_value,
      path: p.storage_path,
    })),
    ...((videosRes.data ?? []) as any[]).map((v) => ({
      id: v.id,
      type: "video" as const,
      name: v.caption || "Video",
      starValue: v.star_value,
      path: v.storage_path,
    })),
  ];

  // One signed URL per item so the picker can show real thumbs (5 min is plenty).
  const paths = items.map((i) => i.path);
  const { data: signed } = paths.length
    ? await supabaseAdmin.storage.from("media").createSignedUrls(paths, 300)
    : { data: [] as { signedUrl: string | null }[] };
  const withThumbs = items.map((i, idx) => ({
    id: i.id,
    type: i.type,
    name: i.name,
    starValue: i.starValue,
    thumbUrl: signed?.[idx]?.signedUrl ?? null,
  }));

  return NextResponse.json({ items: withThumbs });
}

// ── POST: send text / media / voice to a fan through the clone's bot ─────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cloneId, userId, type } = body as { cloneId?: string; userId?: string; type?: string };
    if (!cloneId || !userId || !type) {
      return NextResponse.json({ error: "cloneId, userId and type are required" }, { status: 400 });
    }

    const [cloneRes, userRes] = await Promise.all([
      supabaseAdmin
        .from("clones")
        .select("id,bot_token,voice_id,eleven_model,voice_stability,voice_similarity,voice_style,voice_speaker_boost,voice_speed,voice_enhance_model")
        .eq("id", cloneId)
        .maybeSingle(),
      supabaseAdmin
        .from("users")
        .select("id,telegram_id,chat_id,business_connection_id,last_message_received")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const clone = cloneRes.data as any;
    const user = userRes.data as any;
    if (!clone?.bot_token) return NextResponse.json({ error: "clone not found" }, { status: 404 });
    if (!user) return NextResponse.json({ error: "fan not found" }, { status: 404 });

    // Telegram Business bots can only message a fan within 24h of the fan's last
    // activity — outside that window every send would 403 at Telegram anyway, so
    // refuse cleanly up front with a readable reason.
    const lastActive = user.last_message_received ? new Date(user.last_message_received).getTime() : null;
    if (lastActive === null || Date.now() - lastActive > 24 * 3600 * 1000) {
      const agoTxt =
        lastActive === null
          ? "never"
          : `${Math.floor((Date.now() - lastActive) / 3600_000)}h ago`;
      return NextResponse.json(
        { error: `Outside Telegram's 24h messaging window: fan was last active ${agoTxt}` },
        { status: 409 },
      );
    }

    const token = clone.bot_token as string;
    const chatId = user.chat_id ?? user.telegram_id;
    // In Business mode this is mandatory; direct-bot fans have none — omit it then.
    const bcid: Record<string, string> = user.business_connection_id
      ? { business_connection_id: user.business_connection_id }
      : {};

    let historyLine = "";
    // Rich-bubble info for the /users thread (chat_history.meta, migration 030).
    // Additive — the plain-text historyLine is unchanged (it's the AI's memory).
    let historyMeta: Record<string, unknown> | null = null;

    if (type === "text") {
      const text = stripDashes(String(body.text ?? ""));
      if (!text) return NextResponse.json({ error: "empty message" }, { status: 400 });
      await tg(token, "sendMessage", { chat_id: chatId, text, ...bcid });
      historyLine = text;
    } else if (type === "media") {
      const mediaId = String(body.mediaId ?? "");
      const mediaType = body.mediaType === "video" ? "video" : "photo";
      if (!mediaId) return NextResponse.json({ error: "mediaId is required" }, { status: 400 });

      const table = mediaType === "photo" ? "photos" : "videos";
      const { data: item } = await supabaseAdmin
        .from(table)
        .select("id,storage_path,caption,teaser_caption,image_name,telegram_file_id")
        .eq("id", mediaId)
        .eq("clone_id", cloneId)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "media not found" }, { status: 404 });

      const m = item as any;
      const method = mediaType === "photo" ? "sendPhoto" : "sendVideo";
      const field = mediaType === "photo" ? "photo" : "video";
      const caption = m.teaser_caption ? stripDashes(m.teaser_caption) : undefined;

      let sentFileId: string | null = m.telegram_file_id ?? null;
      let msg: any;
      if (m.telegram_file_id) {
        // Cached file_id → no download/upload round-trip.
        msg = await tg(token, method, { chat_id: chatId, [field]: m.telegram_file_id, caption, ...bcid });
      } else {
        const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("media").download(m.storage_path);
        if (dlErr || !blob) throw new Error(dlErr?.message ?? "failed to download media");
        const bytes = Buffer.from(await blob.arrayBuffer());
        msg = await tgUpload(
          token,
          method,
          { chat_id: String(chatId), ...(caption ? { caption } : {}), ...bcid },
          {
            field,
            bytes,
            filename: mediaType === "photo" ? "photo.jpg" : "video.mp4",
            mime: mediaType === "photo" ? "image/jpeg" : "video/mp4",
          },
        );
        // Cache the returned file_id like the runtime does, so the next send skips the upload.
        const fileId =
          mediaType === "photo"
            ? (Array.isArray(msg?.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : null)
            : (msg?.video?.file_id ?? null);
        if (fileId) await supabaseAdmin.from(table).update({ telegram_file_id: fileId }).eq("id", mediaId);
        sentFileId = fileId;
      }

      // Same memory convention as src/flows/media.ts free sends, so she can recall it.
      const shows = m.caption?.trim() || m.image_name?.trim() || "(no description)";
      historyLine = `[sent a FREE (unlocked, no charge) ${mediaType} · shows: ${shows}${caption ? ` · caption: "${caption}"` : ""}]`;
      // Operator sends from the inbox are always free/unlocked.
      historyMeta = {
        type: mediaType,
        media_id: mediaId,
        ...(sentFileId ? { tg_file_id: sentFileId } : {}),
        paid: false,
        stars: 0,
      };
    } else if (type === "voice") {
      const words = stripDashes(String(body.text ?? ""));
      if (!words) return NextResponse.json({ error: "empty message" }, { status: 400 });
      if (!clone.voice_id) return NextResponse.json({ error: "this clone has no ElevenLabs voice_id set" }, { status: 400 });
      const key = await elevenKey();
      if (!key) return NextResponse.json({ error: "no ElevenLabs API key configured" }, { status: 400 });

      // SSML enhancement is a nice-to-have (same as src/services/voice-gen.ts) — if it
      // fails, speak the raw words rather than failing the send.
      let speakText = words;
      try {
        const enhanced = await orChat({
          model: clone.voice_enhance_model,
          system:
            `You enhance dialogue text for the ElevenLabs Multilingual v2 model using punctuation, casing, and SSML break tags to inject rhythm and emotion. The model cannot read bracketed tags, so rely on linguistic cues.\n` +
            `DO: insert <break time="0.5s" /> (up to 3.0s) for natural pauses; use ellipses for trailing off; use double dashes -- for abrupt shifts; use ! and ? to guide pitch; use ALL CAPS for emphasis; vary sentence length.\n` +
            `DO NOT: use square brackets like [laughing]; change the actual words; exceed 3.0s in a break.\n` +
            `Output ONLY the enhanced text with correctly formatted <break time="X.Xs" /> tags. Do not change the words, only punctuation, casing, and breaks.`,
          user: words,
        });
        if (enhanced.trim()) speakText = enhanced.trim();
      } catch {
        /* raw words are fine */
      }

      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${clone.voice_id}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: speakText,
          model_id: clone.eleven_model || "eleven_multilingual_v2",
          voice_settings: {
            stability: Number(clone.voice_stability),
            similarity_boost: Number(clone.voice_similarity),
            style: Number(clone.voice_style),
            use_speaker_boost: clone.voice_speaker_boost,
            speed: Number(clone.voice_speed),
          },
        }),
      });
      if (!ttsRes.ok) throw new Error(`ElevenLabs ${ttsRes.status}: ${await ttsRes.text()}`);
      const audio = Buffer.from(await ttsRes.arrayBuffer());

      const voiceMsg = await tgUpload(
        token,
        "sendVoice",
        { chat_id: String(chatId), ...bcid },
        { field: "voice", bytes: audio, filename: "voice.ogg", mime: "audio/ogg" },
      );
      // Same memory convention as src/flows/voice.ts. The returned voice file_id
      // lets the thread replay this note via /api/voice (getFile proxy).
      historyLine = `[sent a voice note saying: "${words}"]`;
      const voiceFileId = voiceMsg?.voice?.file_id ?? null;
      historyMeta = { type: "voice", ...(voiceFileId ? { tg_file_id: voiceFileId } : {}) };
    } else {
      return NextResponse.json({ error: `unknown send type "${type}"` }, { status: 400 });
    }

    // Log to chat_history (role 'ai' — it came from her side) so the thread updates.
    // meta is additive (migration 030) — if the column isn't applied yet, log and
    // retry without it so the send is never lost to a schema lag.
    const row: Record<string, unknown> = {
      clone_id: cloneId,
      telegram_id: user.telegram_id,
      role: "ai",
      content: historyLine,
    };
    if (historyMeta) {
      const { error } = await supabaseAdmin.from("chat_history").insert({ ...row, meta: historyMeta });
      if (error) {
        console.error("send: history insert with meta failed (migration 030 applied?):", error.message);
        await supabaseAdmin.from("chat_history").insert(row);
      }
    } else {
      await supabaseAdmin.from("chat_history").insert(row);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
