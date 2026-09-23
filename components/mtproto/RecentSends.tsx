import Link from "next/link";
import type { SendRow } from "@/lib/mtproto/types";
import { sendFanLabel } from "@/lib/mtproto/sends-format";
import { Bubble, EmptyBlock, StatusPill, When } from "./kit";
import { humanError, sendState, timeAgo } from "./view";

// The actual message log, fleet wide, newest first: who got what, from which
// creator, whether it landed, whether they replied or bought. Same row shape
// as the run detail page's SendsTable, just merged across every run so this
// tab answers "what is actually being sent" without a click into each run.
export default function RecentSends({ rows }: { rows: (SendRow & { runId: string })[] }) {
  if (rows.length === 0) {
    return <EmptyBlock icon="✉" title="Nothing sent yet" hint="Real messages appear here as chat bubbles once a live run starts sending. A dry run sends nothing." />;
  }
  return (
    <ul className="max-h-[36rem] divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-panel px-4 shadow-[var(--shadow-card)]">
      {rows.map((r) => {
        const st = sendState(r.state);
        return (
          <li key={r.episodeId} className="py-3.5 first:pt-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/mtproto-campaign/runs/${r.runId}`} className="text-sm font-semibold text-ink hover:underline">
                {r.cloneName}
              </Link>
              <span className="text-xs text-muted">
                to <span className="font-mono">{sendFanLabel(r)}</span>
              </span>
              <span className="text-xs text-muted">·</span>
              <When iso={r.sentAt} relative={r.sentAt ? timeAgo(r.sentAt) : "not sent"} className="text-xs text-muted" />
              {r.dryRun && (
                <StatusPill tone="info" dot title="A dry run's rehearsal: nothing left the Telegram account.">
                  Dry, not sent
                </StatusPill>
              )}
              <StatusPill tone={st.tone} dot title={st.hint} className={r.dryRun ? "" : "ml-auto"}>
                {st.label}
              </StatusPill>
            </div>
            {r.text ? <Bubble text={r.text} /> : <div className="text-right text-xs text-muted">No text recorded</div>}
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
              {r.errorCode && (
                <span className="text-crit" title={r.errorCode}>
                  {humanError(r.errorCode)} <span className="font-mono text-[11px]">({r.errorCode})</span>
                </span>
              )}
              <span className={r.repliedAt ? "font-semibold text-good" : "text-muted"}>{r.repliedAt ? "Replied" : "No reply"}</span>
              <span className={r.boughtStars ? "font-semibold text-good" : "text-muted"}>{r.boughtStars ? `Bought ${r.boughtStars} ⭐ within ${r.boughtWithinHours}h` : "No purchase"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
