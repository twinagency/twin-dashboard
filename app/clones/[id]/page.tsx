import Link from "next/link";
import { notFound } from "next/navigation";
import CloneForm from "@/components/CloneForm";
import { supabaseAdmin } from "@/lib/supabase";
import { assembleClonePrompts } from "@/lib/compiler";
import type { Clone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditClonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [cloneRes, photosRes, videosRes, bundlesRes] = await Promise.all([
    supabaseAdmin.from("clones").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin.from("photos").select("*").eq("clone_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("videos").select("*").eq("clone_id", id).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("photo_bundles")
      .select("*, photo_bundle_items(*)")
      .eq("clone_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (!cloneRes.data) notFound();

  const rawClone = cloneRes.data as Clone;
  const livePrompts = await assembleClonePrompts(rawClone);
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
      <div className="mb-2 flex items-center gap-3 text-sm text-gray-400 dark:text-neutral-500">
        <Link href="/clones" className="hover:text-gray-900 dark:hover:text-neutral-100">Clones</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-neutral-100">{clone.name === "New Clone" ? "New clone" : clone.name}</span>
      </div>
      <h1 className="mb-6 mt-2 text-2xl font-semibold">
        {clone.name === "New Clone" ? "New clone" : <>Edit {clone.name} <span className="text-gray-400 dark:text-neutral-500">/ {clone.slug}</span></>}
      </h1>

      <CloneForm
        clone={clone}
        livePrompts={livePrompts}
        photos={photosRes.data ?? []}
        videos={videosRes.data ?? []}
        bundles={bundlesRes.data ?? []}
      />
    </div>
  );
}
