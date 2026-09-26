import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_BLUR = 16;
export function validBlur(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 4 && value <= 40;
}
export function validateTelegramData(raw: string, token: string, now = Date.now()): number {
  if (!raw || raw.length > 12_000 || !token) throw new Error("Open this catalogue from Telegram.");
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error("Invalid Telegram session.");
  const hash = params.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Invalid Telegram session.");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw new Error("Invalid Telegram session.");
  const issued = Number(params.get("auth_date"));
  if (!Number.isInteger(issued) || issued * 1000 > now + 30_000 || now - issued * 1000 > 3_600_000)
    throw new Error("Please close and reopen the catalogue.");
  let user: { id?: unknown };
  try { user = JSON.parse(params.get("user") ?? "null"); } catch { throw new Error("Invalid Telegram user."); }
  if (!user || !Number.isSafeInteger(user.id) || Number(user.id) <= 0) throw new Error("Invalid Telegram user.");
  return Number(user.id);
}
export function catalogueEligible(user: { blocked_at?: unknown; paused?: unknown; minor_flagged_at?: unknown } | null): boolean {
  return !!user && !user.blocked_at && !user.paused && !user.minor_flagged_at;
}
export function windowOpen(lastReceived: string | null, now = Date.now()): boolean {
  const at = Date.parse(lastReceived ?? "");
  return Number.isFinite(at) && at <= now && now - at < 24 * 60 * 60_000 - 60_000;
}
export type CatalogueItem = {
  id: string; type: "photo" | "video"; description: string; stars: number;
  free: boolean; purchased: boolean; received: boolean; createdAt: string;
};
export function projectItem(row: Record<string, any>, type: "photo" | "video", purchased = false, received = false): CatalogueItem {
  return { id: row.id, type, description: [row.caption, row.auto_desc].find(value => typeof value === "string" && value.trim())?.trim() || (type === "photo" ? "Photo" : "Video"),
    stars: row.star_value, free: row.is_free === true, purchased, received, createdAt: row.created_at };
}
export function safeMiniAppUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "t.me" && !u.username && !u.password && !u.port &&
      /^\/[A-Za-z0-9_]{5,32}(?:\/[A-Za-z0-9_]{1,64})?$/.test(u.pathname) && u.searchParams.has("startapp") ? u.href : null;
  } catch { return null; }
}
