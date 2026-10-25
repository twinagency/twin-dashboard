import assert from "node:assert/strict";
import { serviceClient } from "../lib/supabase-service";
import { agencyIdentityById } from "../lib/agency-identity";
import { agencyCanManage } from "../lib/agency-management-policy";
import { withDashboardAccess } from "../lib/dashboard-access";
import { guardDashboardAction } from "../lib/agency-management";
import { dashboardFetch } from "../lib/agency-fetch";
import { staffCreatorIds } from "../lib/staff-creator-scope";
import { TOP_ONLYFANS_AGENCY } from "../lib/partner-portals";

async function main() {
  assert.ok(process.env.SUPABASE_URL?.includes("aouaenqayfltoqrmpitg"), "Unexpected database target");
  const db = serviceClient();
  const membership = await db.from("agency_memberships").select("user_id,can_manage,creator_scope,creator_ids,creator_access_revision").eq("agency_id", TOP_ONLYFANS_AGENCY.id).eq("active", true);
  if (membership.error) throw Error(membership.error.message);
  let member: any;
  for (const row of membership.data ?? []) {
    const user = await db.auth.admin.getUserById(row.user_id);
    if (user.data.user?.email === "toponlyfanstwin@dashboard.tgaiclone.xyz") member = row;
  }
  assert.ok(member, "Target account has no active membership");
  const agency = await agencyIdentityById(TOP_ONLYFANS_AGENCY.id);
  assert.ok(agency);
  const cloneIds = staffCreatorIds(agency.cloneIds, member);
  assert.ok(cloneIds?.length, "No assigned bots");
  const access = { ...agency, cloneIds, canManage: member.can_manage === true, userId: member.user_id };
  assert.equal(agencyCanManage(access), true, "Target account is read-only");
  const proof: unknown[] = [];
  for (const id of cloneIds) {
    const columns = "id,name,known_for,video_sequences_enabled,sell_via_mini_app,bot_token,elevenlabs_api_key,account_phone";
    const before = await db.from("clones").select(columns).eq("id", id).single();
    if (before.error) throw Error(before.error.message);
    const original = before.data;
    await withDashboardAccess(access, async () => {
      await guardDashboardAction("app/clones/actions.ts#updateClone", [id, new FormData()]);
      const response = await dashboardFetch(process.env.SUPABASE_URL + "/rest/v1/clones?id=eq." + id, {
        method: "PATCH", headers: { apikey: process.env.SUPABASE_SERVICE_KEY!, authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify({ known_for: original.known_for, video_sequences_enabled: original.video_sequences_enabled, sell_via_mini_app: original.sell_via_mini_app })
      });
      if (!response.ok) throw Error("Scoped save rejected: " + response.status + " " + await response.text());
      await assert.rejects(guardDashboardAction("app/clones/actions.ts#updateClone", ["00000000-0000-0000-0000-000000000000", new FormData()]), /Creator access denied/);
    });
    const after = await db.from("clones").select(columns).eq("id", id).single();
    if (after.error) throw Error(after.error.message);
    assert.deepEqual(after.data, original, "Same-value round trip must preserve configuration and protected credentials");
    proof.push({ id, name: original.name, saveStatus: "passed", reloadedFromDatabase: true, credentialsPreserved: true });
  }
  console.log(JSON.stringify({ account: "toponlyfanstwin", canManage: access.canManage, assignedBots: proof, unrelatedBotRefused: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
