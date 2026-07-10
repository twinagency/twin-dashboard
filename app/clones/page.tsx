import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Clone } from "@/lib/types";
import ClonesGrid, { type CloneCard } from "@/components/ClonesGrid";
import { colorForIndex } from "@/lib/colors";

export const dynamic = "force-dynamic";

export default async function ClonesPage() {
  const { data, error } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,status,photos_enabled,videos_enabled,voice_enabled,voice_id,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load clones: {error.message}
      </div>
    );
  }

  const clones = (data ?? []) as Partial<Clone>[];
  const cloneIds = clones.map((c) => c.id).filter(Boolean) as string[];

  // Per-clone totals: stars earned, user count, and a cover photo for the avatar.
  const starsByClone = new Map<string, number>();
  const usersByClone = new Map<string, number>();
  const avatarUrlByCloneId = new Map<string, string>();

  if (cloneIds.length > 0) {
    const [purchasesRes, usersRes, photosRes] = await Promise.all([
      supabaseAdmin.from("message_purchases").select("clone_id, amount_stars").in("clone_id", cloneIds),
      supabaseAdmin.from("users").select("clone_id").in("clone_id", cloneIds),
      supabaseAdmin.from("photos").select("clone_id, storage_path").in("clone_id", cloneIds).order("created_at", { ascending: true }),
    ]);

    for (const p of purchasesRes.data ?? []) {
      if (p.clone_id) starsByClone.set(p.clone_id, (starsByClone.get(p.clone_id) ?? 0) + (p.amount_stars ?? 0));
    }
    for (const u of usersRes.data ?? []) {
      if (u.clone_id) usersByClone.set(u.clone_id, (usersByClone.get(u.clone_id) ?? 0) + 1);
    }

    const firstPath = new Map<string, string>();
    for (const p of photosRes.data ?? []) {
      if (p.clone_id && !firstPath.has(p.clone_id)) firstPath.set(p.clone_id, p.storage_path);
    }
    for (const [cloneId, path] of firstPath) {
      const { data: signed } = await supabaseAdmin.storage.from("media").createSignedUrl(path, 3600);
      if (signed?.signedUrl) avatarUrlByCloneId.set(cloneId, signed.signedUrl);
    }
  }

  const cards: CloneCard[] = clones.map((c, i) => ({
    id: c.id as string,
    name: c.name ?? "",
    slug: c.slug ?? "",
    status: c.status ?? "paused",
    active: c.status === "active",
    color: colorForIndex(i),
    photoUrl: c.id ? avatarUrlByCloneId.get(c.id) : undefined,
    stars: c.id ? starsByClone.get(c.id) ?? 0 : 0,
    users: c.id ? usersByClone.get(c.id) ?? 0 : 0,
    features: [
      c.photos_enabled && "📷 Photo",
      c.videos_enabled && "🎬 Video",
      c.voice_enabled && (c.voice_id ? "🎙️ Voice" : "🎙️ Voice ⚠️"),
    ].filter(Boolean) as string[],
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Clones</h1>
        <span className="text-sm font-medium text-gray-500 dark:text-neutral-400">{clones.length} total</span>
      </div>

      {clones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center">
          <p className="mb-4 text-gray-500 dark:text-neutral-400">No clones yet.</p>
          <Link href="/clones/new" className="inline-block rounded-lg bg-gray-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white px-5 py-2 font-medium text-white hover:bg-gray-700 transition">
            Create the first one
          </Link>
        </div>
      ) : (
        <ClonesGrid clones={cards} />
      )}
    </div>
  );
}
