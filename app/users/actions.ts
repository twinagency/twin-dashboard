"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

// Fan controls for the /users inbox right panel (ported from the old
// /clones/[id]/fans/[userId] page — everything lives in the inbox now).

export async function setCredits(fd: FormData) {
  const userId = String(fd.get("userId"));
  const credits = Math.max(0, Math.floor(Number(fd.get("credits")) || 0));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ message_credits: credits })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Zero the lifetime usage counters (messages sent + purchased). Does not touch
// the live credit balance — that's `setCredits`.
export async function resetCounters(fd: FormData) {
  const userId = String(fd.get("userId"));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ total_messages_sent: 0, total_messages_purchased: 0 })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function toggleActive(fd: FormData) {
  const userId = String(fd.get("userId"));
  const active = fd.get("active") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_active: active })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Lift (or re-apply) the safety block — users.blocked is the persisted
// "she never replies to him again" switch set by src/safety.ts.
//
// NOTE: this does NOT lift the self-declared-minor gate. That is deliberate,
// see clearMinorFlag below: unblocking is a routine action, and silently
// un-gating a fan who stated he was underage is not.
export async function setBlocked(fd: FormData) {
  const userId = String(fd.get("userId"));
  const blocked = fd.get("blocked") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ blocked })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// CLEAR THE SELF-DECLARED-MINOR GATE (migration 083).
//
// THE BUG THIS FIXES: safety.ts documents the remedy for a wrongly flagged
// adult as "an operator clears `blocked` from the dashboard exactly as they
// already can". That remedy did not work. The bot's isMinorGated() is
//
//     !!user.minorFlaggedAt || user.blockedReason === "minor"
//
// and setBlocked above updates ONLY `blocked`. So an operator would unblock a
// wrongly flagged adult, watch her start replying again, and reasonably believe
// it was fixed, while he stayed permanently barred from every photo, video,
// bundle, free preview, paid send, onboarding media step, campaign drip, voice
// note and emoji reaction. Silently, with nothing in the UI saying why, and no
// way to ever sell him anything again.
//
// Both fields must be cleared together or the gate survives on whichever one is
// left. blocked/blocked_at go too, because safety.ts sets all four as one act
// and leaving him blocked-but-un-gated is a state nothing else produces.
//
// Kept as its OWN action rather than folded into unblock: this is the one
// safety verdict in the system with a real-world cost if reversed wrongly, so
// it should take a deliberate second click and its own confirmation, not ride
// along on a routine unblock.
export async function clearMinorFlag(fd: FormData) {
  const userId = String(fd.get("userId"));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ minor_flagged_at: null, blocked_reason: null, blocked: false, blocked_at: null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Per-fan pause. users.paused, gated in handler.ts/campaign.ts/followup.ts
// so this ONE fan gets no replies and no drip while it's on. Distinct from
// both the whole-clone Active/Paused status (clones.status) and the safety
// block above (users.blocked): this is just "leave him on read for a while",
// not a ban and not a clone-wide pause.
export async function setPaused(fd: FormData) {
  const userId = String(fd.get("userId"));
  const paused = fd.get("paused") === "true";
  const { error } = await supabaseAdmin
    .from("users")
    .update({ paused })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// ── Manual fan takeover (migration 096) ──────────────────────────────────────
//
// These three actions do NOT talk to Telegram directly (see bot/src/manual-send.ts
// for why: dashboard and bot share only Supabase, no in-process call and no HTTP
// surface on the bot). They only INSERT a 'pending' row into `manual_sends`; the
// bot polls that table on a 10s tick and does the real send through the existing
// Messenger/TelegramMessenger, so business_connection_id and every send guard
// stay exactly as they are for every other send path.
//
// Guarded here (not just by the UI only rendering the panel for a paused fan):
// re-fetch `paused` server-side before inserting, so a stale page/tab or a
// replayed request can never queue a manual send for a fan who isn't paused.
async function assertPaused(userId: string): Promise<{ cloneId: string; telegramId: number }> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("clone_id,telegram_id,paused")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "fan not found");
  if (!data.paused) throw new Error("manual takeover requires this fan to be paused first");
  return { cloneId: data.clone_id, telegramId: data.telegram_id };
}

export async function manualSendText(fd: FormData) {
  const userId = String(fd.get("userId"));
  const text = String(fd.get("text") ?? "").trim();
  if (!text) throw new Error("message text is required");
  const { cloneId, telegramId } = await assertPaused(userId);
  const { error } = await supabaseAdmin.from("manual_sends").insert({
    clone_id: cloneId,
    user_id: userId,
    telegram_id: telegramId,
    kind: "text",
    body: text,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Operator types what she should SAY; the bot runs it through the same
// speak() SSML+TTS pipeline every automated voice note uses, then sends it as
// a voice note (services/telegram-messenger.ts sendVoice).
export async function manualSendVoice(fd: FormData) {
  const userId = String(fd.get("userId"));
  const words = String(fd.get("words") ?? "").trim();
  if (!words) throw new Error("voice script is required");
  const { cloneId, telegramId } = await assertPaused(userId);
  const { error } = await supabaseAdmin.from("manual_sends").insert({
    clone_id: cloneId,
    user_id: userId,
    telegram_id: telegramId,
    kind: "voice",
    body: words,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Picker is restricted to already-uploaded FREE photos only (see
// bot/src/manual-send.ts safety-gate note): a paid/paywalled photo sent
// through manual takeover would give away paid content with no purchase, so
// the bot-side handler refuses it outright even if this ever got bypassed.
export async function manualSendPhoto(fd: FormData) {
  const userId = String(fd.get("userId"));
  const photoId = String(fd.get("photoId") ?? "");
  const caption = String(fd.get("caption") ?? "").trim() || null;
  if (!photoId) throw new Error("a photo must be selected");
  const { cloneId, telegramId } = await assertPaused(userId);
  const { data: photo, error: photoErr } = await supabaseAdmin
    .from("photos")
    .select("id,is_free")
    .eq("id", photoId)
    .eq("clone_id", cloneId)
    .maybeSingle();
  if (photoErr || !photo) throw new Error(photoErr?.message ?? "photo not found");
  if (!photo.is_free) throw new Error("manual takeover can only send free (non-paywalled) photos");
  const { error } = await supabaseAdmin.from("manual_sends").insert({
    clone_id: cloneId,
    user_id: userId,
    telegram_id: telegramId,
    kind: "photo",
    media_id: photoId,
    body: caption,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

// Full wipe: the user row (cascades purchases + received-media via FK) plus
// chat_history, which is keyed by (clone_id, telegram_id) and won't cascade.
export async function deleteUser(fd: FormData) {
  const userId = String(fd.get("userId"));
  const cloneId = String(fd.get("cloneId"));
  const telegramId = String(fd.get("telegramId"));

  await supabaseAdmin
    .from("chat_history")
    .delete()
    .eq("clone_id", cloneId)
    .eq("telegram_id", telegramId);

  const { error } = await supabaseAdmin.from("users").delete().eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/users");
}
