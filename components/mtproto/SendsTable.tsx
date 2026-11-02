import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SendRow } from "@/lib/mtproto/types";
import { sendFanLabel } from "@/lib/mtproto/sends";
import { Bubble, EmptyBlock, Panel, StatusPill, When } from "./kit";
import { humanError, sendState, timeAgo } from "./view";

// N2.4: every send with ts, fan, exact text, status, error, reply Y/N, reply
// latency, purchase Y/N + Stars. Each send reads like a chat: the exact text
// as a message bubble, then what happened after. CSV export is a plain link
// (no client JS) to the route's own text/csv response.
export default function SendsTable({ runId, rows }: { runId: string; rows: SendRow[] }) {
  return (
    <Panel
      title={`Messages sent (${rows.length})`}
      tip="The exact text each fan received, whether Telegram accepted it (accepted is not the same as read), and whether they replied or bought afterwards."
      actions={
        <Link href={`/mtproto-campaign/runs/${runId}/csv`}>
          <Button variant="outline" size="sm">
            Export CSV
          </Button>
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyBlock icon="✉" title="Nothing sent yet" hint="Real messages appear here as chat bubbles once a live run starts sending. A dry run sends nothing." />
      ) : (
        <ul className="max-h-[40rem] divide-y divide-line overflow-y-auto">
          {rows.map((r) => {
            const st = sendState(r.state);
            return (
              <li key={r.episodeId} className="py-3.5 first:pt-0">
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-ink">{r.cloneName}</span>
                  <span className="text-xs text-muted">
                    to <span className="font-mono">{sendFanLabel(r)}</span>
                  </span>
                  <span className="text-xs text-muted">·</span>
                  <When iso={r.sentAt} relative={r.sentAt ? timeAgo(r.sentAt) : "not sent"} className="text-xs text-muted" />
                  <StatusPill tone={st.tone} dot title={st.hint} className="ml-auto">
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
      )}
    </Panel>
  );
}
