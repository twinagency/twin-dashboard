import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { canManageCreatorLogin, CREATOR_ACCOUNT_PATH } from "@/lib/creator-account-settings";
import { getCreatorWorkspace } from "@/lib/creator-dashboard";
import { exactCaseInsensitiveEmailPattern } from "@/lib/creator-email";
import { dashboardOrigin, trustedFormOrigin } from "@/lib/form-origin";
import { serviceClient } from "@/lib/supabase-service";

export async function POST(request: Request) {
  if (!trustedFormOrigin(request) || request.headers.has("next-action")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const creator = await getCreatorWorkspace();
  if (!creator) {
    return NextResponse.redirect(new URL(CREATOR_ACCOUNT_PATH, dashboardOrigin(request)), 303);
  }
  if (!canManageCreatorLogin(creator)) return new NextResponse("Forbidden", { status: 403 });

  const result = (status: string) => {
    const url = new URL(CREATOR_ACCOUNT_PATH, dashboardOrigin(request));
    url.searchParams.set("status", status);
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  };
  const form = await request.formData().catch(() => null);
  const change = form?.get("change");
  const currentPassword = form?.get("currentPassword");
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 1024) return result("password_required");
  const emailInput = form?.get("email");
  const newEmail = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  const newPassword = form?.get("newPassword");
  if (change === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) return result("invalid_email");
  } else if (change === "password") {
    if (typeof newPassword !== "string" || newPassword.length < 8
      || new TextEncoder().encode(newPassword).length > 72
      || newPassword === currentPassword || newPassword !== form?.get("confirmPassword")) {
      return result("invalid_password");
    }
  } else {
    return result("failed");
  }

  const db = serviceClient();
  const { data: account, error: accountError } = await db.auth.admin.getUserById(creator.userId);
  if (accountError || !account.user?.email) return result("failed");

  // Use the current Auth email and match the authenticated user back to the
  // creator session. Never accept a user ID or a current email from the form.
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verified, error: verifyError } = await auth.auth.signInWithPassword({
    email: account.user.email, password: currentPassword,
  });
  if (verifyError || !verified.session || verified.user?.id !== creator.userId) {
    if (verifyError?.status === 429) return result("rate_limited");
    return result(verifyError?.code === "invalid_credentials" ? "wrong_password" : "failed");
  }

  try {
    if (change === "password" && typeof newPassword === "string") {
      const { error } = await auth.auth.updateUser({ password: newPassword });
      return result(error ? (error.code === "weak_password" ? "invalid_password" : "failed") : "password_saved");
    }

    if (newEmail === account.user.email.toLowerCase()) return result("same_email");
    const { count, error: lookupError } = await db.from("creator_accounts")
      .select("id", { count: "exact", head: true })
      .ilike("email", exactCaseInsensitiveEmailPattern(newEmail))
      .neq("id", creator.accountId);
    if (lookupError) return result("failed");
    if (count) return result("email_unavailable");

    const { data, error } = await auth.auth.updateUser({ email: newEmail }, {
      emailRedirectTo: new URL(CREATOR_ACCOUNT_PATH, dashboardOrigin(request)).href,
    });
    if (error) {
      if (error.status === 429) return result("rate_limited");
      return result(error.code === "email_exists" || error.code === "user_already_exists" ? "email_unavailable" : "failed");
    }
    return result(data.user.email?.toLowerCase() === newEmail ? "email_saved" : "email_pending");
  } finally {
    // This temporary Auth session is never used as a dashboard cookie.
    await auth.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
