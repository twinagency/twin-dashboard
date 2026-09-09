import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { requireCloneAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, inputCls } from "@/components/clone/fields";
import RevisionStateBadge from "@/components/sequence/RevisionStateBadge";
import SequenceEditor from "@/components/sequence/SequenceEditor";
import {
  canEditRevision,
  canTransitionRevision,
  isMissingSequenceTables,
  revisionEditBlocker,
  type PartDraft,
  type RevisionState,
} from "@/lib/sequence-policy";
import {
  approveSequenceRevision,
  publishSequenceRevision,
  saveSequenceParts,
  withdrawSequenceRevision,
} from "../actions";

export const dynamic = "force-dynamic";

type RevisionRow = {
  id: string;
  revision_no: number;
  state: RevisionState;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  video_sequences: { id: string; clone_id: string; title: string; source_video_id: string | null };
};

export default async function SequenceRevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("video_sequence_revisions")
    .select("id,revision_no,state,approved_by,approved_at,published_at,video_sequences!inner(id,clone_id,title,source_video_id)")
    .eq("id", id)
    .maybeSingle();

  if (error && isMissingSequenceTables(error)) {
    return (
      <div className="dashboard-page text-ink">
        <Card className="p-4 text-sm text-ink">
          Sequence storage is not set up on this database yet. Apply migration 147 and this page starts working.
        </Card>
      </div>
    );
  }
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const revision = data as unknown as RevisionRow;
  const cloneId = revision.video_sequences.clone_id;
  await requireCloneAccess(cloneId);

  const [{ data: partRows }, { data: sourceVideo }] = await Promise.all([
    supabaseAdmin.from("video_sequence_parts")
      .select("position,is_preview,caption,price_stars,source_start_seconds,source_end_seconds,requires_position")
      .eq("revision_id", id).order("position"),
    revision.video_sequences.source_video_id
      ? supabaseAdmin.from("videos").select("caption").eq("id", revision.video_sequences.source_video_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const parts: PartDraft[] = (partRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      position: Number(row.position),
      isPreview: row.is_preview === true,
      caption: (row.caption as string | null) ?? null,
      priceStars: row.price_stars === null ? null : Number(row.price_stars),
      sourceStartSeconds: Number(row.source_start_seconds),
      sourceEndSeconds: Number(row.source_end_seconds),
      requiresPosition: row.requires_position === null ? null : Number(row.requires_position),
    };
  });

  const sourceCaption = (sourceVideo as { caption: string | null } | null)?.caption ?? null;
  const editable = canEditRevision(revision.state);
  const approve = approveSequenceRevision.bind(null, cloneId, id);
  const publish = publishSequenceRevision.bind(null, cloneId, id);
  const withdraw = withdrawSequenceRevision.bind(null, cloneId, id);
  const save = saveSequenceParts.bind(null, cloneId, id);

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/sequences" className="text-sm text-muted transition hover:text-ink">Sequences</Link>
        <span className="text-muted">/</span>
        <h1 className="text-2xl font-semibold">{revision.video_sequences.title}</h1>
        <span className="text-sm text-muted">v{revision.revision_no}</span>
        <RevisionStateBadge state={revision.state} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-4">
          <SequenceEditor
            state={revision.state}
            editable={editable}
            editBlocker={revisionEditBlocker(revision.state)}
            approvedBy={revision.approved_by}
            approvedAt={revision.approved_at}
            sourceCaption={sourceCaption}
            sourceDurationSeconds={null}
            initialParts={parts}
            saveAction={save}
          />
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Approval</h2>
              <Info text="A person has to approve the cut before anything is cut from the recording. Approving sends it to the renderer, which produces the clips and hands them back for review. An automatic step can never satisfy this." />
            </div>
            {revision.approved_by ? (
              <p className="mb-3 text-xs text-muted">
                Approved by {revision.approved_by}
                {revision.approved_at ? ` on ${new Date(revision.approved_at).toLocaleDateString()}` : ""}
              </p>
            ) : (
              <p className="mb-3 text-xs text-muted">Not approved yet.</p>
            )}
            {editable && (
              <form action={approve} className="space-y-2">
                <input name="approvedBy" required className={inputCls} placeholder="who reviewed this" />
                <Button type="submit" variant="outline" size="sm">Approve and render</Button>
              </form>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Publication</h2>
              <Info text="Publishing makes this cut sellable, and is only possible once the renderer has produced every clip. A published revision is frozen: to change it, publish a new one." />
            </div>
            <div className="flex flex-wrap gap-2">
              {canTransitionRevision(revision.state, "published") && (
                <form action={publish}><Button type="submit" size="sm">Publish</Button></form>
              )}
              {canTransitionRevision(revision.state, "unavailable") && (
                <form action={withdraw}><Button type="submit" variant="outline" size="sm">Withdraw</Button></form>
              )}
            </div>
            {revision.state === "published" && (
              <p className="mt-2 text-xs text-muted">
                Withdrawing stops new offers. Parts fans already bought stay theirs and stay supportable.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
