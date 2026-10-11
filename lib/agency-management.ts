import { getDashboardAccess } from "./dashboard-access";
import { agencyCanManage } from "./agency-management-policy";
import { serviceClient } from "./supabase-service";
import type { AgencyIdentity } from "./agency-identity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assignedClone(agency: AgencyIdentity, value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value) || !agency.cloneIds.includes(value)) throw new Error("Creator access denied");
  return value;
}
export function assignedStoragePath(agency: AgencyIdentity, value: unknown): string {
  if (typeof value !== "string" || value.includes("\\") || value.includes("%") || value.split("/").some(s => !s || s === "." || s === "..")) throw new Error("Media access denied");
  assignedClone(agency, value.split("/")[0]);
  return value;
}
export async function requireManagedClone(cloneId: unknown): Promise<void> {
  const access = await getDashboardAccess();
  if (!access) return;
  if (!agencyCanManage(access)) throw new Error("Read-only agency access");
  assignedClone(access, cloneId);
}

export async function ownedResource(agency: AgencyIdentity, table: "users" | "photos" | "videos" | "photo_bundles", id: unknown, cloneId?: string) {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Resource access denied");
  const columns = table === "users" ? "id,clone_id,telegram_id,paused" : table === "photo_bundles" ? "id,clone_id" : "id,clone_id,storage_path,is_free";
  const {data, error} = await serviceClient().from(table).select(columns).eq("id", id).in("clone_id", agency.cloneIds).maybeSingle();
  if (error || !data) throw new Error("Resource access denied");
  const row = data as unknown as {id:string;clone_id:string;telegram_id?:number;paused?:boolean;storage_path?:string;is_free?:boolean};
  assignedClone(agency, row.clone_id);
  if (cloneId && row.clone_id !== cloneId) throw new Error("Resource belongs to a different creator");
  return row;
}
export async function ownedBundleItem(agency: AgencyIdentity, id: unknown, cloneId: string) {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Media access denied");
  const {data,error} = await serviceClient().from("photo_bundle_items").select("id,bundle_id,storage_path").eq("id",id).maybeSingle();
  if (error || !data) throw new Error("Media access denied");
  await ownedResource(agency,"photo_bundles",data.bundle_id,cloneId);
  return data;
}

/** Every exported Server Action calls this before its first side effect.
 * Next action IDs are callable from other pages, so route filtering alone is
 * insufficient. Unlisted actions (keys, fleet defaults, deletion, tracker,
 * safety overrides, administration) remain internal even with a known ID. */
