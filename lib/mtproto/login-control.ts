import { constants, publicEncrypt } from "node:crypto";
import qrcode from "qrcode-generator";
import { mtDb } from "./db";
import { insertEvent } from "./events";
import { requireUuid, RunValidationError } from "./validate";

export type LoginRequestAction = "connect" | "reconnect" | "disconnect";
export type LoginRequestStatus =
  | "pending"
  | "processing"
  | "qr"
  | "password_required"
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
  message: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE = ["pending", "processing", "qr", "password_required"] as const;
const KEY_SETTING = "mtproto_login_public_key";
const QUIET_ZONE = 4;

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
): Promise<LoginRequestView> {
  requireUuid(cloneId, "cloneId");
  if (!["connect", "reconnect", "disconnect"].includes(action)) throw new RunValidationError("invalid connection action");

  // Going anywhere near a login/session change immediately removes this
  // creator from the live-send path. The worker repeats this before touching
  // Telegram, so this is both fast operator feedback and defence in depth.
  const { error: safeErr } = await mtDb()
    .from("userbot_connections")
    .upsert(
      {
        clone_id: cloneId,
        live_enabled: false,
        paused: true,
        paused_reason: "dashboard_login",
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
    .insert({ clone_id: cloneId, action, status: "pending", requested_by: actor })
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

export async function submitTelegramTwoFactorPassword(
  id: string,
  password: string,
  actor: string,
): Promise<LoginRequestView> {
  const req = await row(id);
  if (!req) throw new RunValidationError("Telegram connection request not found");
  if (req.status !== "password_required") throw new RunValidationError("Telegram is not asking for a password right now");
  if (!password || password.length > 256) throw new RunValidationError("Enter the Telegram 2-step verification password");

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
    Buffer.from(password, "utf8"),
  ).toString("base64");

  const { error } = await mtDb()
    .from("userbot_login_requests")
    .update({
      password_ciphertext: ciphertext,
      password_key_id: parsed.keyId,
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
