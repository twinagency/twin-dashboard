/** Fresh private authority for external upload boundaries. Never browser-owned. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase-service";
import { creatorUuid, staffCreatorIds } from "@/lib/staff-creator-scope";

export const UPLOAD_PERMISSION_VERSION = "of-upload-permission.v1";
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const agencyActor = new RegExp(`^agency-user:(${uuid}):(${uuid})$`);

export async function currentUploadPermission(actor: string, creatorId: string, db: SupabaseClient = serviceClient()): Promise<boolean> {
  if (!creatorUuid(creatorId)) return false;
  try {
    // Owner actors are the existing owner-token hash, so revocation/expiry is
    // checked by the same live authority as verifyOwnerSession, without a key
    // or raw browser session entering the worker. Legacy shared-password hashes
    // have no revocable identity and therefore cannot pass this authority.
    if (/^op-session:[a-f0-9]{64}$/.test(actor)) {
      const result = await db.rpc("dashboard_owner_session_verify", { p_session_hash: actor.slice("op-session:".length) });
      return !result.error && result.data === true;
    }
    const match = agencyActor.exec(actor);
    if (!match) return false;
    const [, agencyId, userId] = match;
    const [member, agency, assigned] = await Promise.all([
      db.from("agency_memberships").select("can_manage,creator_scope,creator_ids,creator_access_revision")
        .eq("agency_id", agencyId).eq("user_id", userId).eq("active", true).maybeSingle(),
      db.from("partner_agencies").select("id").eq("id", agencyId).eq("active", true).maybeSingle(),
      db.from("agency_creators").select("clone_id").eq("agency_id", agencyId).eq("clone_id", creatorId).maybeSingle(),
    ]);
    return !member.error && !agency.error && !assigned.error && !!agency.data && !!assigned.data
      && member.data?.can_manage === true && staffCreatorIds([creatorId], member.data)?.includes(creatorId.toLowerCase()) === true;
  } catch {
    return false;
  }
}
