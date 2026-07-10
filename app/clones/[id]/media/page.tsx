import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import MediaManager from "./MediaManager";

export const dynamic = "force-dynamic";

export default async function MediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [cloneRes, photosRes, videosRes, bundlesRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug").eq("id", id).maybeSingle(),
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

  const clone = cloneRes.data as { id: string; name: string; slug: string };

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-sm text-gray-400 dark:text-neutral-500">
        <Link href="/clones" className="hover:text-gray-900 dark:hover:text-neutral-100">Clones</Link>
        <span>/</span>
        <Link href={`/clones/${id}`} className="hover:text-gray-900 dark:hover:text-neutral-100">{clone.name}</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-neutral-100">Media</span>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">
        {clone.name} <span className="text-gray-400 dark:text-neutral-500">/ Media</span>
      </h1>
      <MediaManager
        cloneId={id}
        photos={photosRes.data ?? []}
        videos={videosRes.data ?? []}
        bundles={bundlesRes.data ?? []}
      />
    </div>
  );
}
