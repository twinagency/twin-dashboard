import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { agencyIdentity } from "./agency-identity";
import { AGENCY_COOKIE } from "./agency-policy";
import { serviceClient } from "./supabase-service";

export const TEAM_TOKEN = /^[0-9a-f]{64}$/;
export const teamTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function agencyTeamOwner() {
  const identity = await agencyIdentity((await cookies()).get(AGENCY_COOKIE)?.value);
  if (!identity?.userId || identity.creatorScope === "selected" || identity.name === "Twin Technologies") return null;
  const owner = await serviceClient().from("agency_team_owners").select("user_id")
    .eq("agency_id", identity.id).eq("user_id", identity.userId).maybeSingle();
  return !owner.error && owner.data ? identity : null;
}
export async function pendingTeamInvite(token: string) {
  if (!TEAM_TOKEN.test(token)) return null;
  const db = serviceClient();
  const result = await db.from("agency_team_invites").select("id,agency_id,email,invited_by,expires_at,email_requested_at")
    .eq("token_hash", teamTokenHash(token)).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data;
  const [owner, member, agency] = await Promise.all([
    db.from("agency_team_owners").select("user_id").eq("user_id",row.invited_by).eq("agency_id",row.agency_id).maybeSingle(),
    db.from("agency_memberships").select("user_id").eq("user_id",row.invited_by).eq("agency_id",row.agency_id).eq("active",true).eq("creator_scope","all").maybeSingle(),
    db.from("partner_agencies").select("name").eq("id",row.agency_id).eq("active",true).maybeSingle(),
  ]);
  return owner.error || member.error || agency.error || !owner.data || !member.data || !agency.data ? null : {...row,agencyName:agency.data.name};
}
