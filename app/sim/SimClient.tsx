"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import ChatThread, { type ThreadMessage } from "@/components/users/ChatThread";

type CloneOpt = { id: string; name: string; slug: string };
type SimTurn = {
  turn: number;
  fan: string;
  her: string;
  media: "none" | "photo" | "video" | "voice";
  mediaCaption?: string;
  mediaStars?: number;
  mediaUrl?: string | null;
  log: string;
};

const PERSONA_OPTS = [
  { key: "spender", label: "Spender" },
  { key: "cheapskate", label: "Cheapskate" },
  { key: "chatty", label: "Chatty" },
  { key: "tester", label: "Tester (probes everything)" },
  { key: "new_fan", label: "New fan" },
  { key: "rude", label: "Rude" },
];

function timeLabel(): string {
  return new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function turnToMessages(t: SimTurn, isFirst: boolean): ThreadMessage[] {
  const fanMsg: ThreadMessage = {
    id: `${t.turn}-fan`,
    fan: true,
    content: t.fan,
    timeLabel: timeLabel(),
    dayLabel: isFirst ? "Simulated conversation" : null,
    startsRun: true,
    endsRun: true,
    kind: "text",
    flowLabel: `sim fan · turn ${t.turn}`,
    flowEmoji: "🧪",
  };

  const herMsg: ThreadMessage =
    t.media === "photo" || t.media === "video"
      ? {
          id: `${t.turn}-her`,
          fan: false,
          content: t.her,
          timeLabel: timeLabel(),
          dayLabel: null,
          startsRun: true,
          endsRun: true,
          kind: t.media,
          mediaUrl: t.mediaUrl ?? null,
          mediaName: t.media === "photo" ? "Photo" : "Video",
          caption: t.mediaCaption ?? null,
          paid: true,
          lockKnown: true,
          stars: t.mediaStars ?? 0,
          flowLabel: `sim · media=${t.media}`,
          flowEmoji: "🧪",
          flowHint: t.log,
        }
      : {
          id: `${t.turn}-her`,
          fan: false,
          content: t.her,
          timeLabel: timeLabel(),
          dayLabel: null,
          startsRun: true,
          endsRun: true,
          kind: "text",
          flowLabel: "sim · text",
          flowEmoji: "🧪",
          flowHint: t.log,
        };

  return [fanMsg, herMsg];
}

export default function SimClient({ clones }: { clones: CloneOpt[] }) {
  const [cloneId, setCloneId] = useState(clones[0]?.id ?? "");
  const [personaKey, setPersonaKey] = useState("spender");
  const [turns, setTurns] = useState(6);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [log, setLog] = useState<{ turn: number; text: string }[]>([]);
  const runId = useRef(0);

  async function start() {
    const myRun = ++runId.current;
    setRunning(true);
    setError(null);
    setMessages([]);
    setLog([]);

    try {
      const res = await fetch("/api/sim/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cloneId, personaKey, turns }),
      });
      if (!res.body) throw new Error("no response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let first = true;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (myRun !== runId.current) return; // a newer run started, drop this one
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { type: "turn"; turn: SimTurn } | { type: "error"; message: string } | { type: "done" };
          if (evt.type === "turn") {
            setMessages((m) => [...m, ...turnToMessages(evt.turn, first)]);
            setLog((l) => [...l, { turn: evt.turn.turn, text: evt.turn.log }]);
            first = false;
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "sim failed");
    } finally {
      if (myRun === runId.current) setRunning(false);
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

      {error ? <Card className="p-4 text-sm text-red-400">{error}</Card> : null}

      {messages.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <Card size="sm" className="flex h-[36rem] flex-col overflow-hidden p-0">
            <ChatThread
              fanId="sim"
              messages={messages}
              lastActiveLabel={running ? "now" : "sim finished"}
              spentStars={0}
              purchasedCount={0}
            />
          </Card>

          {/* "What the AI decided" — not real bot routing (this sim doesn't run
              the bot's flow engine), just this simulator's own media choice per
              turn, kept visible so it's never mistaken for production
              provenance. */}
          <Card size="sm" className="flex h-[36rem] flex-col overflow-y-auto p-3">
            <div className="mb-2 text-xs font-semibold text-muted">Sim log</div>
            <div className="flex flex-col gap-2">
              {log.map((l) => (
                <div key={l.turn} className="rounded-lg bg-elev p-2 text-[11px] text-ink">
                  <div className="mb-0.5 font-semibold text-muted">turn {l.turn}</div>
                  <div className="whitespace-pre-wrap break-words">{l.text}</div>
                </div>
              ))}
              {running && <div className="text-[11px] text-muted">running…</div>}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
