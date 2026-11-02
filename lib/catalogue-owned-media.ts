export type OwnedMedia = { url: string; type: 'photo' | 'video'; width?: number; height?: number };

// Private to one mounted catalogue/session. Keep a decoded photo while its
// signed URL is valid so closing a dialog does not discard a paid download.
export class OwnedMediaCache {
  private entries = new Map<string, { media: OwnedMedia; image?: HTMLImageElement; blobUrl?: string; until: number }>();
  private generation = 0;
  get(key: string): OwnedMedia | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.until > Date.now()) return entry.media;
    this.delete(key);
  }
  delete(key: string) {
    const entry = this.entries.get(key);
    if (entry?.blobUrl) URL.revokeObjectURL(entry.blobUrl);
    this.entries.delete(key);
  }
  clear() { this.generation++; for (const key of this.entries.keys()) this.delete(key); }
  retain(keys: Set<string>) { for (const key of this.entries.keys()) if (!keys.has(key)) this.delete(key); }
  async prepare(key: string, media: OwnedMedia): Promise<OwnedMedia> {
    const until = Date.now() + 240_000; // API signatures last five minutes.
    const generation = this.generation;
    let image: HTMLImageElement | undefined;
    let blobUrl: string | undefined;
    if (media.type === 'photo') {
      // A signed URL is not a cached download. In particular, a WebView can
      // refetch it when an <img> is remounted. Keep private bytes in memory,
      // never localStorage, and release them on expiry/revocation/unmount.
      const response = await fetch(media.url, { credentials: 'omit', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error('Could not load your photo. Please retry.');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Could not load your photo. Please retry.');
      blobUrl = URL.createObjectURL(blob);
      media = { ...media, url: blobUrl };
      image = new Image();
      const photo = image;
      try { await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer); photo.onload = null; photo.onerror = null;
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => finish(new Error('Your photo is taking too long to load. Please retry.')), 20_000);
        photo.onload = () => photo.naturalWidth > 0 ? finish() : finish(new Error('Could not load your photo. Please retry.'));
        photo.onerror = () => finish(new Error('Could not load your photo. Please retry.'));
        photo.src = media.url;
        if (photo.complete && photo.naturalWidth > 0) finish();
      }); } catch (error) { URL.revokeObjectURL(blobUrl); throw error; }
      media = { ...media, width: photo.naturalWidth, height: photo.naturalHeight };
    }
    if (generation !== this.generation) { if (blobUrl) URL.revokeObjectURL(blobUrl); throw new Error('Viewer closed.'); }
    this.delete(key);
    if (this.entries.size >= 12) this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { media, image, blobUrl, until });
    return media;
  }
}
