import { verifyCreatorSession } from "./creator-session";
import { serviceClient } from "./supabase-service";
import type { AgencyIdentity } from "./agency-identity";
import { isZaneDemo } from "./creator-demo-policy";
export type CreatorDashboardIdentity = AgencyIdentity & { kind: "creator"; accountId: string; userId: string; creatorName: string; onboarded: boolean };
// A signature is insufficient: verify current identity and ownership. Demo
// presentation never supplies a real clone or changes agency membership.
export async function creatorDashboardIdentity(token: string | null | undefined): Promise<CreatorDashboardIdentity | null> {
  try {
    const session = await verifyCreatorSession(token);
    if (!session) return null;
    const db = serviceClient();
    const account = await db.from("creator_accounts").select("id,auth_user_id,display_name,account_status").eq("id", session.accountId).maybeSingle();
    if (account.error || !account.data || account.data.auth_user_id !== session.userId || ["archived", "rejected"].includes(account.data.account_status)) return null;
    const [application, assignment, link] = await Promise.all([
      db.from("creator_applications").select("status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("creator_agency_assignments").select("agency_id,partner_agencies(name,active)").eq("creator_account_id", session.accountId).maybeSingle(),
      db.from("creator_clone_links").select("clone_id,clones(id,name)").eq("creator_account_id", session.accountId).maybeSingle(),
    ]);
    if (application.error || assignment.error || link.error) return null;
    const relatedAgency = assignment.data?.partner_agencies as unknown as { name: string; active: boolean } | null;
    if (assignment.data?.agency_id && (!relatedAgency || !relatedAgency.active)) return null;
    const clone = link.data?.clones as unknown as { id: string; name: string } | null;
    if (link.data?.clone_id && (!clone || clone.id !== link.data.clone_id)) return null;
    const identity: CreatorDashboardIdentity = { id: `creator:${session.accountId}`, kind: "creator", accountId: session.accountId, userId: session.userId, name: relatedAgency?.name || "Twin", creatorName: clone?.name || account.data.display_name || "Your creator account", cloneIds: clone ? [clone.id] : [], onboarded: ["submitted", "reviewing", "approved"].includes(application.data?.status || "") };
    // Branding only, not an assignment, permission or real-account status change.
    return isZaneDemo(identity) ? { ...identity, name: "LYNQ" } : identity;
  } catch { return null; }
}
