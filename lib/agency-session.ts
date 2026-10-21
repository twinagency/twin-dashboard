import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { AGENCY_COOKIE } from "./agency-policy";

export const AGENCY_REFRESH_COOKIE = "twin_agency_refresh";
export const AGENCY_SESSION_SECONDS = 24 * 60 * 60;
type Session = { access_token: string; refresh_token: string; user: { id: string } };
type Envelope = { refresh: string; user: string; expires: number };
type Renewal = { kind: "unchanged" } | { kind: "invalid" } | { kind: "unavailable" }
  | { kind: "renewed"; session: Session; expires: number };
const encoder = new TextEncoder();
const options = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" });
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function key() {
  const secret = process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!secret) throw new Error("Dashboard session secret missing");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function seal(envelope: Envelope): Promise<string> {
  const payload = encode(encoder.encode(JSON.stringify(envelope)));
  const signature = await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
async function unseal(value: string): Promise<Envelope | null> {
  try {
    if (value.length > 3500) return null;
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra || !await crypto.subtle.verify("HMAC", await key(), decode(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode(payload))) as Envelope;
    if (typeof data.refresh !== "string" || !data.refresh || typeof data.user !== "string" || !data.user
      || !Number.isSafeInteger(data.expires) || data.expires <= Date.now()) return null;
    return data;
  } catch { return null; }
}

/** Renew access tokens within one absolute day; refreshing never extends the login. */
export async function setAgencySessionCookies(response: NextResponse, session: Session, expires = Date.now() + AGENCY_SESSION_SECONDS * 1000) {
  if (!session.refresh_token || !session.user.id) throw new Error("Incomplete agency session");
  const maxAge = Math.max(0, Math.floor((expires - Date.now()) / 1000));
  response.cookies.set(AGENCY_COOKIE, session.access_token, { ...options(), maxAge });
  response.cookies.set(AGENCY_REFRESH_COOKIE, await seal({ refresh: session.refresh_token, user: session.user.id, expires }), { ...options(), maxAge });
}
export function clearAgencySessionCookies(response: NextResponse) {
  response.cookies.delete(AGENCY_COOKIE);
  response.cookies.delete(AGENCY_REFRESH_COOKIE);
}

// Concurrent navigations share a refresh. Keep the result briefly for requests
// already carrying the previous token, within Supabase's rotation reuse window.
const refreshes = new Map<string, { until: number; result: Promise<Renewal> }>();
export async function renewAgencySession(req: NextRequest): Promise<Renewal> {
  const token = req.cookies.get(AGENCY_COOKIE)?.value;
  const cookie = req.cookies.get(AGENCY_REFRESH_COOKIE)?.value;
  if (!token || !cookie) return { kind: "unchanged" }; // Legacy sessions keep their existing expiry.
  const envelope = await unseal(cookie);
  if (!envelope) return { kind: "invalid" };
  try {
    // Only schedules renewal. The normal getUser + active-membership checks
    // still authenticate every request; unverified JWT contents grant nothing.
    const jwt = JSON.parse(new TextDecoder().decode(decode(token.split(".")[1])));
    if (jwt.sub === envelope.user && Number(jwt.exp) * 1000 > Date.now() + 60_000) return { kind: "unchanged" };
  } catch { /* Expired or malformed access token: ask Auth to renew it. */ }
  for (const [id, entry] of refreshes) if (entry.until <= Date.now()) refreshes.delete(id);
  const running = refreshes.get(cookie);
  if (running) return running.result;
  const result = (async (): Promise<Renewal> => {
    try {
      const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await auth.auth.refreshSession({ refresh_token: envelope.refresh });
      if (error) return { kind: !error.status || error.status >= 500 || error.status === 429 ? "unavailable" : "invalid" };
      if (!data.session || data.session.user.id !== envelope.user || envelope.expires <= Date.now()) return { kind: "invalid" };
      return { kind: "renewed", session: data.session, expires: envelope.expires };
    } catch { return { kind: "unavailable" }; }
  })();
  if (refreshes.size >= 128) refreshes.delete(refreshes.keys().next().value!);
  const entry = { until: Date.now() + 30_000, result };
  refreshes.set(cookie, entry);
  void result.then(value => {
    if (value.kind === "unavailable") refreshes.delete(cookie);
    else entry.until = Date.now() + 5_000;
  });
  return result;
}
