import { AGENCY_COLUMNS } from "./agency-columns";
import { scopedSelection } from "./agency-query";
import { agencyCanManage } from "./agency-management-policy";
import { assignedClone, assignedStoragePath, ownedResource } from "./agency-management";
import { serviceClient } from "./supabase-service";
import type { AgencyIdentity } from "./agency-identity";

export const AGENCY_PROTECTED_CLONE_FIELDS = ["id","slug","bot_token","created_at","deployed_at","uses_default_config","strict_minor_gate","photo_vision_model"] as const;
export const AGENCY_WRITABLE_CLONE_FIELDS = AGENCY_COLUMNS.clones.filter(c => !(AGENCY_PROTECTED_CLONE_FIELDS as readonly string[]).includes(c));
const WRITABLE: Record<string, {methods:string[];fields:readonly string[]}> = {
  clones: {methods:["PATCH"],fields:AGENCY_WRITABLE_CLONE_FIELDS},
  users: {methods:["PATCH"],fields:["message_credits","total_messages_sent","total_messages_purchased","is_active","blocked","paused","blocked_reason","blocked_at"]},
  photos: {methods:["POST","PATCH","DELETE"],fields:["clone_id","storage_path","caption","teaser_caption","star_value","image_name","is_free","is_nude","explicitness","nsfw","tags","auto_desc","visual_description"]},
  videos: {methods:["POST","PATCH","DELETE"],fields:["clone_id","storage_path","caption","teaser_caption","star_value","is_free","is_nude","explicitness","nsfw","tags","auto_desc","visual_description"]},
  photo_bundles: {methods:["POST","PATCH","DELETE"],fields:["clone_id","name","caption","star_price","is_onboarding"]},
  photo_bundle_items: {methods:["POST","DELETE"],fields:["bundle_id","storage_path","sort_order"]},
  manual_sends: {methods:["POST"],fields:["clone_id","user_id","telegram_id","kind","body","media_id"]},
};

export async function agencyBundleIds(agency: AgencyIdentity): Promise<string[]> {
  if (!agency.cloneIds.length) return [];
  const {data,error}=await serviceClient().from("photo_bundles").select("id").in("clone_id",agency.cloneIds);
  if (error) throw new Error("Bundle access unavailable");
  return (data??[]).map(row=>String(row.id));
}
const EMPTY="00000000-0000-0000-0000-000000000000";
export async function scopeBundleItems(input: URL, agency: AgencyIdentity): Promise<URL> {
  const url=new URL(input);
  url.searchParams.set("select",scopedSelection("photo_bundle_items",url.searchParams.get("select")||"*"));
  const ids=await agencyBundleIds(agency);
  url.searchParams.append("and",`(bundle_id.in.(${(ids.length?ids:[EMPTY]).join(",")}))`);
  return url;
}

/** setBlocked's two agency reason writes, exactly (G36c): the one-statement stamp on a fan it flips, never over a
 * safety reason or minor flag, and the unblock that clears an operator stamp only. Anything else is refused. */
function operatorStampWrite(url: URL, row: Record<string, unknown>): boolean {
  const q = url.searchParams;
  if (Object.keys(row).sort().join() !== "blocked,blocked_at,blocked_reason" || q.get("minor_flagged_at") !== "is.null") return false;
  if (row.blocked === true) return row.blocked_reason === "operator" && typeof row.blocked_at === "string"
    && q.get("blocked") === "eq.false" && q.get("or") === "(blocked_reason.is.null,blocked_reason.eq.operator)";
  return row.blocked === false && row.blocked_reason === null && row.blocked_at === null && q.get("blocked_reason") === "eq.operator";
}

/** Restrict both the old row (mandatory AND) and the submitted owner/fields.
 * No upserts, RPC mutations, ledger edits, credential edits or re-parenting. */
