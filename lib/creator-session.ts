export const CREATOR_SESSION_COOKIE = "twin_creator_session";
const CREATOR_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CreatorSession = {
  accountId: string;
  userId: string;
  exp: number;
};

function secret(): string {
  const value = process.env.CREATOR_SESSION_SECRET || process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!value) throw new Error("CREATOR_SESSION_SECRET (or DASHBOARD_SESSION_SECRET) missing");
  return value;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as T;
  } catch {
    return null;
  }
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
  const aa = fromBase64Url(a);
  const bb = fromBase64Url(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export async function signCreatorSession(accountId: string, userId: string, expiresAt = Date.now() + CREATOR_SESSION_TTL_MS): Promise<string> {
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + CREATOR_SESSION_TTL_MS) throw new Error("Invalid creator session expiry");
  const payload = encodeJson({ accountId, userId, exp: expiresAt });
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyCreatorSession(token: string | null | undefined): Promise<CreatorSession | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await hmac(payload);
  if (!constantTimeEqual(signature, expected)) return null;
  const parsed = decodeJson<CreatorSession>(payload);
  if (!parsed?.accountId || !parsed?.userId || !Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
  return parsed;
}

export function creatorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(CREATOR_SESSION_TTL_MS / 1000),
  };
}
