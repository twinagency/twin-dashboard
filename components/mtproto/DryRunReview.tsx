"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/clone/fields";
import { reviewDryRunAction } from "@/app/mtproto-campaign/actions";
import type { DryRunSummary, SendPlan } from "@/lib/mtproto/review";
import { Bubble, EmptyBlock, Notice, Panel, StatusPill, When } from "./kit";
import { exclusion, num, timeAgo } from "./view";

export type ReviewState = { reviewed: true; by: string; at: string } | { reviewed: false; reason: string };

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line p-3 text-center">
      <div className={`font-heading text-2xl font-semibold tabular-nums ${tone || "text-ink"}`}>{num(value)}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
    </div>
  );
}

// The dry-run summary the operator must look at before "Go live" unlocks, and
// the "I reviewed this dry run" action. The server records the numbers it
// computes itself (lib/mtproto/runs.ts recordDryRunReview); this component
// only sends the run id. Fan names are already redacted server-side.
export default function DryRunReview({
  runId,
  summary,
  plan,
  creatorNames,
  state,
}: {
  runId: string;
  summary: DryRunSummary;
  plan: SendPlan;
  creatorNames: Record<string, string>;
  state: ReviewState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const review = () => {
    setError(null);
    const fd = new FormData();
    fd.set("runId", runId);
    startTransition(async () => {
      try {
        const r = await reviewDryRunAction(fd);
        if (!r.ok) setError(r.error);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "review failed");
      }
    });
  };

  const reasons = Object.entries(summary.excludedByReason).sort((a, b) => b[1] - a[1]);
  const topReason = Math.max(1, ...reasons.map(([, n]) => n));
  return (
    <Panel
      title="Check the dry run before going live"
      tip="Nothing was sent. This is a rehearsal of exactly what would go out. Read it, then press the review button. Going live stays locked until you do, and it locks again if the numbers you reviewed change."
      actions={state.reviewed ? <StatusPill tone="good" dot>Reviewed</StatusPill> : <StatusPill tone="warn" dot>Waiting for your review</StatusPill>}
      bodyClassName="space-y-6"
    >
      {summary.truncated && <Notice tone="warn">Too large to read completely: figures are a lower bound and review is refused.</Notice>}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Would send" value={summary.wouldSendCount} tone="text-accent-2" />
        <Stat label="Held back" value={summary.holdoutCount} />
        <Stat label="Left out" value={summary.excludedTotal} />
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Why fans were left out
          <Info text="Every fan who was not chosen has one reason. These are safety and fairness rules, not errors." />
        </h3>
        {reasons.length === 0 ? (
          <div className="text-sm text-muted">Nobody was left out.</div>
        ) : (
          <ul className="space-y-2">
            {reasons.map(([reason, n]) => {
              const ex = exclusion(reason);
              return (
                <li key={reason}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1 text-ink">
                      <span className="truncate">{ex.label}</span>
                      {ex.why && <Info text={ex.why} />}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-ink">{num(n)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-muted/50" style={{ width: `${Math.max(3, Math.round((n / topReason) * 100))}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Sample messages ({summary.sample.length} of {summary.wouldSendCount})
          <Info text="Real examples of the messages that would go out. Fan names are hidden, and any name inside a message is replaced with [name]." />
        </h3>
        {summary.sampleWithheld ? (
          <Notice tone="crit">Fan names could not be read, so the sample is withheld rather than shown unredacted.</Notice>
        ) : summary.sample.length === 0 ? (
          <EmptyBlock icon="✉" title="No messages to show" hint="Nothing would be sent in this run." />
        ) : (
          <ul className="max-h-80 space-y-3 overflow-y-auto rounded-2xl bg-muted/5 p-3">
            {summary.sample.map((m, i) => (
              <li key={i}>
                <Bubble who={`To ${m.who}`} text={m.text} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          If you go live: the most that can go out
          <Info text="Exact ceilings, worked out from this run's daily cap, each creator's own cap, and the optional run cap. The lowest of them wins, so this is an upper limit, never a promise." />
        </h3>
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {plan.perClone.map((r) => (
            <li key={r.cloneId} className="flex flex-col gap-1 px-3.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold text-ink">{creatorNames[r.cloneId] ?? r.cloneId}</span>
              {r.paused ? (
                <span className="font-semibold text-crit">
                  paused: not sent ({r.wouldSend} would have sent{r.pausedReason ? `; ${r.pausedReason}` : ""})
                </span>
              ) : (
                <span className="text-muted">
                  <span className="font-semibold tabular-nums text-ink">{r.wouldSend}</span> would send, up to{" "}
                  <span className="font-semibold tabular-nums text-ink">{r.firstDay}</span> on day one{" "}
                  <span className="text-xs">
                    (run daily cap {r.runDailyCap}, creator cap {r.creatorDailyCap ?? "no connection"})
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 text-sm font-semibold text-ink">
          Day one: up to {plan.firstDayTotal}. Whole run: up to {plan.runTotal}
          {plan.runCap ? ` (run cap ${plan.runCap})` : ""}.
        </div>
      </section>

      <div className="rounded-2xl border border-line bg-muted/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="h-10 rounded-xl px-5" onClick={review} disabled={pending || summary.truncated || summary.wouldSendCount === 0}>
            {pending ? "Saving…" : state.reviewed ? "Re-review this dry run" : "I reviewed this dry run"}
          </Button>
          {state.reviewed ? (
            <span className="text-xs text-muted">
              Reviewed by {state.by} <When iso={state.at} relative={timeAgo(state.at)} />. Numbers match.
            </span>
          ) : (
            <span className="text-xs font-medium text-crit">Not reviewed: {state.reason}</span>
          )}
        </div>
        <div className="mt-2 text-[11px] text-muted">Pressing this only records that you looked. It does not send anything. Going live is a separate step with its own typed confirmation.</div>
      </div>
      {error && <Notice tone="crit">{error}</Notice>}
    </Panel>
  );
}
