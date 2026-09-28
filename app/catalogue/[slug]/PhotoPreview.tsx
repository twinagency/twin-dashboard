"use client";
import { useEffect, useRef, useState } from 'react';
import { Check, ImageIcon, LockKeyhole } from 'lucide-react';
import type { CatalogueItem } from '@/lib/catalogue-core';
import { cataloguePreviews, PreviewLoadError, type PreviewCall } from '@/lib/catalogue-preview-client';

export default function PhotoPreview({ item, blur, call, retryable = true }: {
  item: CatalogueItem; blur: number; call: PreviewCall; retryable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false, objectUrl: string | null = null;
    setUrl(null); setError('');
    void cataloguePreviews.photo(call, item.id, blur, retry > 0).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(e => {
      if (!cancelled) setError(e instanceof PreviewLoadError ? e.message : 'Preview unavailable');
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, item.id, blur, call, retry]);
  return <div ref={ref} className="cat-preview">
    {url ? <img src={url} alt="Blurred preview" onError={() => { setUrl(null); setError('Preview unavailable'); }} /> :
      <div className="cat-placeholder" role="status"><ImageIcon size={32} />
        <span>{error || 'Loading preview'}</span>
        {error && retryable && <button type="button" onClick={e => { e.stopPropagation(); setRetry(v => v + 1); }}>Retry</button>}
      </div>}
    <span className="cat-type">PHOTO</span>
    <span className="cat-lock" aria-label={item.purchased || item.received ? 'Unlocked' : item.free ? 'Free' : 'Locked preview'}>
      {item.purchased || item.received ? <Check size={14} /> : <LockKeyhole size={13} />}
    </span>
  </div>;
}
