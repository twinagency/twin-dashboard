"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { reviewDryRunAction } from "@/app/mtproto-campaign/actions";
import type { DryRunSummary, SendPlan } from "@/lib/mtproto/review";

export type ReviewState = { reviewed: true; by: string; at: string } | { reviewed: false; reason: string };

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dry-run review</CardTitle>
        <CardDescription>Nothing was sent. Read this, then press the review button. Going live stays locked until you do.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.truncated && (
          <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Too large to read completely: figures are a lower bound and review is refused.</div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border p-2">
            <div className="text-lg font-semibold tabular-nums">{summary.wouldSendCount}</div>
            <div className="text-[11px] text-muted-foreground">would send</div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-lg font-semibold tabular-nums">{summary.holdoutCount}</div>
            <div className="text-[11px] text-muted-foreground">hold-out</div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-lg font-semibold tabular-nums">{summary.excludedTotal}</div>
            <div className="text-[11px] text-muted-foreground">excluded</div>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Excluded by reason</div>
          {reasons.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing excluded.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {reasons.map(([reason, n]) => (
                <li key={reason} className="flex justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{reason}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sample messages ({summary.sample.length} of {summary.wouldSendCount}, names redacted)
          </div>
          {summary.sampleWithheld ? (
            <div className="text-sm text-destructive">Fan names could not be read, so the sample is withheld rather than shown unredacted.</div>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {summary.sample.map((m, i) => (
                <li key={i} className="rounded-md border border-border px-2 py-1">
                  <div className="text-[11px] text-muted-foreground">{m.who}</div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">If you go live (exact ceilings)</div>
          <ul className="space-y-1 text-sm">
            {plan.perClone.map((r) => (
              <li key={r.cloneId} className="flex justify-between">
                <span>{creatorNames[r.cloneId] ?? r.cloneId}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.wouldSend} would send, day one {r.firstDay} (run daily cap {r.runDailyCap}, creator cap {r.creatorDailyCap ?? "no connection"})
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1 text-sm font-semibold">
            Day one: up to {plan.firstDayTotal}. Whole run: up to {plan.runTotal}
            {plan.runCap ? ` (run cap ${plan.runCap})` : ""}.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={review} disabled={pending || summary.truncated || summary.wouldSendCount === 0}>
            {state.reviewed ? "Re-review this dry run" : "I reviewed this dry run"}
          </Button>
          {state.reviewed ? (
            <span className="text-xs text-muted-foreground">Reviewed by {state.by} at {new Date(state.at).toLocaleString()}. Numbers match.</span>
          ) : (
            <span className="text-xs text-destructive">Not reviewed: {state.reason}</span>
          )}
        </div>
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      </CardContent>
    </Card>
  );
}
