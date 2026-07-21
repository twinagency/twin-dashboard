"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StarAmount from "@/components/StarAmount";
import { MEDIA_TAGS } from "@/lib/pricing";
import {
  uploadPhoto,
  uploadVideo,
  updatePhoto,
  updateVideo,
  deletePhoto,
  deleteVideo,
  createBundle,
  updateBundle,
  deleteBundle,
  addBundleItem,
  removeBundleItem,
} from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────
type Photo = {
  id: string;
  clone_id: string;
  storage_path: string;
  caption: string | null;
  teaser_caption: string | null;
  star_value: number;
  is_free: boolean | null;
  image_name: string | null;
  is_nude: boolean | null;
  explicitness: string | null;
  nsfw: boolean | null;
  tags: string[] | null;
  auto_desc: string | null;
  created_at: string;
};

type Video = {
  id: string;
  clone_id: string;
  storage_path: string;
  caption: string | null;
  teaser_caption: string | null;
  star_value: number;
  is_free: boolean | null;
  is_nude: boolean | null;
  explicitness: string | null;
  nsfw: boolean | null;
  tags: string[] | null;
  auto_desc: string | null;
  created_at: string;
};

type BundleItem = {
  id: string;
  bundle_id: string;
  storage_path: string;
  sort_order: number;
};

type Bundle = {
  id: string;
  clone_id: string;
  name: string;
  caption: string | null;
  star_price: number;
  is_onboarding: boolean;
  created_at: string;
  photo_bundle_items: BundleItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function useSignedUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => d.url && setUrl(d.url))
      .catch(() => {});
  }, [path]);
  return url;
}

// Thumb that fetches a signed URL. Size via className.
function Thumb({ path, type, className }: { path: string; type: "photo" | "video"; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => d.url && setUrl(d.url))
      .catch(() => {});
  }, [path]);

  const cls = className ?? "h-20 w-20 rounded object-cover";
  if (!url) return <div className={cls + " bg-muted/10 animate-pulse"} />;
  if (type === "video") return <video src={url} className={cls} muted preload="metadata" />;
  return <img src={url} alt="" className={cls} />;
}

// Full-screen lightbox showing the media large + its full caption / teaser / badges.
function Lightbox({
  path, type, title, starValue, caption, teaserCaption, isNude, explicitness, onClose,
}: {
  path: string; type: "photo" | "video"; title: string; starValue: number;
  caption: string | null; teaserCaption: string | null;
  isNude: boolean | null; explicitness: string | null; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-panel p-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium">{title}</span>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        <Thumb path={path} type={type} className="max-h-[55vh] w-full rounded object-contain bg-ink" />
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <StarAmount stars={starValue} />
          <ExplicitBadge isNude={isNude} explicitness={explicitness} />
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Caption (AI matching)</div>
            <div className="text-ink whitespace-pre-wrap">{caption || <span className="text-muted">No caption</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Teaser (shown to fan)</div>
            <div className="text-ink whitespace-pre-wrap">{teaserCaption || <span className="text-muted">No teaser caption</span>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload dropzone ───────────────────────────────────────────────────────────
function UploadZone({
  label,
  accept,
  onFiles,
}: {
  label: string;
  accept: string;
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition " +
        (dragging ? "border-accent bg-accent/10" : "border-line hover:border-accent/60")
      }
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          accept.split(",").some((a) => f.type.match(a.trim().replace("*", ".*")))
        );
        if (files.length) onFiles(files);
      }}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <div className="text-2xl">📁</div>
      <div className="mt-2 text-sm text-muted">{label}</div>
      <div className="text-xs text-muted">Click or drag & drop</div>
    </div>
  );
}

// ── Upload queue item ─────────────────────────────────────────────────────────
type QueueItem = {
  file: File;
  caption: string;
  teaserCaption: string;
  starValue: string;
  imageName: string;
  status: "pending" | "uploading" | "done" | "error";
  captioning?: boolean;
  error?: string;
};

