"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mic, MicOff, Send, X } from "lucide-react";

// The slide-out the sidebar orb opens. This is the REAL assistant: it talks to
// /api/ai-assistant, which is the same backend the /ai page used.
//
// It lives here rather than on a page of its own because the whole point is
// that it stays with you while you work - it can open a page for you and keep
// talking about what you are now looking at. A page cannot do that; navigating
// to it is leaving whatever you were doing.

type Proposal = { id: string; tool: string; args: Record<string, unknown>; summary: string; heavy: boolean };
type ProposalState = Proposal & { state: "pending" | "approving" | "approved" | "dismissed"; error?: string };
type Turn = {
  role: "user" | "assistant";
  content: string;
  proposals?: ProposalState[];
  applied?: string[];
  opened?: string[];
};

const QUICK_ASKS = ["Who's earning most?", "Any errors today?", "Open the logs", "Which toggles look wrong?"];

export default function TwinPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, label]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, but never mid-answer: losing a streaming reply because a
  // stray Escape reached the window is worse than having to click the X.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || pending) return;
      setError(null);
      setInput("");
      setTurns((cur) => [...cur, { role: "user", content: question }, { role: "assistant", content: "" }]);
      setPending(true);
      setLabel("Thinking");

      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message: question }),
        });
        if (!res.body) throw new Error("no response stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const patchLast = (fn: (t: Turn) => Turn) =>
          setTurns((cur) => {
            const next = [...cur];
            next[next.length - 1] = fn(next[next.length - 1]);
            return next;
          });

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let e: Record<string, unknown>;
            try {
              e = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (e.type === "start") {
              if (!conversationId) setConversationId(e.conversationId as string);
            } else if (e.type === "token") {
              setLabel(null);
              patchLast((t) => ({ ...t, content: t.content + (e.text as string) }));
            } else if (e.type === "tool_call") {
              setLabel((e.label as string) ?? "Working on it");
            } else if (e.type === "proposal") {
              const p = e as unknown as Proposal;
              patchLast((t) => ({
                ...t,
                proposals: [...(t.proposals ?? []), { ...p, state: "pending" as const }],
              }));
            } else if (e.type === "navigate") {
              // It said it would open a page, so open it. The panel stays put.
              router.push(e.path as string);
              patchLast((t) => ({ ...t, opened: [...(t.opened ?? []), (e.label as string) ?? (e.path as string)] }));
            } else if (e.type === "error") {
              setError(e.message as string);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setPending(false);
        setLabel(null);
      }
    },
    [conversationId, pending, router],
  );

  /** The only thing that can actually apply a change. Nothing else calls /approve. */
  async function approve(turnIndex: number, id: string) {
    const target = turns[turnIndex]?.proposals?.find((p) => p.id === id);
    if (!target || target.state !== "pending") return;

    const setState = (state: ProposalState["state"], errText?: string) =>
      setTurns((cur) =>
        cur.map((t, i) =>
          i !== turnIndex
            ? t
            : { ...t, proposals: t.proposals?.map((p) => (p.id === id ? { ...p, state, error: errText } : p)) },
        ),
      );

    setState("approving");
    try {
      const res = await fetch("/api/ai-assistant/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, tool: target.tool, args: target.args }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? "the change did not go through");
      setState("approved");
      setTurns((cur) =>
        cur.map((t, i) => (i !== turnIndex ? t : { ...t, applied: [...(t.applied ?? []), j.summary as string] })),
      );
      // The page you are on may be showing the value that just changed.
      router.refresh();
    } catch (e) {
      setState("pending", e instanceof Error ? e.message : "failed");
    }
  }

  function dismiss(turnIndex: number, id: string) {
    setTurns((cur) =>
      cur.map((t, i) =>
        i !== turnIndex
          ? t
          : { ...t, proposals: t.proposals?.map((p) => (p.id === id ? { ...p, state: "dismissed" as const } : p)) },
      ),
    );
  }

  // Real speech-to-text via the browser's Web Speech API, where it exists
  // (Chrome). The orb had a microphone button before this that only drove the
  // particle animation - it listened to the audio level and transcribed
  // nothing. A button that looks like dictation and is not is worse than no
  // button, so this either transcribes for real or is hidden.
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => never; webkitSpeechRecognition?: new () => never })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => never }).webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor() as unknown as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
    };
    rec.lang = "en-GB";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      setError("Could not hear that. Try typing instead.");
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <>
      <div
        onClick={() => !pending && onClose()}
        className={
          "fixed inset-0 z-40 bg-[#04122a]/25 backdrop-blur-[2px] transition-opacity duration-300 " +
          (open ? "opacity-100" : "pointer-events-none opacity-0")
        }
        aria-hidden={!open}
      />

      <aside
        role="dialog"
        aria-label="Twin assistant"
        aria-hidden={!open}
        className={
          "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[440px] flex-col border-l border-white/60 bg-[#f6f9ff]/95 shadow-[-18px_0_60px_rgb(12_29_56/0.18)] backdrop-blur-xl transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "pointer-events-none translate-x-full")
        }
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-white/70 px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_currentColor]" />
          <span className="font-heading text-sm font-semibold tracking-tight text-ink">Twin</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink/40">
            {pending ? (label ?? "Working") : "Ready"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Twin"
            className="ml-auto rounded-lg p-1.5 text-ink/50 transition hover:bg-white/70 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {turns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-xs text-ink/45">Ask about the fleet, or tell me to open something.</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {QUICK_ASKS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="rounded-full border border-white/70 bg-white/50 px-2.5 py-1 text-[11px] font-medium text-ink/70 transition hover:border-cyan-300/70 hover:text-ink"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={"flex " + (t.role === "user" ? "justify-end" : "justify-start")}>
                <div className="max-w-[92%] space-y-1.5">
                  {t.content && (
                    <div
                      className={
                        "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed " +
                        (t.role === "user"
                          ? "rounded-br-sm bg-[#0b2444] text-white"
                          : "rounded-bl-sm border border-white/70 bg-white/70 text-ink")
                      }
                    >
                      {t.content}
                    </div>
                  )}

                  {t.opened?.map((o, oi) => (
                    <div key={oi} className="text-[10px] font-medium uppercase tracking-wide text-ink/40">
                      opened {o}
                    </div>
                  ))}

                  {t.proposals?.map((p) => {
                    if (p.state === "dismissed") {
                      return (
                        <div key={p.id} className="rounded-xl border border-white/60 bg-white/40 px-3 py-2 text-[11px] text-ink/40 line-through">
                          {p.summary}
                        </div>
                      );
                    }
                    if (p.state === "approved") return null;
                    return (
                      <div
                        key={p.id}
                        className={
                          "space-y-2 rounded-xl border px-3 py-2.5 " +
                          (p.heavy ? "border-amber-300/70 bg-amber-50/80" : "border-cyan-300/60 bg-cyan-50/70")
                        }
                      >
                        <div className="flex items-start gap-1.5">
                          <span
                            className={
                              "mt-1 h-1.5 w-1.5 shrink-0 rounded-full " + (p.heavy ? "bg-amber-500" : "bg-cyan-500")
                            }
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/45">
                              Needs your approval
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium leading-snug text-ink">{p.summary}</p>
                          </div>
                        </div>
                        {p.error && <p className="text-[11px] text-crit">{p.error}</p>}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={p.state === "approving"}
                            onClick={() => void approve(i, p.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#0b2444] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#123a66] disabled:opacity-50"
                          >
                            {p.state === "approving" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={p.state === "approving"}
                            onClick={() => dismiss(i, p.id)}
                            className="rounded-lg border border-white/70 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-ink/60 transition hover:text-ink disabled:opacity-50"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {t.applied?.map((a, ai) => (
                    <div
                      key={ai}
                      className="flex items-start gap-1.5 rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-[11px] text-good"
                    >
                      <Check className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {pending && label && (
            <div className="flex items-center gap-1.5 text-[11px] text-ink/45">
              <Loader2 className="h-3 w-3 animate-spin" />
              {label}…
            </div>
          )}
        </div>

        {error && <div className="border-t border-crit/25 bg-crit/10 px-4 py-2 text-[11px] text-crit">{error}</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="shrink-0 border-t border-white/70 px-3 py-3"
        >
          <div className="flex items-end gap-1 rounded-xl border border-white/70 bg-white/60 p-1 transition focus-within:border-cyan-300/80">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={listening ? "Listening…" : "Ask, or say what to change"}
              className="max-h-28 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink/40"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? "Stop dictation" : "Dictate"}
                aria-pressed={listening}
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition " +
                  (listening ? "bg-cyan-500 text-white" : "text-ink/50 hover:bg-white/70 hover:text-ink")
                }
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0b2444] text-white transition hover:bg-[#123a66] disabled:opacity-35"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
