// Shared raw Bot API fetch helpers. The dashboard has no grammY dependency
// and the bot repo runs a long-polling worker with no HTTP server to call
// into (see src/index.ts — bot.start() polls until stopped, there is no
// listen()), so operator-triggered sends replicate the minimal calls
// directly against Telegram's Bot API using the clone's own bot_token. This
// is the same mechanism app/api/send/route.ts established for manual fan
// messages; app/api/business-account/route.ts reuses it here.
//
// This machine's IPv6 route is dead (same fix as src/index.ts / api/send).
import dns from "node:dns";
import net from "node:net";

let patched = false;
export function ensureIpv4First(): void {
  if (patched) return;
  patched = true;
  dns.setDefaultResultOrder("ipv4first");
  net.setDefaultAutoSelectFamily(false);
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export async function tgCall(token: string, method: string, payload: Record<string, unknown>): Promise<any> {
  ensureIpv4First();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (!j.ok) throw new TelegramApiError(j.description ?? `Telegram ${method} failed (${res.status})`, j.error_code);
  return j.result;
}

// Multipart variant for raw bytes (photo/video/voice uploads).
export async function tgUpload(
  token: string,
  method: string,
  fields: Record<string, unknown>,
  file: { field: string; bytes: Buffer; filename: string; mime: string },
): Promise<any> {
  ensureIpv4First();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  form.set(file.field, new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
  const j = await res.json();
  if (!j.ok) throw new TelegramApiError(j.description ?? `Telegram ${method} failed (${res.status})`, j.error_code);
  return j.result;
}