function PhotoUploadQueue({
  cloneId,
  onDone,
}: {
  cloneId: string;
  onDone: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const router = useRouter();

  function addFiles(files: File[]) {
    setQueue((prev) => [
      ...prev,
      ...files.map((f) => ({
        file: f,
        caption: "",
        teaserCaption: "",
        starValue: "", // blank = auto-price from the category pricing guide
        imageName: f.name.replace(/\.[^.]+$/, ""),
        status: "pending" as const,
        captioning: true,
      })),
    ]);
    for (const file of files) {
      autoCaption(file);
    }
  }

  async function autoCaption(file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clone_id", cloneId);
      const res = await fetch("/api/caption", { method: "POST", body: fd });
      if (!res.ok) throw new Error("failed");
      const { caption, teaser_caption } = await res.json();
      setQueue((prev) =>
        prev.map((q) =>
          q.file === file
            ? { ...q, caption: caption ?? "", teaserCaption: teaser_caption ?? "", captioning: false }
            : q
        )
      );
    } catch {
      setQueue((prev) =>
        prev.map((q) => (q.file === file ? { ...q, captioning: false } : q))
      );
    }
  }

  function update(idx: number, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  async function uploadAll() {
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;
      update(i, { status: "uploading" });
      try {
        const fd = new FormData();
        fd.append("file", queue[i].file);
        fd.append("caption", queue[i].caption);
        fd.append("teaser_caption", queue[i].teaserCaption);
        fd.append("star_value", queue[i].starValue);
        fd.append("image_name", queue[i].imageName);
        await uploadPhoto(cloneId, fd);
        update(i, { status: "done" });
      } catch (e) {
        update(i, { status: "error", error: e instanceof Error ? e.message : "failed" });
      }
    }
    router.refresh();
    onDone();
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="grid gap-4">
      <UploadZone label="Add photos (any format: HEIC, JPG, PNG, WebP)" accept="image/*,.heic,.heif" onFiles={addFiles} />
      {queue.length > 0 && (
        <div className="grid gap-3">
          {queue.map((item, i) => (
            <div key={i} className="rounded-lg border border-line bg-bg p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="text-sm font-medium truncate flex-1">{item.file.name}</div>
                <StatusBadge status={item.status} error={item.error} />
                {item.status === "pending" && (
                  <button
                    onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}
                    className="text-xs text-muted hover:text-crit"
                  >
                    ✕
                  </button>
                )}
              </div>
              {item.status === "pending" && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="block">
                    <span className="mb-1 block text-muted">Name</span>
                    <input
                      value={item.imageName}
                      onChange={(e) => update(i, { imageName: e.target.value })}
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-muted">⭐ Price</span>
                    <input
                      type="number"
                      value={item.starValue}
                      onChange={(e) => update(i, { starValue: e.target.value })}
                      placeholder="Auto (pricing guide)"
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="mb-1 flex items-center gap-2 text-muted">
                      Caption (for AI matching)
                      {item.captioning && <span className="text-accent">AI captioning…</span>}
                    </span>
                    <input
                      value={item.caption}
                      onChange={(e) => update(i, { caption: e.target.value })}
                      placeholder={item.captioning ? "Generating…" : "e.g. bikini on the beach, smiling"}
                      disabled={item.captioning}
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent disabled:opacity-40"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="mb-1 block text-muted">Teaser caption (shown to fan)</span>
                    <input
                      value={item.teaserCaption}
                      onChange={(e) => update(i, { teaserCaption: e.target.value })}
                      placeholder={item.captioning ? "Generating…" : "e.g. I took this just for you 😈"}
                      disabled={item.captioning}
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent disabled:opacity-40"
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
          {pendingCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={uploadAll}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep transition"
              >
                Upload {pendingCount} photo{pendingCount !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VideoUploadQueue({
  cloneId,
  onDone,
}: {
  cloneId: string;
  onDone: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const router = useRouter();

  function addFiles(files: File[]) {
    setQueue((prev) => [
      ...prev,
      ...files.map((f) => ({
        file: f,
        caption: "",
        teaserCaption: "",
        starValue: "", // blank = auto-price from the category pricing guide
        imageName: "",
        status: "pending" as const,
      })),
    ]);
  }

  function update(idx: number, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  async function uploadAll() {
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== "pending") continue;
      update(i, { status: "uploading" });
      try {
        const fd = new FormData();
        fd.append("file", queue[i].file);
        fd.append("caption", queue[i].caption);
        fd.append("teaser_caption", queue[i].teaserCaption);
        fd.append("star_value", queue[i].starValue);
        await uploadVideo(cloneId, fd);
        update(i, { status: "done" });
      } catch (e) {
        update(i, { status: "error", error: e instanceof Error ? e.message : "failed" });
      }
    }
    router.refresh();
    onDone();
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="grid gap-4">
      <UploadZone label="Add videos" accept="video/*" onFiles={addFiles} />
      {queue.length > 0 && (
        <div className="grid gap-3">
          {queue.map((item, i) => (
            <div key={i} className="rounded-lg border border-line bg-bg p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="text-sm font-medium truncate flex-1">{item.file.name}</div>
                <StatusBadge status={item.status} error={item.error} />
                {item.status === "pending" && (
                  <button
                    onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}
                    className="text-xs text-muted hover:text-crit"
                  >
                    ✕
                  </button>
                )}
              </div>
              {item.status === "pending" && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="block">
                    <span className="mb-1 block text-muted">⭐ Price</span>
                    <input
                      type="number"
                      value={item.starValue}
                      onChange={(e) => update(i, { starValue: e.target.value })}
                      placeholder="Auto (pricing guide)"
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    />
                  </label>
                  <div />
                  <label className="block col-span-2">
                    <span className="mb-1 block text-muted">Caption (for AI matching)</span>
                    <input
                      value={item.caption}
                      onChange={(e) => update(i, { caption: e.target.value })}
                      placeholder="e.g. dancing in lingerie"
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="mb-1 block text-muted">Teaser caption (shown to fan)</span>
                    <input
                      value={item.teaserCaption}
                      onChange={(e) => update(i, { teaserCaption: e.target.value })}
                      placeholder="e.g. this one gets spicy 🔥"
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
          {pendingCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={uploadAll}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep transition"
              >
                Upload {pendingCount} video{pendingCount !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: QueueItem["status"]; error?: string }) {
  if (status === "uploading") return <span className="text-xs text-accent">Uploading…</span>;
  if (status === "done") return <span className="text-xs text-good">Done</span>;
  if (status === "error") return <span className="text-xs text-crit" title={error}>Error</span>;
  return null;
}

// Small label showing nudity / explicitness from the AI caption.
function ExplicitBadge({ isNude, explicitness }: { isNude: boolean | null; explicitness: string | null }) {
  const e = explicitness ?? "none";
  const cls =
    e === "explicit" ? "bg-crit/10 text-crit" :
    e === "suggestive" ? "bg-warn/15 text-warn" :
    "bg-muted/10 text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] ${cls}`}>
      {isNude ? "🔞 nude · " : ""}{e}
    </span>
  );
}

// Editable nudity + explicitness controls (shared by photo/video edit forms).
function NudityFields({ isNude, explicitness }: { isNude: boolean | null; explicitness: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="mb-1 block text-muted">Nudity</span>
        <select name="is_nude" defaultValue={isNude ? "true" : "false"}
          className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent">
          <option value="false">Not nude</option>
          <option value="true">Nude</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-muted">Explicitness</span>
        <select name="explicitness" defaultValue={explicitness ?? "none"}
          className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent">
          <option value="none">none</option>
          <option value="suggestive">suggestive</option>
          <option value="explicit">explicit</option>
        </select>
      </label>
    </div>
  );
}

// Read-only AI auto-tag chips (subset of the fixed MEDIA_TAGS vocabulary).
function TagChips({ tags }: { tags: string[] | null }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted">
          {t}
        </span>
      ))}
    </div>
  );
}

// Editable tag chips from the fixed vocabulary. Submits a comma-joined hidden
// input (name="tags"), so a manual edit OVERWRITES the AI auto-tags on save.
function TagEditor({ defaultTags }: { defaultTags: string[] | null }) {
  const [selected, setSelected] = useState<string[]>(defaultTags ?? []);
  function toggle(tag: string) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  return (
    <div className="block">
      <span className="mb-1 block text-muted">Tags (your edits win over auto-tags)</span>
      <input type="hidden" name="tags" value={selected.join(",")} />
      <div className="flex flex-wrap gap-1">
        {MEDIA_TAGS.map((tag) => {
          const on = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={
                "rounded-full px-2 py-0.5 text-[10px] transition " +
                (on
                  ? "bg-ink text-panel"
                  : "bg-muted/10 text-muted hover:bg-muted/20")
              }
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Photo card ────────────────────────────────────────────────────────────────
function PhotoCard({ photo, cloneId }: { photo: Photo; cloneId: string }) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(fd: FormData) {
    startTransition(async () => {
      await updatePhoto(cloneId, photo.id, fd);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this photo?")) return;
    startTransition(async () => {
      await deletePhoto(cloneId, photo.id, photo.storage_path);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      {viewing && (
        <Lightbox path={photo.storage_path} type="photo" title={photo.image_name ?? "Untitled"}
          starValue={photo.star_value} caption={photo.caption} teaserCaption={photo.teaser_caption}
          isNude={photo.is_nude} explicitness={photo.explicitness} onClose={() => setViewing(false)} />
      )}
      <button type="button" onClick={() => setViewing(true)} className="mb-3 block w-full" title="Click to view full size + caption">
        <Thumb path={photo.storage_path} type="photo" className="aspect-square w-full rounded object-cover hover:opacity-90 transition" />
      </button>
      <div className="mb-3">
        <div className="font-medium text-sm truncate">{photo.image_name ?? "Untitled"}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <StarAmount stars={photo.star_value} />
          <ExplicitBadge isNude={photo.is_nude} explicitness={photo.explicitness} />
        </div>
        {photo.teaser_caption && (
          <div className="text-xs text-muted mt-1 line-clamp-2">"{photo.teaser_caption}"</div>
        )}
        {photo.auto_desc && (
          <div className="mt-1 text-[11px] italic text-muted">{photo.auto_desc}</div>
        )}
        <TagChips tags={photo.tags} />
      </div>
      {editing ? (
        <form action={save} className="grid gap-2 text-xs">
          <input name="image_name" defaultValue={photo.image_name ?? ""} placeholder="Name"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <input name="star_value" type="number" defaultValue={photo.star_value} placeholder="⭐ price"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted">Send free (unlocked)?</span>
            <select name="is_free" defaultValue={photo.is_free ? "true" : "false"}
              className="rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent">
              <option value="false">Paid</option>
              <option value="true">Free</option>
            </select>
          </label>
          <input name="caption" defaultValue={photo.caption ?? ""} placeholder="Caption (AI matching)"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <input name="teaser_caption" defaultValue={photo.teaser_caption ?? ""} placeholder="Teaser caption"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <NudityFields isNude={photo.is_nude} explicitness={photo.explicitness} />
          <TagEditor defaultTags={photo.tags} />
          <input name="auto_desc" defaultValue={photo.auto_desc ?? ""} placeholder="Short description (e.g. bikini pool)"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <div className="flex gap-2">
            <button type="submit" disabled={pending}
              className="flex-1 rounded bg-accent py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-deep disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="flex-1 rounded border border-line py-1.5 text-xs hover:bg-muted/10">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)}
            className="flex-1 rounded border border-line py-1 text-xs hover:bg-muted/10">
            Edit
          </button>
          <button onClick={remove} disabled={pending}
            className="rounded border border-crit/30 px-3 py-1 text-xs text-crit hover:bg-crit/10 disabled:opacity-50">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Video card ────────────────────────────────────────────────────────────────
function VideoCard({ video, cloneId }: { video: Video; cloneId: string }) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(fd: FormData) {
    startTransition(async () => {
      await updateVideo(cloneId, video.id, fd);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this video?")) return;
    startTransition(async () => {
      await deleteVideo(cloneId, video.id, video.storage_path);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      {viewing && (
        <Lightbox path={video.storage_path} type="video" title="Video"
          starValue={video.star_value} caption={video.caption} teaserCaption={video.teaser_caption}
          isNude={video.is_nude} explicitness={video.explicitness} onClose={() => setViewing(false)} />
      )}
      <button type="button" onClick={() => setViewing(true)} className="mb-3 block w-full" title="Click to view full size + caption">
        <Thumb path={video.storage_path} type="video" className="aspect-square w-full rounded object-cover hover:opacity-90 transition" />
      </button>
      <div className="mb-3">
        <div className="font-medium text-sm">Video</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <StarAmount stars={video.star_value} />
          <ExplicitBadge isNude={video.is_nude} explicitness={video.explicitness} />
        </div>
        {video.teaser_caption && (
          <div className="text-xs text-muted mt-1 line-clamp-2">"{video.teaser_caption}"</div>
        )}
        {video.auto_desc && (
          <div className="mt-1 text-[11px] italic text-muted">{video.auto_desc}</div>
        )}
        <TagChips tags={video.tags} />
      </div>
      {editing ? (
        <form action={save} className="grid gap-2 text-xs">
          <input name="star_value" type="number" defaultValue={video.star_value} placeholder="⭐ price"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted">Send free (unlocked)?</span>
            <select name="is_free" defaultValue={video.is_free ? "true" : "false"}
              className="rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent">
              <option value="false">Paid</option>
              <option value="true">Free</option>
            </select>
          </label>
          <input name="caption" defaultValue={video.caption ?? ""} placeholder="Caption (AI matching)"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <input name="teaser_caption" defaultValue={video.teaser_caption ?? ""} placeholder="Teaser caption"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <NudityFields isNude={video.is_nude} explicitness={video.explicitness} />
          <TagEditor defaultTags={video.tags} />
          <input name="auto_desc" defaultValue={video.auto_desc ?? ""} placeholder="Short description (e.g. dancing lingerie)"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
          <div className="flex gap-2">
            <button type="submit" disabled={pending}
              className="flex-1 rounded bg-accent py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-deep disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="flex-1 rounded border border-line py-1.5 text-xs hover:bg-muted/10">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)}
            className="flex-1 rounded border border-line py-1 text-xs hover:bg-muted/10">
            Edit
          </button>
          <button onClick={remove} disabled={pending}
            className="rounded border border-crit/30 px-3 py-1 text-xs text-crit hover:bg-crit/10 disabled:opacity-50">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Bundle card ───────────────────────────────────────────────────────────────
function BundleCard({ bundle, cloneId }: { bundle: Bundle; cloneId: string }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  function saveEdit(fd: FormData) {
    startTransition(async () => {
      await updateBundle(cloneId, bundle.id, fd);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete bundle "${bundle.name}" and all its photos?`)) return;
    startTransition(async () => {
      await deleteBundle(cloneId, bundle.id);
      router.refresh();
    });
  }

  async function addItem(files: File[]) {
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      await addBundleItem(bundle.id, cloneId, fd);
    }
    router.refresh();
  }

  async function removeItem(itemId: string, storagePath: string) {
    if (!confirm("Remove this photo from the bundle?")) return;
    await removeBundleItem(cloneId, itemId, storagePath);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      {editing ? (
        <form action={saveEdit} className="mb-3 grid gap-2 text-sm">
          <input name="name" defaultValue={bundle.name} required placeholder="Bundle name"
            className="w-full rounded border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
          <input name="caption" defaultValue={bundle.caption ?? ""} placeholder="Caption (welcome bundle only, others AI-written on send)"
            className="w-full rounded border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
          <input name="star_price" type="number" defaultValue={bundle.star_price} placeholder="⭐ price"
            className="w-full rounded border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_onboarding" defaultChecked={bundle.is_onboarding} className="h-4 w-4 accent-good" />
            Welcome bundle (auto-sent to new fans, only one per clone)
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pending}
              className="flex-1 rounded bg-accent py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-deep disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setEditing(false)}
              className="flex-1 rounded border border-line py-1.5 text-xs hover:bg-muted/10">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{bundle.name}</span>
              {bundle.is_onboarding && (
                <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs text-good">
                  Welcome bundle
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted"><StarAmount stars={bundle.star_price} /></div>
            {bundle.caption && <div className="mt-1 text-xs text-muted">"{bundle.caption}"</div>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded border border-line px-3 py-1 text-xs hover:bg-muted/10"
            >
              Edit
            </button>
            <button
              onClick={remove}
              disabled={pending}
              className="rounded border border-crit/30 px-3 py-1 text-xs text-crit hover:bg-crit/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        {bundle.photo_bundle_items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => (
            <div key={item.id} className="group relative">
              <Thumb path={item.storage_path} type="photo" />
              <button
                onClick={() => removeItem(item.id, item.storage_path)}
                className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 px-1 text-xs text-crit group-hover:flex"
              >
                ✕
              </button>
            </div>
          ))}
        <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded border-2 border-dashed border-line text-2xl hover:border-accent/60">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) addItem(files);
              e.target.value = "";
            }}
          />
          +
        </label>
      </div>
      <div className="text-xs text-muted">{bundle.photo_bundle_items.length} photo{bundle.photo_bundle_items.length !== 1 ? "s" : ""}</div>
    </div>
  );
}

// ── Create bundle form ────────────────────────────────────────────────────────
function CreateBundleForm({ cloneId }: { cloneId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(fd: FormData) {
    startTransition(async () => {
      await createBundle(cloneId, fd);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-muted hover:border-accent/60 hover:text-ink transition"
      >
        + New bundle
      </button>
    );
  }

  return (
    <form action={submit} className="rounded-lg border border-line bg-panel p-5 grid gap-3">
      <h3 className="text-sm font-semibold text-muted">New bundle</h3>
      <input name="name" required placeholder="Bundle name (e.g. Welcome bundle)"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="caption" placeholder="Caption (welcome bundle only, others are AI-written on send)"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="star_price" type="number" defaultValue={99} placeholder="⭐ price"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_onboarding" className="h-4 w-4 accent-good" />
        Welcome bundle (auto-sent to new fans, only one per clone)
      </label>
      <p className="text-xs text-muted">
        Fans can ask for any other bundle in chat; she writes its caption live on send. The welcome bundle uses the caption above.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="flex-1 rounded bg-accent py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep disabled:opacity-50">
          Create
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="flex-1 rounded border border-line py-2 text-sm hover:bg-muted/10">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type Tab = "photos" | "videos" | "bundles";

export default function MediaManager({
  cloneId,
  photos,
  videos,
  bundles,
}: {
  cloneId: string;
  photos: Photo[];
  videos: Video[];
  bundles: Bundle[];
}) {
  const [tab, setTab] = useState<Tab>("photos");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "photos", label: "Photos", count: photos.length },
    { key: "videos", label: "Videos", count: videos.length },
    { key: "bundles", label: "Bundles", count: bundles.length },
  ];

  return (
    <div>
      {/* Tab bar — same shape as the Edit page's strip so the two pages read
          as one system (this IS the page's top bar; there is no title above). */}
      <div className="mb-4 flex gap-1 rounded-xl bg-muted/10 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition " +
              (tab === t.key ? "bg-panel text-ink shadow-sm" : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-2 rounded-full bg-muted/20 px-1.5 py-0.5 text-xs font-normal">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className={tab === "photos" ? "grid gap-6" : "hidden"}>
        <PhotoUploadQueue cloneId={cloneId} onDone={() => {}} />
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <PhotoCard key={p.id} photo={p} cloneId={cloneId} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            No photos yet. Upload some above.
          </div>
        )}
      </div>

      <div className={tab === "videos" ? "grid gap-6" : "hidden"}>
        <VideoUploadQueue cloneId={cloneId} onDone={() => {}} />
        {videos.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} cloneId={cloneId} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            No videos yet. Upload some above.
          </div>
        )}
      </div>

      <div className={tab === "bundles" ? "grid gap-4" : "hidden"}>
        <CreateBundleForm cloneId={cloneId} />
        {bundles.length > 0 ? (
          bundles.map((b) => <BundleCard key={b.id} bundle={b} cloneId={cloneId} />)
        ) : (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            No bundles yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}
