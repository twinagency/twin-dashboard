"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { stopRunAction } from "@/app/mtproto-campaign/actions";
import RunStatusBadge, { RunModeBadge } from "./RunStatusBadge";
import RecentSends from "./RecentSends";
import { CreatorAvatar, EmptyBlock, Panel, When } from "./kit";
import { num, timeAgo } from "./view";
import type { RunStatus, SendRow } from "@/lib/mtproto/types";

export type ActivityRunRow = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  dryRun: boolean;
  status: RunStatus;
  stopRequested: boolean;
  cloneNames: string;
  /** First clone in the run, for the row's avatar. */
  avatarCloneId: string;
  note: string | null;
  segmentLabel: string;
  sent: number;
  replied: number;
  converted: number;
  heldBack: number;
  queued: number;
  failed: number;
  /** ISO timestamp in the future when a creator on this run is currently
   *  paused with a known resume time (e.g. an auto flood-wait), else null. */
  waitingUntil: string | null;
};

function StopButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("runId", runId);
      const res = await stopRunAction(fd);
      if (!res.ok) setError(res.error ?? "failed");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="destructive" className="h-8 rounded-lg" onClick={stop} disabled={pending}>
        {pending ? "Stopping..." : "Stop"}
      </Button>
      {error && <span className="text-xs text-crit">{error}</span>}
    </div>
  );
}

function Count({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col items-center px-1.5">
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{num(value)}</span>
      <span className="text-[10px] uppercase tracking-[0.06em] text-muted">{label}</span>
    </div>
  );
}

/** "Waiting for Telegram until HH:MM", hydration-safe like kit.tsx's <When>. */
function WaitingUntil({ iso }: { iso: string }) {
  const time = new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <span suppressHydrationWarning className="text-xs font-medium text-warn">
      Waiting for Telegram until {time}
    </span>
  );
}

function RunRow({ row, selected, onSelect }: { row: ActivityRunRow; selected: boolean; onSelect: () => void }) {
  const title = row.note?.trim() || `${row.cloneNames} · ${row.segmentLabel} · ${new Date(row.createdAt).toLocaleDateString()}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className={`flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 sm:flex-nowrap ${
        selected ? "bg-accent-2/5 ring-1 ring-inset ring-accent-2/30" : "cursor-pointer hover:bg-muted/5"
      }`}
    >
      <CreatorAvatar id={row.avatarCloneId} name={row.cloneNames} className="size-9 shrink-0 text-xs" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          <RunModeBadge dryRun={row.dryRun} />
          <RunStatusBadge status={row.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="truncate">{row.cloneNames}</span>
          <span>·</span>
          <span>
            Started <When iso={row.startedAt} relative={row.startedAt ? timeAgo(row.startedAt) : "not yet"} />
          </span>
          {row.waitingUntil && (
            <>
              <span>·</span>
              <WaitingUntil iso={row.waitingUntil} />
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-line bg-muted/5 px-2 py-1.5">
        <Count label="Sent" value={row.sent} />
        <Count label="Replied" value={row.replied} tone="text-good" />
        <Count label="Converted" value={row.converted} tone="text-good" />
        <Count label="Held back" value={row.heldBack} />
        <Count label="Queued" value={row.queued} tone="text-info" />
        <Count label="Failed" value={row.failed} tone={row.failed > 0 ? "text-crit" : "text-ink"} />
      </div>
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {row.status === "running" && !row.stopRequested && <StopButton runId={row.id} />}
        <Link href={`/mtproto-campaign/runs/${row.id}`} className="text-xs font-semibold text-accent-2 hover:underline">
          Full details
        </Link>
      </div>
    </div>
  );
}

// The Activity tab, in one client component so clicking a run selects it and
// filters the message log below IN PLACE (2026-09-23 fix: it used to navigate
// to the run detail page and the log never filtered). "All runs" resets the
// filter. A small "Full details" link is kept for the fuller run page
// (dry-run review, halts, lift windows). Auto-refreshes every ~10s while the
// tab is visible, same pause-when-hidden pattern as app/logs/AutoRefresh.tsx.
export default function ActivityFeed({ runs, sends }: { runs: ActivityRunRow[]; sends: (SendRow & { runId: string })[] }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, [router]);

  if (runs.length === 0) {
    return <EmptyBlock icon="▶" title="No runs yet" hint="Start one from the New run tab. It always begins as a dry run: nothing is sent." />;
  }

  const filteredSends = selectedRunId ? sends.filter((s) => s.runId === selectedRunId) : sends;

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-card)]">
        {runs.map((r) => (
          <RunRow key={r.id} row={r} selected={r.id === selectedRunId} onSelect={() => setSelectedRunId((prev) => (prev === r.id ? null : r.id))} />
        ))}
      </div>
      <Panel
        title={`Messages sent (${num(filteredSends.length)})`}
        tip="The exact text each fan received, whether Telegram accepted it, and whether they replied or bought afterwards. Dry-run rows are included, clearly marked."
        actions={
          selectedRunId && (
            <button type="button" onClick={() => setSelectedRunId(null)} className="text-xs font-semibold text-accent-2 hover:underline">
              All runs
            </button>
          )
        }
      >
        <RecentSends rows={filteredSends} />
      </Panel>
    </div>
  );
}
