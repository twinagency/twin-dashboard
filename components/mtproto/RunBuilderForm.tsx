"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { previewAudienceAction, createRunAction } from "@/app/mtproto-campaign/actions";
import {
  DEFAULT_DAILY_CAP,
  DEFAULT_HOLDOUT_PCT,
  HOLDOUT_MAX_PCT,
  HOLDOUT_MIN_PCT,
  PREVIEW_EXCLUSION_REASONS,
  RUN_SEGMENTS,
  type AudiencePreview,
  type CreatorLite,
} from "@/lib/mtproto/types";

const SEGMENT_LABEL: Record<(typeof RUN_SEGMENTS)[number], string> = {
  all_silent: "All silent fans",
  top_spenders: "Top spenders",
  lapsed_buyers: "Lapsed buyers (bought before, gone quiet)",
  never_bought: "Never bought",
};

const REASON_LABEL: Record<(typeof PREVIEW_EXCLUSION_REASONS)[number], string> = {
  blocked: "Blocked",
  paused: "Paused",
  inactive: "Inactive",
  minor_gated: "Minor-gated",
  us_location: "US location",
  opt_out: "Opted out",
  already_contacted: "Already contacted this episode",
  legacy_import: "Legacy import (old n8n stack)",
  no_chat_id: "No chat id",
  within_24h: "Not yet 24h silent",
  holdout: "Hold-out (control group)",
  cap_reached: "Cap reached",
};

export default function RunBuilderForm({ creators }: { creators: CreatorLite[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = () => {
    setError(null);
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        const result = await previewAudienceAction(fd);
        if (!result.ok) {
          setError(result.error);
          setPreview(null);
          return;
        }
        setPreview(result.preview);
      } catch (e) {
        setError(e instanceof Error ? e.message : "preview failed");
        setPreview(null);
      }
    });
  };

  const createRun = () => {
    setError(null);
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        const result = await createRunAction(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/mtproto-campaign/runs/${result.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "create run failed");
      }
    });
  };

  return (
    <form ref={formRef} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Creators</CardTitle>
            <CardDescription>Pick one or more. Caps and hold-out apply per creator.</CardDescription>
          </CardHeader>
          <CardContent>
            {creators.length === 0 ? (
              <div className="text-sm text-muted-foreground">No creators found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {creators.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <input type="checkbox" name="cloneIds" value={c.id} onChange={() => setPreview(null)} />
                    <span className="truncate">{c.name}</span>
                    {c.status === "paused" && (
                      <Badge variant="outline" className="ml-auto">
                        paused
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Segment
              <select name="segment" defaultValue="all_silent" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {RUN_SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Min spend (Stars)
              <input type="number" min={0} name="minSpendStars" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <label className="text-sm">
              Silent at least (days)
              <input type="number" min={1} defaultValue={1} name="lastActiveFromDays" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <label className="text-sm">
              Silent at most (days, optional)
              <input type="number" min={1} name="lastActiveToDays" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <label className="text-sm">
              Language code (optional)
              <input type="text" name="language" placeholder="en" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Caps &amp; hold-out</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="text-sm">
              Daily cap / creator
              <input type="number" min={1} max={100} step={1} defaultValue={DEFAULT_DAILY_CAP} name="dailyCap" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <label className="text-sm">
              Run cap / creator (optional)
              <input type="number" min={1} max={10000} step={1} name="runCap" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <label className="text-sm">
              Hold-out % (10-20)
              <input type="number" min={HOLDOUT_MIN_PCT} max={HOLDOUT_MAX_PCT} step={1} defaultValue={DEFAULT_HOLDOUT_PCT} name="holdoutPct" onChange={() => setPreview(null)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            </label>
          </CardContent>
        </Card>

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={runPreview} disabled={pending}>
            {pending ? "Working…" : "Preview"}
          </Button>
          <Button type="button" onClick={createRun} disabled={pending || !preview}>
            Create run (dry run)
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Read-only. Nothing is written until you create the run.</CardDescription>
          </CardHeader>
          <CardContent>
            {!preview ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Run a preview to see who this would reach.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border p-2">
                    <div className="text-lg font-semibold tabular-nums">{preview.candidatePool}</div>
                    <div className="text-[11px] text-muted-foreground">candidates</div>
                  </div>
                  <div className="rounded-lg border border-good/30 bg-good/10 p-2">
                    <div className="text-lg font-semibold tabular-nums text-good">{preview.eligible}</div>
                    <div className="text-[11px] text-muted-foreground">eligible</div>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <div className="text-lg font-semibold tabular-nums">{preview.holdout}</div>
                    <div className="text-[11px] text-muted-foreground">hold-out</div>
                  </div>
                </div>
                {preview.truncated && (
                  <div className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">
                    Candidate read hit the row ceiling — counts below are a lower bound.
                  </div>
                )}
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Excluded ({preview.excludedTotal})
                  </div>
                  <ul className="space-y-1 text-sm">
                    {PREVIEW_EXCLUSION_REASONS.filter((r) => preview.excluded[r] > 0).map((r) => (
                      <li key={r} className="flex justify-between">
                        <span className="text-muted-foreground">{REASON_LABEL[r]}</span>
                        <span className="tabular-nums">{preview.excluded[r]}</span>
                      </li>
                    ))}
                    {preview.excludedTotal === 0 && <li className="text-muted-foreground">Nothing excluded.</li>}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample fans</div>
                  {preview.sample.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No eligible fans yet.</div>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {preview.sample.map((f) => (
                        <li key={f.userId} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
                          <span className="truncate">{f.name ?? f.telegramId}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {f.spendTier ?? "none"} · {f.totalSpentStars}⭐
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
