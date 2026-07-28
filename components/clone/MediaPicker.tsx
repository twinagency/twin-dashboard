"use client";

import { useEffect, useState } from "react";

export type MediaRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  teaser_caption: string | null;
  star_value: number;
  is_free: boolean | null;
};

export type BundleRow = {
  id: string;
  name: string;
  caption: string | null;
  star_price: number;
  photo_bundle_items: { id: string; storage_path: string; sort_order: number }[];
};

// Signed-url thumbnail (private bucket), same pattern as the Media manager.
export function Thumb({ path, type }: { path: string; type: "photo" | "video" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => d.url && setUrl(d.url))
      .catch(() => {});
  }, [path]);
  const cls = "h-full w-full object-cover";
  if (!url) return <div className="h-full w-full animate-pulse bg-muted/10" />;
  if (type === "video") return <video src={url} className={cls} muted preload="metadata" />;
  return <img src={url} alt="" className={cls} />;
}

// Compact horizontal thumbnail strip for picking a specific media item. First
// chip is "AI picks" (auto, the default); the rest are the clone's items of
// that type - tap one to lock this to that exact item. Shared between the
// Campaigns page (per-step picks) and Configure's Money tab (promised image).
export function MediaPicker({
  type,
  photos,
  videos,
  bundles,
  photosEnabled,
  videosEnabled,
  bundlesEnabled,
  value,
  onPick,
}: {
  type: "photo" | "video" | "bundle";
  photos: MediaRow[];
  videos: MediaRow[];
  bundles: BundleRow[];
  photosEnabled: boolean;
  videosEnabled: boolean;
  bundlesEnabled: boolean;
  value: string | null;
  onPick: (id: string | null) => void;
}) {
  const enabled = type === "photo" ? photosEnabled : type === "video" ? videosEnabled : bundlesEnabled;
  if (!enabled) {
    return (
      <p className="mt-1 w-full text-[11px] text-warn">
        {type[0].toUpperCase() + type.slice(1)}s are off for this clone - turn them on in Configure, or this falls
        back to an AI text line.
      </p>
    );
  }

  const cover = (b: BundleRow) =>
    [...b.photo_bundle_items].sort((a, c) => a.sort_order - c.sort_order)[0]?.storage_path ?? null;

  const items: { id: string; path: string | null; label: string; isVideo: boolean }[] =
    type === "bundle"
      ? bundles.map((b) => ({ id: b.id, path: cover(b), label: b.name, isVideo: false }))
      : (type === "photo" ? photos : videos).map((m) => ({
          id: m.id,
          path: m.storage_path,
          label: m.is_free || m.star_value === 0 ? "free" : `${m.star_value}⭐`,
          isVideo: type === "video",
        }));

  return (
    <div className="mt-1 w-full">
      <div className="mb-1 text-[11px] text-muted">
        {value ? "Sends this exact item:" : "AI picks a fresh unseen item."}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted">No {type}s uploaded yet - add some in the Media tab.</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={
              "flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-[10px] font-medium leading-tight transition " +
              (value === null
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:border-accent/60")
            }
          >
            <span className="text-base">🤖</span>
            AI picks
          </button>
          {items.map((it) => {
            const on = value === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it.id)}
                title={it.label}
                className={
                  "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition " +
                  (on ? "border-good ring-2 ring-good/30" : "border-line hover:border-accent/60")
                }
              >
                {it.path ? (
                  <Thumb path={it.path} type={it.isVideo ? "video" : "photo"} />
                ) : (
                  <div className="h-full w-full bg-muted/10" />
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                  {type === "bundle" ? "🎁 " : ""}
                  {it.label}
                </span>
                {on && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-good text-[10px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
