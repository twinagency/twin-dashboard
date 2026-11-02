"use server";
// Server action for master-admin "View as". guardDashboardAction is the
// repo-wide rule (check-mtproto.ts J1 / check-lynq-management.tsx): every
// exported "use server" function calls it as its FIRST statement. For this
// action it does the real gating for free: access === null (no agency, no
// creator, no view-as identity — i.e. a real verified master-admin session,
// which middleware.ts already required to reach this action at all) returns
// immediately and the action proceeds; an agency OR creator caller falls
// through to guardDashboardAction's default `throw new Error("Administrator
// access required")`, since "app/admin/view-as/actions.ts#startViewAs" is not
// one of its allowlisted action names.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { guardDashboardAction } from "@/lib/agency-management";
import { signViewAs, VIEW_AS_COOKIE, viewAsCookieOptions, isViewAsTargetType } from "@/lib/view-as-session";
import { clientIp } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

// No per-admin login exists (lib/session.ts is one shared password), so there
// is no admin identity to log beyond this fixed label plus the caller's IP.
const ADMIN_LABEL = "master-admin";

// Insert-and-continue: another change owns admin_view_as_log's migration.
// Losing the audit row must never block the admin from viewing.
async function logViewAs(targetType: string, targetId: string, ip: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("admin_view_as_log")
      .insert({ admin: ADMIN_LABEL, target_type: targetType, target_id: targetId, ip });
    if (error) console.error("admin_view_as_log insert failed:", error.message);
  } catch (e) {
    console.error("admin_view_as_log insert threw:", e instanceof Error ? e.message : e);
  }
}

export async function startViewAs(formData: FormData): Promise<void> {
  await guardDashboardAction("app/admin/view-as/actions.ts#startViewAs", [formData]);
  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!isViewAsTargetType(targetType) || !/^[0-9a-f-]{36}$/i.test(targetId)) {
    throw new Error("invalid view-as target");
  }
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for")) ?? "unknown";
  const token = await signViewAs(targetType, targetId, ADMIN_LABEL);
  (await cookies()).set(VIEW_AS_COOKIE, token, viewAsCookieOptions());
  await logViewAs(targetType, targetId, ip);
  redirect(targetType === "agency" ? "/" : "/creator");
}
