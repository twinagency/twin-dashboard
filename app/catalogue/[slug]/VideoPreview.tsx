"use client";
import { useEffect, useRef, useState } from 'react';
import { Check, LockKeyhole, Play, Video } from 'lucide-react';
import type { CatalogueItem } from '@/lib/catalogue-core';

type Call = (action: string, payload?: Record<string, unknown>) => Promise<Response>;
export default function VideoPreview({ item, blur, call, retryable }: {
  item: CatalogueItem; blur: number; call: Call; retryable: boolean;
}) {
  const container = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  const [nearby, setNearby] = useState(false), [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null), [error, setError] = useState(false);
  const [retry, setRetry] = useState(0), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setNearby(true);
    }, { threshold: 0.15 });
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!nearby) return;
    let cancelled = false, objectUrl: string | null = null;
    let timer: number | undefined;
    setUrl(null); setError(false); setLoaded(false);
    const load = async (attempt: number) => {
      try {
        const response = await call('preview', { type: 'video', id: item.id, blur });
        if (cancelled) return;
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          if (String(result.error).startsWith('Preview busy') && attempt < 5) {
            timer = window.setTimeout(() => void load(attempt + 1), Math.min(12_000, 2_000 * 2 ** attempt));
            return;
          }
          throw new Error('preview');
        }
        if (!response.headers.get('content-type')?.startsWith('video/mp4')) throw new Error('preview');
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
      } catch { if (!cancelled) setError(true); }
    };
    timer = window.setTimeout(() => void load(0), 120);
    return () => { cancelled = true; window.clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [nearby, item.id, blur, call, retry]);
  useEffect(() => {
    const element = video.current;
    if (!element || !loaded) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (visible && !document.hidden && !motion.matches) void element.play().catch(() => {});
      else element.pause();
    };
    sync(); document.addEventListener('visibilitychange', sync); motion.addEventListener('change', sync);
    return () => { element.pause(); document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', sync); };
  }, [visible, loaded, url]);
  return <div ref={container} className="cat-preview cat-video-preview">
    {url && !error && <video ref={video} src={`${url}#t=0.001`} muted loop playsInline preload="auto"
      controls={retryable} controlsList="nodownload noremoteplayback" disablePictureInPicture
      aria-label="Short blurred video preview" onLoadedData={() => setLoaded(true)} onError={() => setError(true)} />}
    {(!loaded || error) && <div className="cat-placeholder cat-video-loading" role="status">
      <Video size={32} /><span>{error ? 'Preview unavailable' : 'Preparing video preview…'}</span>
      {error && retryable && <button type="button" onClick={e => { e.stopPropagation(); setRetry(v => v + 1); }}>Retry</button>}
    </div>}
    <span className="cat-type">VIDEO</span>
    <span className="cat-lock" aria-label={item.purchased || item.received ? 'Unlocked' : 'Locked preview'}>
      {item.purchased || item.received ? <Check size={14} /> : <LockKeyhole size={13} />}
    </span>
    {!retryable && loaded && !error && <span className="cat-video-label"><Play size={11} fill="currentColor" /> Short preview</span>}
  </div>;
}
