import { constants, publicEncrypt } from "node:crypto";
import qrcode from "qrcode-generator";
import { mtDb } from "./db";
import { insertEvent } from "./events";
import { requireUuid, RunValidationError } from "./validate";

export type LoginRequestAction = "connect" | "reconnect" | "disconnect" | "connect_phone" | "reconnect_phone";
export type LoginRequestStatus =
  | "pending"
  | "processing"
  | "qr"
  | "password_required"
  | "code_required"
  | "completed"
  | "failed"
  | "cancelled";

export interface LoginRequestView {
  id: string;
  cloneId: string;
  action: LoginRequestAction;
  status: LoginRequestStatus;
  qrSvg: string | null;
  qrExpiresAt: string | null;
  /** The phone number this request is using, for connect_phone/reconnect_phone. Not a secret. */
  phone: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  clone_id: string;
  action: LoginRequestAction;
  status: LoginRequestStatus;
  qr_url: string | null;
  qr_expires_at: string | null;
  phone: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE = ["pending", "processing", "qr", "password_required", "code_required"] as const;
const PHONE_ACTIONS: ReadonlySet<LoginRequestAction> = new Set(["connect_phone", "reconnect_phone"]);
const KEY_SETTING = "mtproto_login_public_key";
const QUIET_ZONE = 4;
// Loose E.164-shaped check: optional +, 7-15 digits total, first digit 1-9.
// Same intent as twin-userbot's loginCore.ts PHONE_RE, kept in sync by hand.
const PHONE_RE = /^\+?[1-9][0-9]{6,14}$/;

function renderQrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const size = n + QUIET_ZONE * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Telegram login QR code"><rect width="${size}" height="${size}" fill="#ffffff"/><path fill="#000000" d="${d}"/></svg>`;
}

function view(row: Row): LoginRequestView {
  return {
    id: row.id,
    cloneId: row.clone_id,
    action: row.action,
    status: row.status,
    qrSvg: row.status === "qr" && row.qr_url ? renderQrSvg(row.qr_url) : null,
    qrExpiresAt: row.status === "qr" ? row.qr_expires_at : null,
    phone: row.phone,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function row(id: string): Promise<Row | null> {
  requireUuid(id, "requestId");
  const { data, error } = await mtDb().from("userbot_login_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`could not read Telegram connection request: ${error.message}`);
  return (data as Row | null) ?? null;
}

export async function requestTelegramConnection(
  cloneId: string,
  action: LoginRequestAction,
  actor: string,
  phone?: string,
): Promise<LoginRequestView> {
  requireUuid(cloneId, "cloneId");
  if (!["connect", "reconnect", "disconnect", "connect_phone", "reconnect_phone"].includes(action)) {
    throw new RunValidationError("invalid connection action");
  }
  let cleanPhone: string | null = null;
  if (PHONE_ACTIONS.has(action)) {
    cleanPhone = (phone ?? "").replace(/[\s()-]/g, "");
    if (!PHONE_RE.test(cleanPhone)) {
      throw new RunValidationError("Enter a phone number in international format, for example +15551234567");
    }
    // Remember every number typed here so the next reconnect is prefilled.
    const { error: phoneErr } = await mtDb().from("clones").update({ account_phone: cleanPhone }).eq("id", cloneId);
    if (phoneErr) console.error(`[mtproto] could not save account phone: ${phoneErr.message}`);
  }

  // Going anywhere near a login/session change immediately removes this
  // creator from the live-send path. The worker repeats this before touching
  // Telegram, so this is both fast operator feedback and defence in depth.
  const { error: safeErr } = await mtDb()
    .from("userbot_connections")
    .upsert(
      {
        clone_id: cloneId,
        // Immediate safe direction: remove this creator from the live-send
        // gate before the worker even claims the request. The worker itself
        // temporarily pauses while it changes the Telegram session and then
        // restores the creator's pre-existing pause state after a successful
        // connect/reconnect.
        live_enabled: false,
      },
      { onConflict: "clone_id" },
    );
  if (safeErr) throw new Error(`could not make creator safe before connection change: ${safeErr.message}`);

  const { data: existing, error: existingErr } = await mtDb()
    .from("userbot_login_requests")
    .select("*")
    .eq("clone_id", cloneId)
    .in("status", [...ACTIVE])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(`could not check existing Telegram connection request: ${existingErr.message}`);
  if (existing) return view(existing as Row);

  const { data, error } = await mtDb()
    .from("userbot_login_requests")
    .insert({ clone_id: cloneId, action, status: "pending", requested_by: actor, phone: cleanPhone })
    .select("*")
    .single();
  if (error) throw new Error(`could not start Telegram connection: ${error.message}`);

  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId,
    userId: null,
    eventType: "session_event",
    actor,
    detail: { action: `dashboard_${action}_requested`, requestId: data.id },
  });

  return view(data as Row);
}

export async function getTelegramConnectionRequest(id: string): Promise<LoginRequestView> {
  const found = await row(id);
  if (!found) throw new RunValidationError("Telegram connection request not found");
  return view(found);
}

/** RSA-OAEP encrypts `secret` under the worker's current published public
 *  key. Used for both the 2-step verification password and the phone login
 *  code: same short-lived key, same padding, only the caller and the
 *  column-write status differ. Never logs or returns the plaintext. */
async function encryptForWorker(secret: string): Promise<{ ciphertext: string; keyId: string }> {
  const { data: setting, error: settingErr } = await mtDb()
    .from("app_settings")
    .select("value")
    .eq("key", KEY_SETTING)
    .maybeSingle();
  if (settingErr) throw new Error(`could not read worker login key: ${settingErr.message}`);
  if (!setting?.value) throw new Error("MTProto worker login key is unavailable. Try Connect again in a moment.");

  let parsed: { keyId?: string; publicKey?: string };
  try {
    parsed = JSON.parse(String(setting.value));
  } catch {
    throw new Error("MTProto worker login key is invalid. Try Connect again.");
  }
  if (!parsed.keyId || !parsed.publicKey?.includes("BEGIN PUBLIC KEY")) {
    throw new Error("MTProto worker login key is unavailable. Try Connect again.");
  }

  const ciphertext = publicEncrypt(
    { key: parsed.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(secret, "utf8"),
  ).toString("base64");

  return { ciphertext, keyId: parsed.keyId };
}

export async function submitTelegramTwoFactorPassword(
  id: string,
  password: string,
  actor: string,
): Promise<LoginRequestView> {
  const req = await row(id);
  if (!req) throw new RunValidationError("Telegram connection request not found");
  if (req.status !== "password_required") throw new RunValidationError("Telegram is not asking for a password right now");
  if (!password || password.length > 256) throw new RunValidationError("Enter the Telegram 2-step verification password");

  const { ciphertext, keyId } = await encryptForWorker(password);

  const { error } = await mtDb()
    .from("userbot_login_requests")
    .update({
      password_ciphertext: ciphertext,
      password_key_id: keyId,
      message: "Password sent securely to the MTProto worker.",
    })
    .eq("id", id)
    .eq("status", "password_required");
  if (error) throw new Error(`could not submit Telegram password: ${error.message}`);

  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId: req.clone_id,
    userId: null,
    eventType: "session_event",
    actor,
    detail: { action: "dashboard_2fa_submitted", requestId: id, encrypted: true },
  });

  return getTelegramConnectionRequest(id);
}

