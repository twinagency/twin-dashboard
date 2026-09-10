import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serviceClient } from "@/lib/supabase-service";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "@/lib/creator-session";
import { safeCreatorNext } from "@/lib/creator-routing";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { AGENCY_COOKIE } from "@/lib/agency-policy";
import { AGENCY_PORTAL_COOKIE } from "@/lib/agency-brand";
import { SESSION_COOKIE } from "@/lib/session";
import { CLONE_SCOPE_COOKIE } from "@/lib/clone-scope";

function redirectWithError(req: Request, next: string) {
  const url = creatorRequestUrl(req, "/creator/login");
  url.searchParams.set("error", "1");
  url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const next = safeCreatorNext(String(form.get("next") || ""));
  if (!email || !password) return redirectWithError(req, next);

  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return redirectWithError(req, next);

  // Creator account lookup must not inherit a stale agency/operator scope from
  // another tab in the same browser.
  const { data: account, error: accountError } = await serviceClient()
    .from("creator_accounts")
    .select("id,account_status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (accountError || !account || account.account_status === "archived" || account.account_status === "rejected") {
    return redirectWithError(req, next);
  }

  const token = await signCreatorSession(account.id, data.user.id);
  const jar = await cookies();
  jar.set(CREATOR_SESSION_COOKIE, token, creatorCookieOptions());
  jar.delete(AGENCY_COOKIE);
  jar.delete(AGENCY_PORTAL_COOKIE);
  jar.delete(SESSION_COOKIE);
  jar.delete(CLONE_SCOPE_COOKIE);
  return NextResponse.redirect(creatorRequestUrl(req, next), 303);
}
