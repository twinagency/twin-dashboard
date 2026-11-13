"use server";

import { guardDashboardAction } from "@/lib/agency-management";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isFanCredits, MAX_FAN_CREDITS } from "@/lib/fan-credits";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

// Fan controls for the /users inbox right panel (ported from the old
// /clones/[id]/fans/[userId] page — everything lives in the inbox now).

// Refuse, never coerce: a blank box, "2.5", "-3", "Infinity" or "1e9" used to
// floor/clamp into a written balance (blank = 0 wiped the fan's credits).
export async function setCredits(fd: FormData) {
  await guardDashboardAction("app/users/actions.ts#setCredits", [fd]);
  const userId = String(fd.get("userId"));
  const raw = String(fd.get("credits") ?? "").trim();
  const credits = /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
  if (!isFanCredits(credits)) {
    throw new Error(`credits must be a whole number from 0 to ${MAX_FAN_CREDITS}`);
  }
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
  await guardDashboardAction("app/users/actions.ts#resetCounters", [fd]);
  const userId = String(fd.get("userId"));
  const { error } = await supabaseAdmin
    .from("users")
    .update({ total_messages_sent: 0, total_messages_purchased: 0 })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}


// Mark an operator/synthetic Telegram account as test traffic across EVERY
// clone row for that Telegram identity. Commercial measurement views exclude
// these rows; the bot's conversational behaviour is unchanged.
export async function setTestTraffic(fd: FormData) {
  await guardDashboardAction("app/users/actions.ts#setTestTraffic", [fd]);
  const telegramId = Number(fd.get("telegramId"));
  const isTest = fd.get("isTest") === "true";
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) throw new Error("valid Telegram id is required");
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_test: isTest })
    .eq("telegram_id", telegramId);
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}

export async function toggleActive(fd: FormData) {
  await guardDashboardAction("app/users/actions.ts#toggleActive", [fd]);
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
//
// Lifting is the dangerous direction, so it is never a default: `blocked` must
// be exactly "true" or "false". Only an internal admin may lift a safety
// verdict or a block with no recorded reason; anyone else lifts an "operator"
// block only, checked in the UPDATE itself so a verdict landing after the
// guard's read is never lifted (0 rows matched = refused).
export async function setBlocked(fd: FormData) {
  await guardDashboardAction("app/users/actions.ts#setBlocked", [fd]);
  const userId = String(fd.get("userId"));
  const flag = fd.get("blocked");
  if (flag !== "true" && flag !== "false") throw new Error("blocked must be true or false");
  const blocked = flag === "true";
  const agency = await getDashboardAccess();
  const users = () => supabaseAdmin.from("users");
  if (!blocked && agency) {
    // Lift and clear the stamp in one statement: a later reason-less block never reads as this operator block.
    const { data, error } = await users()
      .update({ blocked, blocked_reason: null, blocked_at: null })
      .eq("id", userId)
      .eq("blocked_reason", "operator")
      .is("minor_flagged_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Only an administrator can lift this block");
    revalidatePath("/users");
    return;
  }
  if (blocked && agency) {
    // An agency block is stamped "operator" so the same agency can lift it, in ONE statement and only on a fan it
    // flips, never over a safety reason or minor flag. 0 rows falls through to the plain block below, which always
    // lands. Admin and AI-assistant blocks stay reason-less, so only an admin can lift them.
    const { data, error } = await users()
      .update({ blocked, blocked_reason: "operator", blocked_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("blocked", false)
      .or("blocked_reason.is.null,blocked_reason.eq.operator")
      .is("minor_flagged_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (data?.length) { revalidatePath("/users"); return; }
  }
  if (!blocked) {
    // Admin unblock clears blocked_at in the same write (the catalogue, browse and offer gates read it) and an
    // operator stamp, never a safety reason. A "minor" reason keeps blocked_at: the minor gate is
    // minor_flagged_at || reason "minor", and some media gates check only blocked_at and minor_flagged_at.
    // Disjoint conditions, first match wins: operator, no reason, any reason but minor (neq skips null, as in SQL).
    for (const [patch, op, value] of [
      [{ blocked, blocked_reason: null, blocked_at: null }, "eq", "operator"],
      [{ blocked, blocked_at: null }, "is", null],
      [{ blocked, blocked_at: null }, "neq", "minor"],
    ] as const) {
      const { data, error } = await users().update(patch).eq("id", userId).filter("blocked_reason", op, value).select("id");
      if (error) throw new Error(error.message);
      if (data?.length) { revalidatePath("/users"); return; }
    }
  }
  const { error } = await users()
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
  await guardDashboardAction("app/users/actions.ts#clearMinorFlag", [fd]);
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
  await guardDashboardAction("app/users/actions.ts#setPaused", [fd]);
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
  await guardDashboardAction("app/users/actions.ts#manualSendText", [fd]);
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
  await guardDashboardAction("app/users/actions.ts#manualSendVoice", [fd]);
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
  await guardDashboardAction("app/users/actions.ts#manualSendPhoto", [fd]);
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
// The key comes from the row being deleted, never the form (a stale form used
// to erase another fan's transcript). History goes first and its error stops
// the wipe, so a failure never leaves a deleted fan's transcript behind. Not a
// transaction: a users delete that fails after it leaves the fan with no
// history, and the error says so and asks for a retry.
export async function deleteUser(fd: FormData) {
  await guardDashboardAction("app/users/actions.ts#deleteUser", [fd]);
  const userId = String(fd.get("userId"));
  const { data: fan, error: readErr } = await supabaseAdmin
    .from("users")
    .select("clone_id,telegram_id")
    .eq("id", userId)
    .maybeSingle();
  if (readErr || !fan) throw new Error(readErr?.message ?? "fan not found");

  const { error: historyErr } = await supabaseAdmin
    .from("chat_history")
    .delete()
    .eq("clone_id", fan.clone_id)
    .eq("telegram_id", fan.telegram_id);
  if (historyErr) throw new Error(historyErr.message);

  const { error } = await supabaseAdmin.from("users").delete().eq("id", userId);
  if (error) {
    throw new Error(`Chat history is already deleted, but the fan row was not (${error.message}). Retry Delete user.`);
  }

  revalidatePath("/users");
}
