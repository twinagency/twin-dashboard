"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Signed links expire after five minutes. Re-sign on resume or a failed load. */
export default function SignedMediaPreview({ path, type, className, onOpen }: {
  path: string; type: "photo" | "video"; className?: string; onOpen?: () => void;
}) {
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const recovered = useRef(false);
  const expiresAt = useRef(0);
  const cls = className ?? "h-20 w-20 rounded object-cover";
  const retry = useCallback(() => {
    setFailed(false);
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => { recovered.current = false; }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setPreview(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(`/api/media-sign?path=${encodeURIComponent(path)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || typeof data.url !== "string") throw new Error("Preview unavailable");
        if (current) {
          expiresAt.current = typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + 300_000;
          setPreview({ path, url: data.url });
        }
      } catch {
        if (current) setFailed(true);
      } finally { clearTimeout(timeout); }
    })();
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [path, attempt]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible" && expiresAt.current > 0 && Date.now() >= expiresAt.current - 10_000) {
        expiresAt.current = 0;
        recovered.current = false;
        retry();
      }
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [retry]);

  const onError = () => {
    if (!recovered.current) { recovered.current = true; retry(); }
    else setFailed(true);
  };
  if (failed) return (
    <button type="button" className={cls + " flex items-center justify-center bg-muted/10 p-2 text-center text-xs text-muted"}
      onClick={event => { event.stopPropagation(); recovered.current = false; retry(); }}
    >
      Preview unavailable. Retry
    </button>
  );
  if (!preview || preview.path !== path) return <div aria-label="Loading preview" className={cls + " bg-muted/10 animate-pulse"} />;
  const media = type === "video"
    // iOS Safari paints no frame for preload="metadata" until a start time is
    // given; #t=0.1 makes it render the first frame as the thumbnail.
    ? <video src={`${preview.url}#t=0.1`} className={cls} muted playsInline preload="metadata" onError={onError} />
    : <img src={preview.url} alt="" className={cls} onError={onError} />;
  return onOpen ? <button type="button" onClick={onOpen} className="block w-full" aria-label="View full size and caption">{media}</button> : media;
}
