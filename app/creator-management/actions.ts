"use server";

import { revalidatePath } from "next/cache";
import { guardDashboardAction } from "@/lib/agency-management";
import { supabaseAdmin } from "@/lib/supabase";

function value(fd: FormData, key: string) {
  const raw = fd.get(key);
  return raw == null ? "" : String(raw).trim();
}

const ACCOUNT_STATUSES = new Set(["applicant", "approved", "active", "paused", "rejected", "archived"]);
const APPLICATION_STATUSES = new Set(["draft", "submitted", "reviewing", "approved", "rejected", "withdrawn"]);

export async function updateCreatorReviewStatus(fd: FormData) {
  await guardDashboardAction("app/creator-management/actions.ts#updateCreatorReviewStatus", [fd]);
  const creatorAccountId = value(fd, "creator_account_id");
  const applicationId = value(fd, "application_id");
  const accountStatus = value(fd, "account_status");
  const applicationStatus = value(fd, "application_status");
  if (!creatorAccountId || !ACCOUNT_STATUSES.has(accountStatus)) throw new Error("Invalid creator status.");
  if (applicationStatus && !APPLICATION_STATUSES.has(applicationStatus)) throw new Error("Invalid application status.");

  const now = new Date().toISOString();
  const { error: accountError } = await supabaseAdmin
    .from("creator_accounts")
    .update({ account_status: accountStatus, updated_at: now })
    .eq("id", creatorAccountId);
  if (accountError) throw new Error(accountError.message);

  if (applicationId && applicationStatus) {
    const patch: Record<string, unknown> = { status: applicationStatus, updated_at: now };
    if (applicationStatus === "submitted") patch.submitted_at = now;
    const { error: applicationError } = await supabaseAdmin
      .from("creator_applications")
      .update(patch)
      .eq("id", applicationId)
      .eq("creator_account_id", creatorAccountId);
    if (applicationError) throw new Error(applicationError.message);
  }

  revalidatePath("/creator-management");
  revalidatePath(`/creator-management/${creatorAccountId}`);
  revalidatePath("/creator");
}

export async function linkCreatorClone(fd: FormData) {
  await guardDashboardAction("app/creator-management/actions.ts#linkCreatorClone", [fd]);
  const creatorAccountId = value(fd, "creator_account_id");
  const cloneId = value(fd, "clone_id");
  if (!creatorAccountId) throw new Error("Creator account is required.");

  if (!cloneId) {
    const { error } = await supabaseAdmin.from("creator_clone_links").delete().eq("creator_account_id", creatorAccountId);
    if (error) throw new Error(error.message);
  } else {
    const { data: clone, error: cloneError } = await supabaseAdmin.from("clones").select("id,slug").eq("id", cloneId).maybeSingle();
    if (cloneError) throw new Error(cloneError.message);
    if (!clone) throw new Error("Clone not found.");
    const { error: detachError } = await supabaseAdmin.from("creator_clone_links").delete().eq("clone_id", cloneId).neq("creator_account_id", creatorAccountId);
    if (detachError) throw new Error(detachError.message);
    const { error } = await supabaseAdmin.from("creator_clone_links").upsert({
      creator_account_id: creatorAccountId,
      clone_id: clone.id,
      twin_slug: clone.slug,
      linked_at: new Date().toISOString(),
    }, { onConflict: "creator_account_id" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/creator-management");
  revalidatePath(`/creator-management/${creatorAccountId}`);
  revalidatePath("/storage");
}

export async function assignCreatorAgency(fd: FormData) {
  await guardDashboardAction("app/creator-management/actions.ts#assignCreatorAgency", [fd]);
  const creatorAccountId = value(fd, "creator_account_id");
  const agencyId = value(fd, "agency_id");
  if (!creatorAccountId) throw new Error("Creator account is required.");

  if (!agencyId) {
    const { error } = await supabaseAdmin.from("creator_agency_assignments").upsert({
      creator_account_id: creatorAccountId,
      agency_id: null,
      assignment_source: "direct",
      assigned_at: new Date().toISOString(),
    }, { onConflict: "creator_account_id" });
    if (error) throw new Error(error.message);
  } else {
    const { data: agency, error: agencyError } = await supabaseAdmin.from("partner_agencies").select("id").eq("id", agencyId).eq("active", true).maybeSingle();
    if (agencyError) throw new Error(agencyError.message);
    if (!agency) throw new Error("Agency not found.");
    const { error } = await supabaseAdmin.from("creator_agency_assignments").upsert({
      creator_account_id: creatorAccountId,
      agency_id: agencyId,
      assignment_source: "admin",
      assigned_at: new Date().toISOString(),
    }, { onConflict: "creator_account_id" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/creator-management");
  revalidatePath(`/creator-management/${creatorAccountId}`);
}
