"use client";
import { displayDateTime } from "@/lib/onlyfans/time";
import { RotateCw } from "lucide-react";
import type { Handover } from "@/lib/onlyfans/handover";
const ACTIONS: Record<string, string> = { pause_automation: "Paused AI replies", resume_automation: "Resumed AI replies", request_takeover: "Requested takeover", complete_takeover: "Completed the handover", release_takeover: "Handed back to AI", mark_no_contact: "Stopped further contact", change_mode: "Updated reply mode" };
const WHO: Record<string, string> = { you: "You", team: "Team member", operator: "Twin operator", system: "System" };
export default function HandoverPanel({ value, loading, onRefresh }: { value: Handover | null; loading: boolean; onRefresh: () => void }) {
  const owner = value?.owner === "you" ? "You are handling replies" : value?.owner === "team" ? "Another team member is handling replies" : value?.owner === "operator" ? "A Twin operator is handling replies" : "Human control needs review";
  return <section className="of-handover min-w-0" aria-label="Conversation handover" data-of-handover>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="sr-only">Reply ownership</h3><button className="text-xs font-semibold text-accent disabled:opacity-50" type="button" disabled={loading} onClick={onRefresh} aria-label="Refresh reply ownership"><RotateCw size={13} aria-hidden="true"/></button></div>
    <p className="mt-2 text-sm" role="status">{loading ? "Checking reply ownership…" : !value ? "Ownership is unavailable. Refresh before replying." : value.mode === "no_contact" ? "Further contact is stopped" : value.takeoverState === "requested" ? "Takeover requested" : value.takeoverState !== "none" ? owner : value.mode === "automated" ? "AI replies enabled" : "AI replies are paused"}</p>
    {value?.takeoverState === "requested" ? <p className="mt-2 text-xs text-muted">Waiting for the current delivery to settle. Manual replies stay paused until handover completes.</p> : null}
    {value ? <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Activity history</summary>
      {value.events.length ? <ol className="mt-3 space-y-3">{value.events.map(event => <li key={event.revision} className="border-l-2 border-line pl-3 text-xs"><p className="font-medium">{ACTIONS[event.action] ?? "Updated reply controls"}</p><p className="mt-1 text-muted">{WHO[event.who] ?? "System"} · <time dateTime={event.at}>{displayDateTime(event.at)}</time></p></li>)}</ol> : <p className="mt-3 text-xs text-muted">No handover activity recorded yet.</p>}
      {value.hasMore ? <p className="mt-3 text-xs text-muted">Showing the latest 30 changes.</p> : null}</details> : null}
  </section>;
}
