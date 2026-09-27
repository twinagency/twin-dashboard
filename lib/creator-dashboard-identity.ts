import { verifyCreatorSession } from "./creator-session";
import { serviceClient } from "./supabase-service";
import type { AgencyIdentity } from "./agency-identity";
import { isZaneDemo } from "./creator-demo-policy";
import {
  BRI_LIVE_DEMO_AGENCY_ID,
  BRI_LIVE_DEMO_CLONE_ID,
  isBriLiveDemoAccount,
} from "./creator-live-demo-policy";
export type CreatorDashboardIdentity = AgencyIdentity & {
  kind: "creator";
  accountId: string;
  userId: string;
  creatorName: string;
  onboarded: boolean;
  /** Live-data preview accounts can read their one scoped clone but cannot mutate it. */
  readOnly: boolean;
  /** Current server-verified assignment. Never copy a portal hint here. */
  agencyId: string | null;
};

const CREATOR_ACCESS_STATUSES = new Set(["applicant", "approved", "active"]);

export function creatorAccountStatusAllowsAccess(status: unknown): boolean {
  return typeof status === "string" && CREATOR_ACCESS_STATUSES.has(status);
}
// A signature is insufficient: verify current identity and ownership. Any
// preview scope must be exact-account, server-validated and read-only.
export async function creatorDashboardIdentity(token: string | null | undefined): Promise<CreatorDashboardIdentity | null> {
  try {
    const session = await verifyCreatorSession(token);
    if (!session) return null;
    const db = serviceClient();
    const account = await db.from("creator_accounts").select("id,auth_user_id,display_name,account_status,source").eq("id", session.accountId).maybeSingle();
    if (account.error || !account.data || account.data.auth_user_id !== session.userId || !creatorAccountStatusAllowsAccess(account.data.account_status)) return null;
    const [application, assignment, link] = await Promise.all([
      db.from("creator_applications").select("status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("creator_agency_assignments").select("agency_id,partner_agencies(name,active)").eq("creator_account_id", session.accountId).maybeSingle(),
      db.from("creator_clone_links").select("clone_id,clones(id,name)").eq("creator_account_id", session.accountId).maybeSingle(),
    ]);
    if (application.error || assignment.error || link.error) return null;
    const relatedAgency = assignment.data?.partner_agencies as unknown as { name: string; active: boolean } | null;
    if (assignment.data?.agency_id && (!relatedAgency || !relatedAgency.active)) return null;
    // Direct agency applicants must retain a current server-owned assignment.
    // A partial provisioning failure must never fall back to Twin access.
    if (account.data.source === "agency_invite" && !assignment.data?.agency_id) return null;
    let clone = link.data?.clones as unknown as { id: string; name: string } | null;
    if (link.data?.clone_id && (!clone || clone.id !== link.data.clone_id)) return null;
    const briLiveDemo = isBriLiveDemoAccount(session.accountId);
    if (briLiveDemo) {
      // The preview is a separate creator account. It does not own, replace or
      // mutate Bri's real creator account or its existing clone link.
      if (account.data.source !== "admin" || application.data?.status !== "approved" || assignment.data?.agency_id !== BRI_LIVE_DEMO_AGENCY_ID || link.data?.clone_id) return null;
      const demoClone = await db.from("agency_creators").select("clone_id,clones(id,name)")
        .eq("agency_id", BRI_LIVE_DEMO_AGENCY_ID).eq("clone_id", BRI_LIVE_DEMO_CLONE_ID).maybeSingle();
      const relatedClone = demoClone.data?.clones as unknown as { id: string; name: string } | null;
      if (demoClone.error || demoClone.data?.clone_id !== BRI_LIVE_DEMO_CLONE_ID || relatedClone?.id !== BRI_LIVE_DEMO_CLONE_ID) return null;
      clone = relatedClone;
    }
    const identity: CreatorDashboardIdentity = {
      id: `creator:${session.accountId}`,
      kind: "creator",
      accountId: session.accountId,
      userId: session.userId,
      name: relatedAgency?.name || "Twin",
      agencyId: assignment.data?.agency_id || null,
      creatorName: clone?.name || account.data.display_name || "Your creator account",
      cloneIds: clone ? [clone.id] : [],
      // A live clone link IS onboarding: the twin exists and its intake is done,
      // so the questionnaire would ask this creator to rebuild what they have.
      // Onboarding stays for new accounts that have no clone yet.
      onboarded: !!clone || ["submitted", "reviewing", "approved"].includes(application.data?.status || ""),
      readOnly: briLiveDemo,
    };
    // Branding only, not an assignment, permission or real-account status change.
    return isZaneDemo(identity) ? { ...identity, name: "LYNQ" } : identity;
  } catch { return null; }
}

// Same identity shape as creatorDashboardIdentity(), keyed directly by
// creator_accounts.id instead of a signed session token. There is no session
// to verify here: the ONLY caller is lib/view-as.ts's activeViewAs(), which
// has already re-verified a live master-admin session before it will look up
// this id. readOnly is ALWAYS true regardless of the account's own state,
// because this identity exists only so an admin can look, never so they can
// act as the creator. Never reachable from anything that accepts an id
// straight from an untrusted caller.
export async function creatorDashboardIdentityById(accountId: string): Promise<CreatorDashboardIdentity | null> {
  try {
    const db = serviceClient();
    const account = await db.from("creator_accounts").select("id,auth_user_id,display_name,account_status,source").eq("id", accountId).maybeSingle();
    if (account.error || !account.data || !creatorAccountStatusAllowsAccess(account.data.account_status)) return null;
    const [application, assignment, link] = await Promise.all([
      db.from("creator_applications").select("status").eq("creator_account_id", accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("creator_agency_assignments").select("agency_id,partner_agencies(name,active)").eq("creator_account_id", accountId).maybeSingle(),
      db.from("creator_clone_links").select("clone_id,clones(id,name)").eq("creator_account_id", accountId).maybeSingle(),
    ]);
    if (application.error || assignment.error || link.error) return null;
    const relatedAgency = assignment.data?.partner_agencies as unknown as { name: string; active: boolean } | null;
    if (assignment.data?.agency_id && (!relatedAgency || !relatedAgency.active)) return null;
    if (account.data.source === "agency_invite" && !assignment.data?.agency_id) return null;
    const clone = link.data?.clones as unknown as { id: string; name: string } | null;
    if (link.data?.clone_id && (!clone || clone.id !== link.data.clone_id)) return null;
    const identity: CreatorDashboardIdentity = {
      id: `creator:${accountId}`,
      kind: "creator",
      accountId,
      userId: account.data.auth_user_id,
      name: relatedAgency?.name || "Twin",
      agencyId: assignment.data?.agency_id || null,
      creatorName: clone?.name || account.data.display_name || "Your creator account",
      cloneIds: clone ? [clone.id] : [],
      onboarded: !!clone || ["submitted", "reviewing", "approved"].includes(application.data?.status || ""),
      readOnly: true,
    };
    return isZaneDemo(identity) ? { ...identity, name: "LYNQ" } : identity;
  } catch { return null; }
}
