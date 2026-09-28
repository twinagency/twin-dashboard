export type OwnedMedia = { url: string; type: 'photo' | 'video'; width?: number; height?: number };

// Private to one mounted catalogue/session. Keep a decoded photo while its
// signed URL is valid so closing a dialog does not discard a paid download.
export class OwnedMediaCache {
  private entries = new Map<string, { media: OwnedMedia; image?: HTMLImageElement; until: number }>();
  get(key: string): OwnedMedia | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.until > Date.now()) return entry.media;
    this.entries.delete(key);
  }
  delete(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
  retain(keys: Set<string>) { for (const key of this.entries.keys()) if (!keys.has(key)) this.delete(key); }
  async prepare(key: string, media: OwnedMedia): Promise<OwnedMedia> {
    const until = Date.now() + 240_000; // API signatures last five minutes.
    let image: HTMLImageElement | undefined;
    if (media.type === 'photo') {
      image = new Image();
      const photo = image;
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer); photo.onload = null; photo.onerror = null;
          error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => finish(new Error('Your photo is taking too long to load. Please retry.')), 20_000);
        photo.onload = () => photo.naturalWidth > 0 ? finish() : finish(new Error('Could not load your photo. Please retry.'));
        photo.onerror = () => finish(new Error('Could not load your photo. Please retry.'));
        photo.src = media.url;
        if (photo.complete && photo.naturalWidth > 0) finish();
      });
      media = { ...media, width: photo.naturalWidth, height: photo.naturalHeight };
    }
    if (this.entries.size >= 12) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { media, image, until });
    return media;
  }
}