export async function scopeAgencyWrite(input: URL, method: string, body: unknown, agency: AgencyIdentity): Promise<URL> {
  if (!agencyCanManage(agency)) throw new Error("Read-only agency access");
  const url=new URL(input);
  const table=url.pathname.slice("/rest/v1/".length);
  const rule=WRITABLE[table];
  if (!rule?.methods.includes(method)) throw new Error("Administrator access required");
  if (url.searchParams.has("on_conflict")) throw new Error("Agency upserts are not allowed");
  const bundleIds=table === "photo_bundle_items" ? await agencyBundleIds(agency) : [];
  const owner=table === "clones" ? "id" : table === "photo_bundle_items" ? "bundle_id" : "clone_id";
  const scopeIds=table === "photo_bundle_items" ? bundleIds : agency.cloneIds;
  if (method !== "POST") url.searchParams.append("and",`(${owner}.in.(${(scopeIds.length?scopeIds:[EMPTY]).join(",")}))`);
  if (url.searchParams.has("select")) url.searchParams.set("select",scopedSelection(table,url.searchParams.get("select")!));
  if (method === "DELETE") return url;
  const rows=Array.isArray(body)?body:[body];
  if (!rows.length || rows.length>1000) throw new Error("Invalid write payload");
  for (const row of rows) {
    if (!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).some(key=>!rule.fields.includes(key))) throw new Error("Unsupported agency field");
    if (method === "PATCH" && ("clone_id" in row || "storage_path" in row || "bundle_id" in row)) throw new Error("Ownership and storage paths cannot be reassigned");
    // Any unblock is a reason write too: lifting a block must be the exact operator clear, never a bare {blocked:false}.
    if (table === "users" && ("blocked_reason" in row || "blocked_at" in row || row.blocked === false) && !operatorStampWrite(url, row)) {
      throw new Error("Only an operator block reason may be recorded");
    }
    if (table === "clones") {
      const target=url.searchParams.get("id");
      if (!target?.startsWith("eq.")) throw new Error("A single creator must be selected");
      const cloneId=assignedClone(agency,target.slice(3));
      const references: {table:"photos"|"videos"|"photo_bundles";id:unknown}[]=[];
      if (row.onboarding_free_preview_media_id) references.push({table:"photos",id:row.onboarding_free_preview_media_id});
      for (const steps of [row.onboarding_steps,row.drip_steps]) if (Array.isArray(steps)) {
        for (const step of steps) if (step?.media_id) {
          const table=step.type==="bundle"?"photo_bundles":step.type==="video"?"videos":step.type==="photo"?"photos":null;
          if (!table) throw new Error("Unsupported media reference");
          references.push({table,id:step.media_id});
        }
      }
      if (references.length>100) throw new Error("Too many flow references");
      for (const ref of references) await ownedResource(agency,ref.table,ref.id,cloneId);
      const profile=row.intake?.appearance?.profile_image_path;
      if (profile && assignedStoragePath(agency,profile).split("/")[0]!==cloneId) throw new Error("Profile image belongs to a different creator");
    }
    if (method === "POST") {
      if (table === "photo_bundle_items") {
        if (!bundleIds.includes(row.bundle_id)) throw new Error("Bundle access denied");
        const bundle=await ownedResource(agency,"photo_bundles",row.bundle_id);
        if (assignedStoragePath(agency,row.storage_path).split("/")[0]!==bundle.clone_id) throw new Error("Bundle media belongs to a different creator");
      } else {
        const cloneId=assignedClone(agency,row.clone_id);
        if ("storage_path" in row && assignedStoragePath(agency,row.storage_path).split("/")[0]!==cloneId) throw new Error("Media belongs to a different creator");
        if (table === "manual_sends") {
          const user=await ownedResource(agency,"users",row.user_id,cloneId);
          if (!user.paused || row.telegram_id!==user.telegram_id) throw new Error("Invalid manual-send recipient");
          if (!["text","voice","photo"].includes(row.kind)) throw new Error("Invalid manual send");
          if (row.kind === "photo") {
            const photo=await ownedResource(agency,"photos",row.media_id,cloneId);
            if (!photo.is_free) throw new Error("Manual takeover can only send free photos");
          }
        }
      }
    }
  }
  return url;
}
