import { createClient, type Session } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { AGENCY_COOKIE } from "./agency-policy";

// Agency logins used to store only the 1-hour Supabase access token, so every
// partner was bounced to the login page once an hour. The refresh token now
// lives beside it and middleware swaps in a fresh access token before expiry.
export const AGENCY_REFRESH_COOKIE = "twin_agency_refresh";
export const AGENCY_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const REFRESH_BEFORE_EXPIRY_SECONDS = 120;

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: AGENCY_SESSION_MAX_AGE });

export function setAgencySession(response: NextResponse, session: Pick<Session, "access_token" | "refresh_token">): void {
  response.cookies.set(AGENCY_COOKIE, session.access_token, cookieOptions());
  if (session.refresh_token) response.cookies.set(AGENCY_REFRESH_COOKIE, session.refresh_token, cookieOptions());
}

export function clearAgencySession(cookies: { delete(name: string): unknown }): void {
  cookies.delete(AGENCY_COOKIE);
  cookies.delete(AGENCY_REFRESH_COOKIE);
}

/** Seconds until the JWT's exp claim, or -1 when it cannot be read. */
export function accessTokenSecondsLeft(token: string | undefined, now = Date.now()): number {
  if (!token) return -1;
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp - Math.floor(now / 1000) : -1;
  } catch { return -1; }
}

export function agencySessionNeedsRefresh(req: NextRequest): boolean {
  if (!req.cookies.get(AGENCY_REFRESH_COOKIE)?.value) return false;
  return accessTokenSecondsLeft(req.cookies.get(AGENCY_COOKIE)?.value) < REFRESH_BEFORE_EXPIRY_SECONDS;
}

/**
 * Renews the agency session in middleware. The new tokens go on the forwarded
 * request (so this request's server code sees them) and are returned so the
 * caller can set them on whatever response the rest of middleware produces.
 * A dead refresh token returns "expired" and the caller clears both cookies.
 */
export async function refreshAgencySession(req: NextRequest): Promise<Session | "expired" | null> {
  const refreshToken = req.cookies.get(AGENCY_REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return error && (error.status === 400 || error.status === 401) ? "expired" : null;
    req.cookies.set(AGENCY_COOKIE, data.session.access_token);
    req.cookies.set(AGENCY_REFRESH_COOKIE, data.session.refresh_token);
    return data.session;
  } catch { return null; }
}
