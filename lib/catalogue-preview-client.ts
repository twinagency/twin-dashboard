export type PreviewCall = (action: string, payload?: Record<string, unknown>) => Promise<Response>;
export type VideoPreviewSources = { url: string; posterUrl: string; seconds: number; durationSeconds?: number };
type Request = { type: 'photo' | 'video'; id: string; blur: number };
type PreviewValue = Blob | VideoPreviewSources;
type Options = { now?: () => number; wait?: (ms: number) => Promise<void> };

export class PreviewLoadError extends Error {
  constructor(readonly kind: 'session' | 'unavailable') {
    super(kind === 'session' ? 'Close and reopen the catalogue' : 'Preview unavailable');
  }
}

function limiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try { return await work(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

// One loader for the page. A mosaic, card and open detail reuse the same protected
// derivative. Call-function identity isolates creators and authentication contexts.
export function createPreviewLoader(options: Options = {}) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const photoSlot = limiter(3), videoSlot = limiter(2);
  const scopes = new WeakMap<PreviewCall, Map<string, { expires: number; value: Promise<PreviewValue> }>>();

  async function fetchPreview(call: PreviewCall, request: Request): Promise<PreviewValue> {
    for (let attempt = 0; attempt < 4; attempt++) {
      let busy = false;
      try {
        const slot = request.type === 'video' ? videoSlot : photoSlot;
        return await slot(async () => {
          const response = await call('preview', { ...request, ...(request.type === 'video' ? { delivery: 'native' } : {}) });
          if (!response.ok) {
            // Authentication failures cannot be repaired by repeatedly retrying.
            if (response.status === 401 || response.status === 403) throw new PreviewLoadError('session');
            const data = await response.json().catch(() => ({}));
            busy = response.status === 429 || String(data.error ?? '').startsWith('Preview busy') || String(data.error ?? '').startsWith('Please wait');
            if (!busy && response.status < 500) throw new PreviewLoadError('unavailable');
            throw new Error('Transient preview failure');
          }
          if (request.type === 'photo') {
            const blob = await response.blob();
            if (!blob.size || !blob.type.startsWith('image/')) throw new PreviewLoadError('unavailable');
            return blob;
          }
          const value = await response.json();
          if (typeof value.url !== 'string' || typeof value.posterUrl !== 'string' || !value.url || !value.posterUrl)
            throw new PreviewLoadError('unavailable');
          return value as VideoPreviewSources;
        });
      } catch (error) {
        if (error instanceof PreviewLoadError) throw error;
        if (attempt === 3) throw new PreviewLoadError('unavailable');
        // Release the slot while backing off so one busy item cannot block the grid.
        await wait(Math.min(8000, (busy ? 1500 : 750) * 2 ** attempt));
      }
    }
    throw new PreviewLoadError('unavailable');
  }

  function load(call: PreviewCall, request: Request, refresh: boolean): Promise<PreviewValue> {
    let scope = scopes.get(call);
    if (!scope) { scope = new Map(); scopes.set(call, scope); }
    const key = `${request.type}:${request.id}:${request.blur}`;
    const entry = scope.get(key);
    if (!refresh && entry && entry.expires > now()) return entry.value;
    // Bound protected image data retained by this page. Signed video URLs expire
    // after an hour; five minutes here also makes stale playback retries refresh.
    for (const [id, cached] of scope) if (cached.expires <= now()) scope.delete(id);
    while (scope.size >= 80) scope.delete(scope.keys().next().value!);
    const value = fetchPreview(call, request);
    const next = { expires: now() + 300_000, value };
    scope.set(key, next);
    void value.catch(() => { if (scope!.get(key) === next) scope!.delete(key); });
    return value;
  }

  return {
    photo: (call: PreviewCall, id: string, blur: number, refresh = false) => load(call, { type: 'photo', id, blur }, refresh) as Promise<Blob>,
    video: (call: PreviewCall, id: string, blur: number, refresh = false) => load(call, { type: 'video', id, blur }, refresh) as Promise<VideoPreviewSources>,
  };
}

export const cataloguePreviews = createPreviewLoader();
