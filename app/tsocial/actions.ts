"use server";

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isAuthed } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-service";
import { MONEY_KEYS, validateSetting, type SettingKey } from "@/lib/tsocial";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same admin pattern as app/admin/earnings-split/actions.ts: guard first, then
// require a null (non-agency, non-creator) access AND a real admin session.
// Each exported action calls guardDashboardAction itself as its first statement
// (scripts/check-lynq-management.tsx asserts that), then this.
async function requireAdmin() {
  if ((await getDashboardAccess()) !== null || !(await isAuthed())) throw new Error("Admin access required");
}

function uuid(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Error("Invalid request");
  return v;
}

function done(error: { message: string } | null) {
  if (error) throw new Error("Could not save");
  revalidatePath("/tsocial");
}

export async function approvePost(postId: string) {
  await guardDashboardAction("app/tsocial/actions.ts#approvePost", [postId]);
  await requireAdmin();
  uuid(postId);
  // Only queue items move: a live or rejected post is never silently flipped.
  const { error } = await serviceClient().from("tsocial_posts").update({ status: "live", reject_reason: null }).eq("id", postId).eq("status", "review");
  done(error);
}

export async function rejectPost(postId: string, reason: string) {
  await guardDashboardAction("app/tsocial/actions.ts#rejectPost", [postId, reason]);
  await requireAdmin();
  uuid(postId);
  const why = typeof reason === "string" ? reason.trim().slice(0, 200) : "";
  if (!why) throw new Error("Reason required");
  const { error } = await serviceClient().from("tsocial_posts").update({ status: "rejected", reject_reason: why }).eq("id", postId).eq("status", "review");
  done(error);
}

export async function hideReported(kind: "clip" | "chat", itemId: string) {
  await guardDashboardAction("app/tsocial/actions.ts#hideReported", [kind, itemId]);
  await requireAdmin();
  uuid(itemId);
  if (kind !== "clip" && kind !== "chat") throw new Error("Invalid request");
  const table = kind === "clip" ? "tsocial_posts" : "tsocial_chat_posts";
  const { error } = await serviceClient().from(table).update({ status: "hidden" }).eq("id", itemId);
  done(error);
}

export async function dismissReports(kind: "clip" | "chat", itemId: string) {
  await guardDashboardAction("app/tsocial/actions.ts#dismissReports", [kind, itemId]);
  await requireAdmin();
  uuid(itemId);
  if (kind !== "clip" && kind !== "chat") throw new Error("Invalid request");
  const { error } = await serviceClient().from("tsocial_reports").delete().eq(kind === "clip" ? "post_id" : "chat_post_id", itemId);
  done(error);
}

export async function setAccountBanned(accountId: string, banned: boolean) {
  await guardDashboardAction("app/tsocial/actions.ts#setAccountBanned", [accountId, banned]);
  await requireAdmin();
  uuid(accountId);
  if (typeof banned !== "boolean") throw new Error("Invalid request");
  done((await serviceClient().from("tsocial_accounts").update({ banned }).eq("id", accountId)).error);
}

export async function setAccountVerified(accountId: string, verified: boolean) {
  await guardDashboardAction("app/tsocial/actions.ts#setAccountVerified", [accountId, verified]);
  await requireAdmin();
  uuid(accountId);
  if (typeof verified !== "boolean") throw new Error("Invalid request");
  done((await serviceClient().from("tsocial_accounts").update({ verified }).eq("id", accountId)).error);
}

export async function setAccountPlan(accountId: string, plan: "free" | "staff") {
  await guardDashboardAction("app/tsocial/actions.ts#setAccountPlan", [accountId, plan]);
  await requireAdmin();
  uuid(accountId);
  if (plan !== "free" && plan !== "staff") throw new Error("Invalid request");
  // plan_until only means something for paid plans, so clear it for free/staff.
  done((await serviceClient().from("tsocial_accounts").update({ plan, plan_until: null }).eq("id", accountId)).error);
}

export async function saveSetting(key: string, raw: string, confirmed: boolean) {
  await guardDashboardAction("app/tsocial/actions.ts#saveSetting", [key, raw, confirmed]);
  await requireAdmin();
  const v = validateSetting(key, raw);
  if (!v.ok) throw new Error(v.error);
  if ((MONEY_KEYS as readonly string[]).includes(key) && confirmed !== true) throw new Error("Confirm money changes");
  const { error } = await serviceClient().from("tsocial_settings").upsert({ key: key as SettingKey, value: v.value }, { onConflict: "key" });
  done(error);
}
