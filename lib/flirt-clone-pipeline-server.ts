import { serviceClient } from "./supabase-service";
import { runCloneBuild, type CloneBuildStore, type PipelineDeps } from "./flirt-clone-pipeline";
import { twinCloneWriter } from "./flirt-twin-writer";

// FLIRT-side reads and the link write. All against the FLIRT project (serviceClient),
// never Twin. Twin is only reached through twinCloneWriter() and only when enabled.
export function flirtCloneBuildStore(db = serviceClient()): CloneBuildStore {
  return {
    async load(id) {
      const [account, application, consent, files, link] = await Promise.all([
        db.from("creator_accounts").select("id,display_name,account_status").eq("id", id).maybeSingle(),
        db.from("creator_applications").select("status,answers").eq("creator_account_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("creator_consents").select("legal_name,consent_version,signed_at").eq("creator_account_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("creator_files").select("id,kind,bucket,storage_path,original_name,mime_type,size_bytes,storage_transfer_status").eq("creator_account_id", id),
        db.from("creator_clone_links").select("twin_slug").eq("creator_account_id", id).maybeSingle(),
      ]);
      if ([account, application, consent, files, link].some((r) => r.error)) throw new Error("Creator details are unavailable");
      if (!account.data) return null;
      return { input: { account: account.data, application: application.data, consent: consent.data, files: files.data ?? [] }, link: link.data };
    },
    async saveLink(id, twinSlug) {
      // clone_id stays null on purpose: it is a foreign key to FLIRT's own (empty) clones
      // table, and the clone lives in Twin. twin_slug is the reference.
      const r = await db.from("creator_clone_links").upsert(
        { creator_account_id: id, clone_id: null, twin_slug: twinSlug, linked_at: new Date().toISOString() },
        { onConflict: "creator_account_id" });
      if (r.error) throw new Error("Link could not be saved");
    },
  };
}

export const productionPipelineDeps = (): PipelineDeps => ({ store: () => flirtCloneBuildStore(), writer: () => twinCloneWriter() });
export const buildCloneForCreator = (id: string) => runCloneBuild(id, productionPipelineDeps());
