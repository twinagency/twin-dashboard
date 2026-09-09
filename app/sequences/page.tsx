import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { requireCloneAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, inputCls } from "@/components/clone/fields";
import RevisionStateBadge from "@/components/sequence/RevisionStateBadge";
import { createSequence } from "./actions";
import { isMissingSequenceTables } from "@/lib/sequence-policy";
import type { RevisionState } from "@/lib/sequence-policy";

export const dynamic = "force-dynamic";

type SequenceRow = {
  id: string;
  title: string;
  created_at: string;
  source_video_id: string | null;
  video_sequence_revisions: { id: string; revision_no: number; state: RevisionState }[];
};

export default async function SequencesPage() {
  const cloneId = await getCloneScope();
  if (!cloneId) {
    return (
      <div className="dashboard-page text-ink">
        <h1 className="mb-5 flex items-center gap-2 text-2xl font-semibold">
          Sequences
          <Info text="A long recording cut into an optional free preview plus paid parts a fan unlocks one at a time." />
        </h1>
        <Card className="p-4 text-sm text-muted">Pick a creator in the header to manage her sequences.</Card>
      </div>
    );
  }
  await requireCloneAccess(cloneId);

  const { data, error } = await supabaseAdmin
    .from("video_sequences")
    .select("id,title,created_at,source_video_id,video_sequence_revisions(id,revision_no,state)")
    .eq("clone_id", cloneId)
    .order("created_at", { ascending: false });

  // The feature ships before its migration is applied, so say so rather than
  // taking the page down.
  if (error && isMissingSequenceTables(error)) {
    return (
      <div className="dashboard-page text-ink">
        <h1 className="mb-5 text-2xl font-semibold">Sequences</h1>
        <Card className="p-4 text-sm text-ink">
          Sequence storage is not set up on this database yet. Apply migration 147 and this page starts working.
        </Card>
      </div>
    );
  }
  if (error) throw new Error(error.message);

  const sequences = (data ?? []) as unknown as SequenceRow[];
  const { data: videoRows } = await supabaseAdmin
    .from("videos").select("id,caption,storage_path").eq("clone_id", cloneId).order("created_at", { ascending: false }).limit(200);
  const videos = (videoRows ?? []) as { id: string; caption: string | null; storage_path: string }[];

  const create = createSequence.bind(null, cloneId);

  return (
    <div className="dashboard-page text-ink">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-semibold">
        Sequences
        <Info text="A long recording cut into an optional free preview plus paid parts a fan unlocks one at a time. Clips are kept out of the ordinary media pools, so they can only be sold as part of a sequence." />
      </h1>

      <Card className="mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">New sequence</h2>
        <form action={create} className="grid gap-3 sm:grid-cols-[2fr_2fr_auto] sm:items-end">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs text-muted">Title</span>
            <input name="title" required maxLength={200} className={inputCls} placeholder="hotel afternoon" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 flex items-center gap-1 text-xs text-muted">
              Source recording
              <Info text="The full video this sequence is cut from. It stays in the library and keeps its own price. Owning it blocks its clips being resold as new content." />
            </span>
            <select name="sourceVideoId" className={inputCls} defaultValue="">
              <option value="">No source video on file</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {(v.caption || v.storage_path.split("/").pop() || v.id).slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Create draft</Button>
        </form>
      </Card>

      {sequences.length === 0 ? (
        <Card className="p-4 text-sm text-muted">No sequences yet for this creator.</Card>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => {
            const revisions = [...(seq.video_sequence_revisions ?? [])].sort((a, b) => b.revision_no - a.revision_no);
            const live = revisions.find((r) => r.state === "published");
            return (
              <Card key={seq.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{seq.title}</span>
                  {live ? <RevisionStateBadge state="published" /> : <span className="text-xs text-muted">Not live</span>}
                  <span className="ml-auto text-xs text-muted">{new Date(seq.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {revisions.map((rev) => (
                    <Link key={rev.id} href={`/sequences/${rev.id}`}
                      className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm transition hover:border-accent-2">
                      <span className="text-muted">v{rev.revision_no}</span>
                      <RevisionStateBadge state={rev.state} />
                    </Link>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
