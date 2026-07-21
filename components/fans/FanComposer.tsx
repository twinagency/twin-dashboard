"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Compose box for the /users inbox. Sends through the clone's bot via
// /api/send: plain text, a voice note (typed words → ElevenLabs → sendVoice),
// or a media item from her library (free/manual send, no charge).

type MediaItem = {
  id: string;
  type: "photo" | "video";
  name: string;
  starValue: number;
  thumbUrl: string | null;
};

export default function FanComposer({
  cloneId,
  userId,
  lastActive,
}: {
  cloneId: string;
  userId: string;
  lastActive: string | null; // users.last_message_received (ISO) — gates the 24h window
}) {
  const router = useRouter();

  // Telegram Business bots can only message within 24h of the fan's last activity.
  // The API refuses too — this just tells the operator up front instead of on error.
  const lastActiveMs = lastActive ? new Date(lastActive).getTime() : null;
  const windowOpen = lastActiveMs !== null && Date.now() - lastActiveMs <= 24 * 3600 * 1000;
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [mediaErr, setMediaErr] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Load the library the first time the picker opens.
  useEffect(() => {
    if (!pickerOpen || media !== null) return;
    fetch(`/api/send?cloneId=${cloneId}`)
      .then((r) => r.json())
      .then((d) => (d.items ? setMedia(d.items) : setMediaErr(d.error ?? "failed to load media")))
      .catch((e) => setMediaErr(e instanceof Error ? e.message : String(e)));
  }, [pickerOpen, media, cloneId]);

  // Close the picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  async function send(payload: Record<string, unknown>, okNote: string) {
    setSending(true);
    setError(null);
    setSent(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloneId, userId, ...payload }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? `send failed (${res.status})`);
      setText("");
      setPickerOpen(false);
      setSent(okNote);
      setTimeout(() => setSent(null), 3000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const sendTyped = () => {
    const t = text.trim();
    if (!t || sending) return;
    void send({ type: mode, text: t }, mode === "voice" ? "Voice note sent" : "Sent");
  };

  const modeBtn = (m: "text" | "voice", label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setMode(m)}
      className={
        "rounded-md px-2 py-1 text-[11px] font-medium transition " +
        (mode === m ? "bg-muted/15 text-ink" : "text-muted hover:text-ink")
      }
    >
      {label}
    </button>
  );

  if (!windowOpen) {
    const agoTxt =
      lastActiveMs === null ? "never been active" : `last active ${Math.floor((Date.now() - lastActiveMs) / 3600_000)}h ago`;
    return (
      <div className="border-t border-line p-2.5">
        <div className="rounded-lg border border-line bg-elev px-3 py-2 text-[11px] text-muted">
          Outside Telegram's 24h messaging window: this fan has {agoTxt}. The bot can only send after they message again.
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-t border-line p-2.5">
      {/* Media picker popover */}
      {pickerOpen && (
        <div
          ref={pickerRef}
          className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-panel p-2 shadow-lg"
        >
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Send media (free, no charge)
          </div>
          {mediaErr ? (
            <div className="py-4 text-center text-xs text-crit">{mediaErr}</div>
          ) : media === null ? (
            <div className="py-4 text-center text-xs text-muted">Loading library…</div>
          ) : media.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted">No media uploaded for this clone yet.</div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {media.map((m) => (
                <button
                  key={`${m.type}-${m.id}`}
                  type="button"
                  disabled={sending}
                  onClick={() => void send({ type: "media", mediaId: m.id, mediaType: m.type }, `${m.type === "photo" ? "Photo" : "Video"} sent`)}
                  className="group relative overflow-hidden rounded-md border border-line text-left transition hover:border-accent/60 disabled:opacity-50"
                  title={`${m.name} · ${m.starValue}⭐ value · sends free`}
                >
                  {m.thumbUrl ? (
                    m.type === "video" ? (
                      <video src={m.thumbUrl} muted preload="metadata" className="aspect-square w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                    )
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-bg text-[10px] text-muted">
                      {m.type}
                    </div>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-white">
                    {m.type === "video" ? "🎬 " : ""}{m.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(error || sent) && (
        <div className={"mb-1.5 text-[11px] " + (error ? "text-crit" : "text-good")}>
          {error ?? sent}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Text / Voice mode */}
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-elev p-0.5">
          {modeBtn("text", "Text")}
          {modeBtn("voice", "Voice")}
        </div>

        {/* Media picker toggle */}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={sending}
          title="Send media from her library"
          className={
            "shrink-0 rounded-lg border p-2 transition " +
            (pickerOpen ? "border-accent/60 text-accent" : "border-line text-muted hover:text-ink")
          }
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </button>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendTyped();
            }
          }}
          disabled={sending}
          placeholder={mode === "voice" ? "Type words, she says them as a voice note…" : "Message…"}
          className="h-9 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent disabled:opacity-60"
        />

        <button
          type="button"
          onClick={sendTyped}
          disabled={sending || !text.trim()}
          className={
            "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition " +
            (sending || !text.trim()
              ? "bg-muted/15 text-muted"
              : "bg-accent text-white hover:opacity-90")
          }
        >
          {sending ? "Sending…" : mode === "voice" ? "Send voice" : "Send"}
        </button>
      </div>
    </div>
  );
}
