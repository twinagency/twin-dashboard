import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serviceClient } from "./supabase-service";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "./creator-session";
import type { AgencyIdentity } from "./agency-identity";

export type CreatorDashboardIdentity = AgencyIdentity & {
  accountId: string;
  authUserId: string;
  displayName: string;
  cloneId: string | null;
  cloneName: string | null;
  cloneStatus: string | null;
  brandSlug: string;
  ready: boolean;
};

/** Signed session + current account binding. Never infer ownership from email or a URL. */
export async function resolveCreatorDashboardIdentity(token?: string): Promise<CreatorDashboardIdentity | null> {
  let session;
  try { session = await verifyCreatorSession(token); } catch { return null; }
  if (!session) return null;
  const db = serviceClient();
  const accountResult = await db.from("creator_accounts")
    .select("id,auth_user_id,display_name,account_status")
    .eq("id", session.accountId).eq("auth_user_id", session.userId).maybeSingle();
  const account = accountResult.data;
  if (accountResult.error || !account || ["archived", "rejected"].includes(account.account_status)) return null;
  const [linkResult, assignmentResult, applicationResult] = await Promise.all([
    db.from("creator_clone_links").select("clone_id,clones(name,status)").eq("creator_account_id", account.id).maybeSingle(),
    db.from("creator_agency_assignments").select("agency_id,partner_agencies(name,slug)").eq("creator_account_id", account.id).maybeSingle(),
    db.from("creator_applications").select("status").eq("creator_account_id", account.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (linkResult.error || assignmentResult.error || applicationResult.error) throw new Error("Creator access unavailable");
  const linked = linkResult.data as unknown as { clone_id: string; clones: { name: string; status: string } | null } | null;
  const assigned = assignmentResult.data as unknown as { partner_agencies: { name: string; slug: string } | null } | null;
  const cloneId = linked?.clones ? linked.clone_id : null;
  return {
    // A separate cache namespace and a non-manager identity. Do NOT use the agency ID here.
    id: `creator:${account.id}`,
    name: assigned?.partner_agencies?.name || "Twin",
    cloneIds: cloneId ? [cloneId] : [],
    accountId: account.id,
    authUserId: session.userId,
    displayName: account.display_name || linked?.clones?.name || "Creator",
    cloneId,
    cloneName: linked?.clones?.name || null,
    cloneStatus: linked?.clones?.status || null,
    brandSlug: assigned?.partner_agencies?.slug || "twin",
    ready: ["approved", "active"].includes(account.account_status)
      || ["submitted", "reviewing", "approved"].includes(applicationResult.data?.status || ""),
  };
}
export const getCreatorDashboardIdentity = cache(async () =>
  resolveCreatorDashboardIdentity((await cookies()).get(CREATOR_SESSION_COOKIE)?.value));
export async function requireCreatorDashboard(): Promise<CreatorDashboardIdentity> {
  const identity = await getCreatorDashboardIdentity();
  if (!identity) redirect("/creator-auth/logout");
  if (!identity.ready) redirect("/creator/onboarding");
  return identity;
}
