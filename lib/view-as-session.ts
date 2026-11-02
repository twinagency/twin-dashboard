// ── "View as" cookie: master admin browsing an agency or creator account ─────
//
// Edge-safe (Web Crypto only, no next/headers) so it can be verified from
// middleware.ts as well as from server components/actions, mirroring
// lib/creator-session.ts and lib/session.ts exactly. This is a SEPARATE cookie
// from allie_admin_session: holding a valid view-as cookie proves nothing by
// itself. lib/view-as.ts's activeViewAs() is the only place that is allowed to
// treat it as live, and it always re-verifies the real admin session cookie
// first. A view-as cookie without a valid admin session must do nothing.
export const VIEW_AS_COOKIE = "twin_admin_view_as";
const VIEW_AS_TTL_MS = 60 * 60 * 1000; // 1 hour, short: this is a debugging lens, not a login.

export type ViewAsTargetType = "agency" | "creator";
export type ViewAsPayload = {
  targetType: ViewAsTargetType;
  targetId: string;
  admin: string;
  exp: number;
};

function secret(): string {
  const value = process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!value) throw new Error("DASHBOARD_PASSWORD (or DASHBOARD_SESSION_SECRET) missing");
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

export function isViewAsTargetType(v: unknown): v is ViewAsTargetType {
  return v === "agency" || v === "creator";
}

export async function signViewAs(targetType: ViewAsTargetType, targetId: string, admin: string): Promise<string> {
  const payload = encodeJson({ targetType, targetId, admin, exp: Date.now() + VIEW_AS_TTL_MS });
  return `${payload}.${await hmac(payload)}`;
}

// Verifies the signature AND the expiry. Does NOT verify the admin session —
// that is activeViewAs()'s job in lib/view-as.ts, deliberately kept out of
// this edge-safe module so there is exactly one place that combines the two.
export async function verifyViewAs(token: string | null | undefined): Promise<ViewAsPayload | null> {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  let expected: string;
  try {
    expected = await hmac(payload);
  } catch {
    return null;
  }
  if (!constantTimeEqual(signature, expected)) return null;
  const parsed = decodeJson<ViewAsPayload>(payload);
  if (
    !parsed ||
    !isViewAsTargetType(parsed.targetType) ||
    typeof parsed.targetId !== "string" ||
    !parsed.targetId ||
    typeof parsed.admin !== "string" ||
    !Number.isFinite(parsed.exp) ||
    parsed.exp < Date.now()
  ) {
    return null;
  }
  return parsed;
}

export function viewAsCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(VIEW_AS_TTL_MS / 1000),
  };
}