// Live creators (creator session linked to their clone): the PPV page is upload-only. They may add a
// photo/video file to their OWN clone through the normal upload pipeline (priced from the operator's
// pricing guide) and load their own previews. Every other action, and every other form field, is refused.
function creatorUploadOnly(access: AgencyIdentity & { readOnly?: boolean }, action: string, args: unknown[]): void {
  if (access.readOnly) throw new Error("Read-only creator access");
  if (action === "app/media/actions.ts#getSignedUrl") { assignedStoragePath(access, args[0]); return; }
  if (action !== "app/media/actions.ts#uploadPhoto" && action !== "app/media/actions.ts#uploadVideo") throw new Error("Creator access is upload-only");
  assignedClone(access, args[0]);
  const fd = args[1];
  if (!(fd instanceof FormData)) throw new Error("Invalid upload form");
  const files = fd.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) throw new Error("Upload one file at a time");
  for (const key of [...new Set(fd.keys())]) if (key !== "file") fd.delete(key); // no price, free flag, caption or name from a creator
}
export async function guardDashboardAction(action: string, args: unknown[]): Promise<void> {
  const access = await getDashboardAccess();
  if (!access) return;
  if ((access as { kind?: string }).kind === "creator") { creatorUploadOnly(access as AgencyIdentity & { readOnly?: boolean }, action, args); return; }
  if (!agencyCanManage(access)) throw new Error("Read-only agency access");
  if (action === "app/actions/clone-scope.ts#setCloneScope") {
    if (args[0] !== null) assignedClone(access,args[0]);
    return;
  }
  const [file,name] = action.split("#");
  if (file === "app/agency/creator-split/actions.ts" && name === "saveAgencyCreatorCut") { assignedClone(access,args[0]); return; }
  if (file === "app/clones/actions.ts" && ["updateClone","toggleClonePause","compileCloneAction","setStatus","setCloneToggle","setCloneDial"].includes(name)) {
    const cloneId=assignedClone(access,args[0]);
    if (name === "updateClone") {
      if (!(args[1] instanceof FormData)) throw new Error("Invalid creator form");
      const path=args[1].get("dashboard_profile_image_path");
      if (path && assignedStoragePath(access,path).split("/")[0] !== cloneId) throw new Error("Profile image belongs to another creator");
    }
    return;
  }
  if (file === "app/flows/actions.ts" && name === "saveCampaign") {
    assignedClone(access,args[0]);
    return;
  }
  if (["app/users/actions.ts","app/clones/[id]/fans/[userId]/actions.ts"].includes(file) &&
      ["setCredits","resetCounters","toggleActive","setBlocked","setPaused","manualSendText","manualSendVoice","manualSendPhoto"].includes(name)) {
    if (!(args[0] instanceof FormData)) throw new Error("Invalid fan form");
    const fd=args[0];
    const user=await ownedResource(access,"users",fd.get("userId"));
    if (fd.has("cloneId") && fd.get("cloneId") !== user.clone_id) throw new Error("Creator access denied");
    if (name.startsWith("manualSend") && !user.paused) throw new Error("Pause this fan before manual takeover");
    if (name === "manualSendPhoto") {
      const photo=await ownedResource(access,"photos",fd.get("photoId"),user.clone_id);
      if (!photo.is_free) throw new Error("Manual takeover can only send free photos");
    }
    return;
  }
  if (file === "app/sequences/actions.ts") {
    const allowed = ["createSequence","saveSequenceParts","approveSequenceRevision","publishSequenceRevision","withdrawSequenceRevision","setFanSequenceStatus"];
    if (!allowed.includes(name)) throw new Error("Administrator access required");
    // Pausing a fan's sequence is keyed on the fan, not the creator id.
    if (name === "setFanSequenceStatus") {
      if (!(args[0] instanceof FormData)) throw new Error("Invalid fan form");
      const user = await ownedResource(access, "users", args[0].get("userId"));
      if (args[0].get("cloneId") !== user.clone_id) throw new Error("Creator access denied");
      return;
    }
    const cloneId = assignedClone(access, args[0]);
    // A sequence may only ever be cut from this creator's own recording.
    if (name === "createSequence") {
      if (!(args[1] instanceof FormData)) throw new Error("Invalid sequence form");
      const source = args[1].get("sourceVideoId");
      if (source) await ownedResource(access, "videos", source, cloneId);
    }
    return;
  }
  if (file === "app/media/actions.ts") {
    if (name === "getSignedUrl") { assignedStoragePath(access,args[0]); return; }
    const allowed=["uploadPhoto","uploadVideo","updatePhoto","updateVideo","completeReview","deletePhoto","deleteVideo","bulkSetMediaPrice","bulkDeleteMedia","createBundle","updateBundle","deleteBundle","addBundleItem","removeBundleItem","updateCategoryPricing","previewRepriceMedia","repriceMedia"];
    if (!allowed.includes(name)) throw new Error("Administrator access required");
    const cloneId=assignedClone(access,args[name === "addBundleItem" ? 1 : 0]);
    if (["updatePhoto","deletePhoto","updateVideo","deleteVideo"].includes(name)) {
      const row=await ownedResource(access,name.endsWith("Photo") ? "photos" : "videos",args[1],cloneId);
      if (name.startsWith("delete") && args[2] !== row.storage_path) throw new Error("Media path does not match the selected item");
    }
    if (name === "completeReview") {
      if (args[2] !== "photo" && args[2] !== "video") throw new Error("Invalid media type");
      await ownedResource(access,args[2] === "photo" ? "photos" : "videos",args[1],cloneId);
    }
    if (["updateBundle","deleteBundle","addBundleItem"].includes(name)) await ownedResource(access,"photo_bundles",args[name === "addBundleItem" ? 0 : 1],cloneId);
    if (name === "removeBundleItem") {
      const row=await ownedBundleItem(access,args[1],cloneId);
      if (row.storage_path !== args[2]) throw new Error("Media path does not match the selected item");
    }
    if (name.startsWith("bulk")) {
      if (args[1] !== "photos" && args[1] !== "videos") throw new Error("Invalid media type");
      if (!Array.isArray(args[2]) || !args[2].length || args[2].length > 1000 || args[2].some(id => typeof id !== "string" || !UUID.test(id))) throw new Error("Invalid media selection");
      const ids=[...new Set(args[2])];
      const {data,error}=await serviceClient().from(args[1]).select("id").eq("clone_id",cloneId).in("id",ids);
      if (error || data?.length !== ids.length) throw new Error("Media selection includes inaccessible items");
    }
    return;
  }
  throw new Error("Administrator access required");
}