const CODE_RE = /^[0-9]{4,8}$/;

/** Submits the phone login code, encrypted the same way and over the same
 *  column as the 2-step verification password above; only the status this
 *  request is in tells them apart. Never logs or stores the code plaintext. */
export async function submitTelegramCode(id: string, code: string, actor: string): Promise<LoginRequestView> {
  const req = await row(id);
  if (!req) throw new RunValidationError("Telegram connection request not found");
  if (req.status !== "code_required") throw new RunValidationError("Telegram is not asking for a code right now");
  const cleanCode = code.replace(/\s/g, "");
  if (!CODE_RE.test(cleanCode)) throw new RunValidationError("Enter the numeric code Telegram sent");

  const { ciphertext, keyId } = await encryptForWorker(cleanCode);

  const { error } = await mtDb()
    .from("userbot_login_requests")
    .update({
      password_ciphertext: ciphertext,
      password_key_id: keyId,
      message: "Code sent securely to the MTProto worker.",
    })
    .eq("id", id)
    .eq("status", "code_required");
  if (error) throw new Error(`could not submit Telegram code: ${error.message}`);

  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId: req.clone_id,
    userId: null,
    eventType: "session_event",
    actor,
    detail: { action: "dashboard_code_submitted", requestId: id, encrypted: true },
  });

  return getTelegramConnectionRequest(id);
}

export async function cancelTelegramConnectionRequest(id: string, actor: string): Promise<void> {
  const req = await row(id);
  if (!req) return;
  if (!ACTIVE.includes(req.status as (typeof ACTIVE)[number])) return;
  const { error } = await mtDb()
    .from("userbot_login_requests")
    .update({
      status: "cancelled",
      qr_url: null,
      qr_expires_at: null,
      password_ciphertext: null,
      password_key_id: null,
      message: "Cancelled by operator.",
    })
    .eq("id", id);
  if (error) throw new Error(`could not cancel Telegram connection request: ${error.message}`);
  await insertEvent({
    runId: null,
    episodeId: null,
    cloneId: req.clone_id,
    userId: null,
    eventType: "session_event",
    actor,
    detail: { action: "dashboard_login_cancelled", requestId: id },
  });
}


export async function listActiveTelegramConnectionRequests(): Promise<Map<string, LoginRequestView>> {
  const { data, error } = await mtDb()
    .from("userbot_login_requests")
    .select("*")
    .in("status", [...ACTIVE])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`could not read active Telegram connection requests: ${error.message}`);
  const out = new Map<string, LoginRequestView>();
  for (const raw of (data ?? []) as Row[]) {
    if (!out.has(raw.clone_id)) out.set(raw.clone_id, view(raw));
  }
  return out;
}
