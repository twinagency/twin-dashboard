import { REVISION_STATE_LABELS, type RevisionState } from "@/lib/sequence-policy";

// Draft, rendering, needs review, live and withdrawn have to be tellable apart
// at a glance: publishing the wrong one is how a fan gets sold a cut nobody
// approved.
const STYLES: Record<RevisionState, string> = {
  draft: "bg-muted/15 text-ink",
  processing: "bg-accent-2/15 text-ink",
  review_required: "bg-warn/15 text-ink",
  published: "bg-good/15 text-ink",
  unavailable: "bg-crit/15 text-ink",
};

export default function RevisionStateBadge({ state }: { state: RevisionState }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold ${STYLES[state]}`}>
      {REVISION_STATE_LABELS[state]}
    </span>
  );
}
