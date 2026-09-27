"use client";
import { useEffect, useRef, useState } from 'react';
import { Check, LockKeyhole, Play, Video } from 'lucide-react';
import type { CatalogueItem } from '@/lib/catalogue-core';
import { formatVideoDuration } from '@/lib/catalogue-video-duration';

type Call = (action: string, payload?: Record<string, unknown>) => Promise<Response>;
type Sources = { url: string; posterUrl: string; seconds: number; durationSeconds?: number };
let active = 0;
const waiting: Array<() => void> = [];
async function previewSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try { return await work(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export default function VideoPreview({ item, blur, call, retryable }: {
  item: CatalogueItem; blur: number; call: Call; retryable: boolean;
}) {
  const container = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  const [nearby, setNearby] = useState(false), [visible, setVisible] = useState(false);
  const [sources, setSources] = useState<Sources | null>(null), [error, setError] = useState(false);
  const [retry, setRetry] = useState(0), [playbackError, setPlaybackError] = useState(false);
  const [playing, setPlaying] = useState(false), [posterError, setPosterError] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const fullDuration = formatVideoDuration(sources?.durationSeconds);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { threshold: 0.15 });
    const preload = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); preload.disconnect(); }
    }, { rootMargin: '180px' });
    observer.observe(container.current); preload.observe(container.current);
    return () => { observer.disconnect(); preload.disconnect(); };
  }, []);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMotionAllowed(!motion.matches && !document.hidden);
    sync(); motion.addEventListener('change', sync); document.addEventListener('visibilitychange', sync);
    return () => { motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useEffect(() => {
    if (!nearby) return;
    let cancelled = false, timer: number | undefined;
    setSources(null); setError(false); setPlaybackError(false); setPlaying(false); setPosterError(false);
    const load = async (attempt: number) => {
      try {
        const result = await previewSlot(async () => {
          if (cancelled) return null;
          const response = await call('preview', { type: 'video', id: item.id, blur, delivery: 'native' });
          const data = await response.json();
          return { ok: response.ok, data };
        });
        if (cancelled || !result) return;
        if (!result.ok) {
          if (String(result.data.error).startsWith('Preview busy') && attempt < 8) {
            timer = window.setTimeout(() => void load(attempt + 1), Math.min(12_000, 2_000 * 2 ** attempt));
            return;
          }
          throw new Error('preview');
        }
        if (!result.data.url || !result.data.posterUrl) throw new Error('preview');
        setSources(result.data);
      } catch {
        if (cancelled) return;
        if (attempt < 2) timer = window.setTimeout(() => void load(attempt + 1), 2_000 * (attempt + 1));
        else setError(true);
      }
    };
    timer = window.setTimeout(() => void load(0), 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [nearby, item.id, blur, call, retry]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (visible && motionAllowed && !playbackError) void element.play().catch(() => { setPlaying(false); });
    else element.pause();
    return () => element.pause();
  }, [visible, motionAllowed, sources, playbackError]);
  return <div ref={container} className="cat-preview cat-video-preview">
    {sources && <>
      <video ref={video} src={sources.url} poster={sources.posterUrl} muted loop playsInline
        autoPlay={visible && motionAllowed} preload="auto" controls={retryable}
        controlsList="nodownload noremoteplayback" disablePictureInPicture
        aria-label="Five-second blurred video preview" onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setPlaybackError(true); setPlaying(false); }} />
      {!playing && !posterError && <img className="cat-video-poster" src={sources.posterUrl} alt="Blurred video preview" onError={() => setPosterError(true)} />}
    </>}
    {(!sources || (posterError && (!playing || playbackError))) && <div className="cat-placeholder cat-video-loading" role="status">
      <Video size={28} /><span>{error || playbackError || posterError ? 'Preview unavailable' : 'Loading preview…'}</span>
      {(error || playbackError || posterError) && retryable && <button type="button" onClick={e => { e.stopPropagation(); setRetry(v => v + 1); }}>Retry preview</button>}
    </div>}
    <span className="cat-type">VIDEO</span>
    <span className="cat-lock" aria-label={item.purchased || item.received ? 'Unlocked' : 'Locked preview'}>
      {item.purchased || item.received ? <Check size={14} /> : <LockKeyhole size={13} />}
    </span>
    {sources && !retryable && !(posterError && !playing) && <span className="cat-video-label"><Play size={11} fill="currentColor" /> {playbackError ? 'Preview unavailable' : '5-sec preview'}</span>}
    {fullDuration && <span className="cat-video-duration" aria-label={`Full video: ${fullDuration}`}>{fullDuration}</span>}
    {sources && playbackError && retryable && <button type="button" className="cat-video-retry" onClick={() => setRetry(v => v + 1)}><Play size={14} /> Play preview</button>}
  </div>;
}
