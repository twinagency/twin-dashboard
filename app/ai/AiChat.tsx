"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Check, Plus, Trash2, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { approveOutcome, cardState, type ClaimState, type Proposal, type ProposalCard } from "@/lib/ai-claim-state";
import { UnknownProposalCard } from "@/components/TwinPanel";

type WriteEvent = { summary: string };
// Writes stopped auto-executing on 2026-07-31 (see api/ai-assistant/proposals.ts).
// This page is the phone/tablet way into the assistant - Sidebar's Twin orb is
// `lg:` only - so it needs the same approval cards the orb's panel has. Without
// them a proposal arrives here, renders nothing, and the operator is told a
// change is waiting for a tap that does not exist anywhere on their screen.
type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  writes?: WriteEvent[];
  proposals?: ProposalCard[];
};
type ConversationRow = { id: string; title: string; created_at: string; updated_at: string };
type Suggestion = { id: string; cloneName: string; message: string; prompt: string };

const STARTER_SUGGESTIONS = [
  "Who are our top 5 spenders?",
  "Any errors in the last day?",
  "What's the ai_mode and text_model for each creator?",
  "How many open feedback items are there?",
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function AiChat() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshConversations();
    void refreshSuggestions();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, pending, thinkingLabel]);

  async function refreshConversations() {
    try {
      const res = await fetch("/api/ai-assistant/conversations");
      const j = await res.json();
      if (res.ok) setConversations(j.conversations ?? []);
    } catch {
      // sidebar list is a nice-to-have; a failed refresh isn't worth surfacing an error for
    }
  }

  async function refreshSuggestions() {
    try {
      const res = await fetch("/api/ai-assistant/suggestions");
      const j = await res.json();
      if (res.ok) setSuggestions(j.suggestions ?? []);
    } catch {
      // proactive suggestions are best-effort, never block the chat on them
    }
  }

  async function openConversation(id: string) {
    if (pending) return;
    setError(null);
    setConversationId(id);
    try {
      const res = await fetch(`/api/ai-assistant/conversations/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "failed to load conversation");
      setTurns(
        (j.messages ?? []).map(
          (m: {
            role: "user" | "assistant";
            content: string;
            meta: { writes?: WriteEvent[]; proposals?: Proposal[]; claims?: Record<string, ClaimState> } | null;
          }) => ({
            role: m.role,
            content: m.content,
            writes: m.meta?.writes,
            // A reloaded card takes its stored claim state through the same mapping as a live 409 (lib/ai-claim-state.ts).
            proposals: m.meta?.proposals?.map((p) => ({ ...p, state: cardState(m.meta?.claims?.[p.id], p.id) })),
          }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load conversation");
    }
  }

  function newConversation() {
    if (pending) return;
    setConversationId(null);
    setTurns([]);
    setError(null);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/ai-assistant/conversations/${id}`, { method: "DELETE" });
      if (conversationId === id) newConversation();
      void refreshConversations();
    } catch {
      // best-effort; the row just won't disappear until next refresh
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    setError(null);
    setInput("");
    setTurns((cur) => [...cur, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setPending(true);
    setThinkingLabel("Thinking");

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: question }),
      });
      // The route answers {error} as JSON with 4xx/5xx before any stream; that body is not SSE and would parse to nothing.
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(typeof j?.error === "string" && j.error ? j.error : `The assistant request failed (${res.status}).`);
      }
      if (!res.body) throw new Error("no response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sawNewConversation = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let parsed: any;
          try {
            parsed = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (parsed.type === "start") {
            if (!conversationId) {
              sawNewConversation = true;
              setConversationId(parsed.conversationId);
            }
          } else if (parsed.type === "token") {
            setThinkingLabel(null);
            setTurns((cur) => {
              const next = [...cur];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + parsed.text };
              return next;
            });
          } else if (parsed.type === "tool_call") {
            setThinkingLabel(parsed.label ?? "Working on it");
          } else if (parsed.type === "write") {
            setTurns((cur) => {
              const next = [...cur];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, writes: [...(last.writes ?? []), { summary: parsed.summary }] };
              return next;
            });
          } else if (parsed.type === "proposal") {
            setTurns((cur) => {
              const next = [...cur];
              const last = next[next.length - 1];
              const p: ProposalCard = {
                id: parsed.id,
                tool: parsed.tool,
                args: parsed.args,
                summary: parsed.summary,
                heavy: parsed.heavy,
                state: "pending",
              };
              next[next.length - 1] = { ...last, proposals: [...(last.proposals ?? []), p] };
              return next;
            });
          } else if (parsed.type === "navigate") {
            router.push(parsed.path);
          } else if (parsed.type === "error") {
            setError(parsed.message);
          } else if (parsed.type === "done") {
            setThinkingLabel(null);
          }
        }
      }

      void sawNewConversation; // conversationId already updated live above; refresh the list either way for updated_at/title
      void refreshConversations();
      void refreshSuggestions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
      setThinkingLabel(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  /** Same contract as TwinPanel's: /approve is the only path that writes. */
  async function approve(turnIndex: number, id: string) {
    const target = turns[turnIndex]?.proposals?.find((p) => p.id === id);
    if (!target || target.state !== "pending") return;

    const setProposalState = (state: ProposalCard["state"], errText?: string) =>
      setTurns((cur) =>
        cur.map((t, i) =>
          i !== turnIndex
            ? t
            : { ...t, proposals: t.proposals?.map((p) => (p.id === id ? { ...p, state, error: errText } : p)) },
        ),
      );

    setProposalState("approving");
    try {
      const res = await fetch("/api/ai-assistant/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, proposalId: target.id, tool: target.tool, args: target.args }),
      });
      const out = approveOutcome(res.ok, await res.json(), target.summary);
      setProposalState(out.state, out.error);
      if (out.applied) {
        const summary = out.applied;
        setTurns((cur) => cur.map((t, i) => (i !== turnIndex ? t : { ...t, writes: [...(t.writes ?? []), { summary }] })));
        router.refresh();
      }
    } catch (e) {
      setProposalState("pending", e instanceof Error ? e.message : "failed");
    }
  }

  function dismissProposal(turnIndex: number, id: string) {
    setTurns((cur) =>
      cur.map((t, i) =>
        i !== turnIndex
          ? t
          : { ...t, proposals: t.proposals?.map((p) => (p.id === id ? { ...p, state: "dismissed" as const } : p)) },
      ),
    );
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[480px] gap-3">
      <Card className="hidden w-64 shrink-0 flex-col overflow-hidden p-0 md:flex">
        <div className="shrink-0 border-b border-line p-2">
          <button
            type="button"
            onClick={newConversation}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40"
          >
            <Plus className="size-4" /> New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {conversations.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted">No conversations yet.</div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void openConversation(c.id)}
                className={
                  "group flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition " +
                  (c.id === conversationId ? "bg-elev text-ink" : "text-muted hover:bg-elev/60 hover:text-ink")
                }
              >
                <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-[10px] text-muted opacity-0 group-hover:opacity-100">{timeAgo(c.updated_at)}</span>
                <span
                  role="button"
                  onClick={(e) => void deleteConversation(c.id, e)}
                  className="shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-crit group-hover:opacity-100"
                  title="Delete conversation"
                >
                  <Trash2 className="size-3.5" />
                </span>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-bg px-4 py-4">
          {turns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="text-sm text-muted">Ask anything about the platform's data, or ask it to change a setting.</div>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTER_SUGGESTIONS.map((s) => (
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
              {suggestions.length > 0 && (
                <div className="mt-2 flex w-full max-w-lg flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void send(s.prompt)}
                      className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-left text-xs text-ink transition hover:border-accent/60 hover:bg-accent/10"
                    >
                      <span className="font-medium">Noticed:</span> {s.message}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            turns.map((t, i) => {
              const user = t.role === "user";
              return (
                <div key={i} className={"flex " + (user ? "justify-end" : "justify-start")}>
                  <div className="max-w-[80%] space-y-1.5">
                    {t.content && (
                      <div
                        className={
                          "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm " +
                          (user ? "rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-elev text-ink")
                        }
                      >
                        {t.content}
                      </div>
                    )}
                    {t.proposals?.map((p) => {
                      if (p.state === "approved") return null;
                      if (p.state === "unknown") {
                        return <UnknownProposalCard key={p.id} p={p} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-muted" />;
                      }
                      if (p.state === "dismissed") {
                        return (
                          <div key={p.id} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-muted line-through">
                            {p.summary}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={p.id}
                          className={
                            "space-y-2 rounded-lg border px-3 py-2 " +
                            (p.heavy ? "border-warn/40 bg-warn/10" : "border-accent/40 bg-accent/5")
                          }
                        >
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Needs your approval</p>
                            <p className="mt-0.5 text-xs font-medium text-ink">{p.summary}</p>
                          </div>
                          {p.error && <p className="text-xs text-crit">{p.error}</p>}
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={p.state === "approving"}
                              onClick={() => void approve(i, p.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink transition hover:bg-accent-deep disabled:opacity-50"
                            >
                              {p.state === "approving" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={p.state === "approving"}
                              onClick={() => dismissProposal(i, p.id)}
                              className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs text-muted transition hover:text-ink disabled:opacity-50"
                            >
                              No
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {t.writes?.map((w, wi) => (
                      <div
                        key={wi}
                        className="flex items-start gap-1.5 rounded-lg border border-good/30 bg-good/10 px-3 py-1.5 text-xs text-good"
                      >
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                        <span>{w.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {pending && thinkingLabel && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-elev px-3 py-2 text-sm text-muted">
                <Loader2 className="size-3.5 animate-spin" />
                {thinkingLabel}…
              </div>
            </div>
          )}
        </div>

        {suggestions.length > 0 && turns.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line bg-panel px-3 py-2">
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void send(s.prompt)}
                disabled={pending}
                className="rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-ink transition hover:border-accent/60 disabled:opacity-50"
              >
                {s.message}
              </button>
            ))}
          </div>
        )}

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
            placeholder="Ask about revenue, fans, errors, settings, or ask it to turn something on…"
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
    </div>
  );
}
