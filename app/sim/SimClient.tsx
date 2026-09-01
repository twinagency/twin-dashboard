"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

type CloneOpt = { id: string; name: string; slug: string };
type SimTurn = {
  turn: number;
  fan: string;
  her: string;
  media: "none" | "photo" | "video" | "voice";
  mediaCaption?: string;
  mediaStars?: number;
};

const PERSONA_OPTS = [
  { key: "spender", label: "Spender" },
  { key: "cheapskate", label: "Cheapskate" },
  { key: "chatty", label: "Chatty" },
  { key: "tester", label: "Tester (probes everything)" },
  { key: "new_fan", label: "New fan" },
  { key: "rude", label: "Rude" },
];

const MEDIA_ICON: Record<SimTurn["media"], string> = { none: "", photo: "📷", video: "🎥", voice: "🎤" };

export default function SimClient({ clones }: { clones: CloneOpt[] }) {
  const [cloneId, setCloneId] = useState(clones[0]?.id ?? "");
  const [personaKey, setPersonaKey] = useState("spender");
  const [turns, setTurns] = useState(6);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<SimTurn[] | null>(null);

  async function start() {
    setRunning(true);
    setError(null);
    setTranscript(null);
    try {
      const res = await fetch("/api/sim/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cloneId, personaKey, turns }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "sim failed");
      setTranscript(json.transcript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sim failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Creator
          <select
            value={cloneId}
            onChange={(e) => setCloneId(e.target.value)}
            className="rounded-lg border border-white/10 bg-elev px-3 py-2 text-sm text-ink"
          >
            {clones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Fan persona
          <select
            value={personaKey}
            onChange={(e) => setPersonaKey(e.target.value)}
            className="rounded-lg border border-white/10 bg-elev px-3 py-2 text-sm text-ink"
          >
            {PERSONA_OPTS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Turns
          <input
            type="number"
            min={1}
            max={20}
            value={turns}
            onChange={(e) => setTurns(Number(e.target.value))}
            className="w-20 rounded-lg border border-white/10 bg-elev px-3 py-2 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          onClick={start}
          disabled={running || !cloneId}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Start"}
        </button>
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-red-400">{error}</Card>
      ) : null}

      {transcript ? (
        <Card className="flex flex-col gap-3 p-4">
          {transcript.map((t) => (
            <div key={t.turn} className="flex flex-col gap-1">
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-2xl rounded-bl-sm bg-elev px-3 py-2 text-sm text-ink">{t.fan}</div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-pink-500/15 px-3 py-2 text-sm text-ink">
                  {t.media !== "none" ? (
                    <div className="mb-1 text-xs text-muted">
                      {MEDIA_ICON[t.media]} {t.media} {t.mediaStars ? `· ${t.mediaStars}⭐` : ""}
                      {t.mediaCaption ? ` · "${t.mediaCaption}"` : ""}
                    </div>
                  ) : null}
                  {t.her}
                </div>
              </div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
