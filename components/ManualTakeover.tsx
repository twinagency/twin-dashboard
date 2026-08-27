"use client";

import { useEffect, useState, useTransition } from "react";
import { manualSendText, manualSendVoice, manualSendPhoto } from "@/app/users/actions";

// Manual fan takeover (migration 096). Only ever rendered by app/users/page.tsx
// when the currently-viewed fan is already `paused` (see that page for the
// gate). Three modes: type-and-send text, type-what-she-should-say and
// generate + send a voice note, or pick one of her already-uploaded FREE
// photos to send. Every mode only INSERTs a 'pending' row into `manual_sends`
// — bot/src/manual-send.ts (polled every 10s) does the actual Telegram send,
// so this component never talks to Telegram directly. See that file's header
// for why a polled table rather than a direct call, and for the paid-photo
// safety-gate decision (this picker only ever lists free photos, and the
// server action + bot both re-check that server-side).

type Photo = { id: string; storage_path: string; caption: string | null; image_name: string | null };
type Mode = "text" | "voice" | "photo";

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => d.url && setUrl(d.url))
      .catch(() => {});
  }, [path]);
  if (!url) return <div className="h-16 w-16 shrink-0 rounded bg-muted/10 animate-pulse" />;
  return <img src={url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />;
}

export default function ManualTakeover({ userId, freePhotos }: { userId: string; freePhotos: Photo[] }) {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [words, setWords] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tabCls = (m: Mode) =>
    "rounded-md px-2.5 py-1 text-xs font-medium transition " +
    (mode === m ? "bg-accent text-accent-ink" : "border border-line text-ink/70 hover:bg-elev");

  function submit() {
    setStatus(null);
    startTransition(async () => {
      try {
        if (mode === "text") {
          if (!text.trim()) return setStatus("Type a message first.");
          const fd = new FormData();
          fd.set("userId", userId);
          fd.set("text", text.trim());
          await manualSendText(fd);
          setText("");
        } else if (mode === "voice") {
          if (!words.trim()) return setStatus("Type what she should say first.");
          const fd = new FormData();
          fd.set("userId", userId);
          fd.set("words", words.trim());
          await manualSendVoice(fd);
          setWords("");
        } else {
          if (!photoId) return setStatus("Pick a photo first.");
          const fd = new FormData();
          fd.set("userId", userId);
          fd.set("photoId", photoId);
          fd.set("caption", caption.trim());
          await manualSendPhoto(fd);
          setPhotoId(null);
          setCaption("");
        }
        setStatus("Queued — sends within ~10s.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Send failed.");
      }
    });
  }

  return (
    <div className="rounded-md border border-warn/30 bg-warn/5 p-3">
      <div
        className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warn"
        title="This fan is paused, so the bot won't reply to him. Anything sent here goes out as this creator's bot, right now, exactly once — it does not resume automated replies."
      >
        Manual takeover (fan is paused)
        <span className="cursor-help text-[10px] normal-case text-warn/70">ⓘ</span>
      </div>

      <div className="mb-2 flex gap-1.5">
        <button type="button" className={tabCls("text")} onClick={() => setMode("text")}>
          💬 Text
        </button>
        <button type="button" className={tabCls("voice")} onClick={() => setMode("voice")}>
          🎙️ Voice
        </button>
        <button type="button" className={tabCls("photo")} onClick={() => setMode("photo")}>
          🖼️ Photo
        </button>
      </div>

      {mode === "text" && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type the message to send as her..."
          rows={3}
          className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
        />
      )}

      {mode === "voice" && (
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="Type what she should SAY - it's generated as a real voice note, same pipeline as her automated ones..."
          rows={3}
          className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
        />
      )}

      {mode === "photo" && (
        <div>
          {freePhotos.length === 0 ? (
            <div className="py-2 text-xs text-muted">
              No free (non-paywalled) photos uploaded for this creator. Manual takeover only sends free photos, never paid/paywalled ones.
            </div>
          ) : (
            <>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {freePhotos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPhotoId(p.id)}
                    className={
                      "rounded ring-2 transition " + (photoId === p.id ? "ring-accent" : "ring-transparent hover:ring-line")
                    }
                    title={p.image_name || p.caption || "Photo"}
                  >
                    <Thumb path={p.storage_path} />
                  </button>
                ))}
              </div>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Optional caption..."
                className="mt-2 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
              />
            </>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:bg-accent-deep disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send as her"}
        </button>
        {status && <span className="text-xs text-muted">{status}</span>}
      </div>
    </div>
  );
}
