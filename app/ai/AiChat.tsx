"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

type ChatTurn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Who are our top 5 spenders?",
  "Any errors in the last day?",
  "What's the ai_mode and text_model for each clone?",
  "How many open feedback items are there?",
];

export default function AiChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, pending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    setError(null);
    setInput("");
    const next: ChatTurn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setPending(true);
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `request failed (${res.status})`);
      setTurns((cur) => [...cur, { role: "assistant", content: j.reply as string }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <Card className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col overflow-hidden p-0">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-bg px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="text-sm text-muted">Ask anything about the platform's data.</div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted transition hover:border-accent/40 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => {
            const user = t.role === "user";
            return (
              <div key={i} className={"flex " + (user ? "justify-end" : "justify-start")}>
                <div
                  className={
                    "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm " +
                    (user ? "rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-elev text-ink")
                  }
                >
                  {t.content}
                </div>
              </div>
            );
          })
        )}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-elev px-3 py-2 text-sm text-muted">Thinking…</div>
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-crit/30 bg-crit/10 px-4 py-2 text-sm text-crit">{error}</div>
      )}

      <form onSubmit={onSubmit} className="flex shrink-0 items-end gap-2 border-t border-line bg-panel p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="Ask about revenue, fans, errors, settings…"
          className="w-full flex-1 resize-none rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-md transition-all hover:bg-accent-deep hover:shadow-lg active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "…" : "Send"}
        </button>
      </form>
    </Card>
  );
}
