import { notFound } from "next/navigation";
import CloneForm from "@/components/CloneForm";
import { supabaseAdmin } from "@/lib/supabase";
import { assemblePromptPreview } from "@/lib/compiler";
import type { Clone } from "@/lib/types";
import { chartColorForClone, profileImagePathForClone } from "@/lib/colors";

export const dynamic = "force-dynamic";

export default async function EditClonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [cloneRes, photosRes, videosRes, bundlesRes, catalogueBundlesRes, cloneOrderRes] = await Promise.all([
    supabaseAdmin.from("clones").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin.from("photos").select("*").eq("clone_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("videos").select("*").eq("clone_id", id).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("photo_bundles")
      .select("*, photo_bundle_items(*)")
      .eq("clone_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("catalogue_bundles")
      .select("id,title,caption,media_kind,photo_ids,video_ids,price_stars,regular_stars,enabled")
      .eq("clone_id", id)
      .order("sort_order", { ascending: true }),
    supabaseAdmin.from("clones").select("id").order("created_at", { ascending: true }),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (!cloneRes.data) notFound();

  const rawClone = cloneRes.data as Clone;
  const cloneIndex = Math.max(0, (cloneOrderRes.data ?? []).findIndex((row) => row.id === id));
  const appearanceImagePath = profileImagePathForClone(rawClone.intake);
  const fallbackImagePath = [...(photosRes.data ?? [])].reverse().find((photo) => photo.storage_path)?.storage_path ?? null;
  const displayImagePath = appearanceImagePath ?? fallbackImagePath;
  const { data: displayImage } = displayImagePath
    ? await supabaseAdmin.storage.from("media").createSignedUrl(displayImagePath, 3600)
    : { data: null };
  const promptPreview = await assemblePromptPreview(rawClone);
  // The legacy frozen *_prompt columns are no longer used (bot assembles live).
  // Blank them so they don't ship to the client or confuse anyone reading them.
  const clone: Clone = {
    ...rawClone,
    text_prompt: null,
    voice_prompt: null,
    routing_prompt: null,
    photo_reply_prompt: null,
  };

  return (
    <div>
      <CloneForm
        clone={clone}
        promptPreview={promptPreview}
        photos={photosRes.data ?? []}
        videos={videosRes.data ?? []}
        bundles={bundlesRes.data ?? []}
        catalogueBundles={catalogueBundlesRes.data ?? []}
        appearanceImageUrl={displayImage?.signedUrl}
        appearanceColor={chartColorForClone(rawClone.intake, cloneIndex)}
      />
    </div>
  );
}
