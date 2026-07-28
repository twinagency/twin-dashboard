"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputCls, selectCls, Info } from "@/components/clone/fields";
import RunThread from "./RunThread";
import type { SimEvent, TestRunRow } from "@/lib/test-runs";

type Clone = { id: string; slug: string; name: string; status: string };
type Persona = { key: string; label: string; hint: string };

function elapsed(startedAt: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function dateTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// One live panel: opens its own SSE connection, renders the transcript as it
// grows, and reports back to the console when it finishes so it can drop into
// history. Closing this tab does not stop the run — it's a detached process
// on the server; re-opening the Test page just can't re-attach to it live
// (it'll show up in history once it finishes, or right away via a refresh
// once .../[id] reconciles it).
function LiveRun({
  runId,
  persona,
  cloneName,
  startedAt,
  onFinished,
}: {
  runId: string;
  persona: string;
  cloneName: string;
  startedAt: string;
  onFinished: (runId: string) => void;
}) {
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "running" | "done" | "error" | "stopped">("connecting");
  const [, setTick] = useState(0);

  useEffect(() => {
    const es = new EventSource(`/api/test-run/${runId}/stream`);
    setStatus("running");
    es.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        if (payload.type === "event") {
          setEvents((prev) => [...prev, payload.event]);
        } else if (payload.type === "status") {
          setStatus(payload.status);
          es.close();
          onFinished(runId);
        }
      } catch {
        // a malformed chunk, next one will catch the stream up
      }
    };
    es.onerror = () => {
      // connection dropped client-side only, the run itself keeps going
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stop = async () => {
    await fetch(`/api/test-run/${runId}/stop`, { method: "POST" });
  };

  const live = status === "running" || status === "connecting";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{cloneName} · {persona}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted">
            {live ? (
              <>
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                {elapsed(startedAt)}
                <button type="button" onClick={stop} className="text-crit hover:underline">
                  stop
                </button>
              </>
            ) : (
              <span className={status === "error" ? "text-crit" : "text-muted"}>{status}</span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RunThread runId={runId} events={events} />
      </CardContent>
    </Card>
  );
}

function HistoryRow({ row }: { row: TestRunRow }) {
  const [open, setOpen] = useState(false);
  const summary = row.summary ?? {};
  return (
    <div className="rounded-lg border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
      >
        <span
          className={
            "h-1.5 w-1.5 shrink-0 rounded-full " +
            (row.status === "done" ? "bg-good" : row.status === "error" ? "bg-crit" : "bg-muted")
          }
        />
        <span className="min-w-0 flex-1 truncate text-ink">{row.clone_slug} · {row.persona}</span>
        <span className="shrink-0 text-xs text-muted">{dateTime(row.started_at)}</span>
        <span className="shrink-0 text-xs text-muted">{String(summary.turns ?? row.turns_requested)} turns</span>
        <span className="shrink-0 text-xs text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <RunThread runId={row.id} events={row.events ?? []} compact />
        </div>
      )}
    </div>
  );
}

export default function TestConsole({
  clones,
  personas,
  initialHistory,
  available,
}: {
  clones: Clone[];
  personas: Persona[];
  initialHistory: TestRunRow[];
  /** false when this deployment's filesystem has no bot source to spawn (see
   *  lib/test-runs.ts testRunsAvailable() and dashboard/DOCKER.md) — the
   *  standalone Docker image, not local dev with both repos as siblings. */
  available: boolean;
}) {
  const [cloneSlug, setCloneSlug] = useState(clones[0]?.slug ?? "");
  const [selected, setSelected] = useState<string[]>(["spender"]);
  const [turns, setTurns] = useState(10);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; persona: string; cloneName: string; startedAt: string }[]>([]);
  const [history, setHistory] = useState<TestRunRow[]>(initialHistory);

  const cloneName = clones.find((c) => c.slug === cloneSlug)?.name ?? cloneSlug;

  const togglePersona = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const refreshHistory = async () => {
    const res = await fetch("/api/test-run?limit=30");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.runs ?? []);
    }
  };

  const start = async () => {
    if (!cloneSlug || selected.length === 0) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/test-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloneSlug, personas: selected, turns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed to start");
      const startedAt = new Date().toISOString();
      setActive((prev) => [
        ...data.runs.map((r: { id: string; persona: string }) => ({ ...r, cloneName, startedAt })),
        ...prev,
      ]);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "failed to start");
    } finally {
      setStarting(false);
    }
  };

  const onFinished = (runId: string) => {
    setActive((prev) => prev.filter((r) => r.id !== runId));
    void refreshHistory();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Test</h1>
        <p className="mt-1 text-sm text-muted">
          An AI plays a fan and holds a real conversation with a clone through the real message pipeline. Each run
          hits the real Supabase and the real AI provider, small but real cost per run. Nothing is ever sent to
          Telegram, every fan is a fresh throwaway id that never touches real fan data.
        </p>
      </div>

      {!available && (
        <div className="rounded-lg border border-crit/30 bg-crit/10 px-4 py-3 text-sm text-ink">
          <span className="font-medium">Test runs are not available in this deployment.</span> The bot
          repo's source isn't present on this container's filesystem, this feature needs the bot and
          dashboard repos deployed together (see dashboard/DOCKER.md, &quot;Test page limitation&quot;). Past
          runs below still load fine, from wherever they were originally run.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Run a test</CardTitle>
        </CardHeader>
        <CardContent className={"space-y-4" + (available ? "" : " pointer-events-none opacity-50")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-1 font-medium text-ink">
                Clone
                <Info text="Which clone's live config, media library, and prompt templates the fan talks to." />
              </span>
              <select className={selectCls} value={cloneSlug} onChange={(e) => setCloneSlug(e.target.value)} disabled={!available}>
                {clones.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-1 font-medium text-ink">
                Turns per fan
                <Info text="How many fan messages each run sends before it stops. Pacing is deliberately slow, 20 to 75 seconds per reply, so more turns means a longer wait." />
              </span>
              <input
                type="number"
                min={3}
                max={20}
                className={inputCls}
                value={turns}
                onChange={(e) => setTurns(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink">Fan personas</span>
            <div className="flex flex-wrap gap-1.5">
              {personas.map((p) => {
                const on = selected.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => togglePersona(p.key)}
                    className={
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition " +
                      (on ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-ink/70 hover:opacity-100")
                    }
                  >
                    {p.label}
                    <Info text={p.hint} />
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-muted">
              Picking more than one launches them all at once, concurrently, against the same clone.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={start} disabled={!available || starting || !cloneSlug || selected.length === 0}>
              {starting ? "Starting…" : `Run test${selected.length > 1 ? ` (${selected.length} fans)` : ""}`}
            </Button>
            {startError && <span className="text-sm text-crit">{startError}</span>}
          </div>
        </CardContent>
      </Card>

      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Live</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {active.map((r) => (
              <LiveRun
                key={r.id}
                runId={r.id}
                persona={r.persona}
                cloneName={r.cloneName}
                startedAt={r.startedAt}
                onFinished={onFinished}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No test runs yet.</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((row) => (
              <HistoryRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
