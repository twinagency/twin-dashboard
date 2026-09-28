"use client";
import { ManagerOnly, ReadOnlyEditor, useDashboardAccess } from "@/components/DashboardAccessProvider";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Thumb from "@/components/SignedMediaPreview";
import StarAmount from "@/components/StarAmount";
import {
  MEDIA_TAGS,
  CATEGORY_LABELS,
  PRICING_CATEGORIES,
  DEFAULT_CATEGORY_PRICING,
  DEFAULT_PHOTO_BUNDLE_PRICE_STARS,
  MAX_PHOTO_BUNDLE_PRICE_STARS,
  MIN_PAID_MEDIA_PRICE_STARS,
  normalizeSafeCategoryGuide,
} from "@/lib/pricing";
import { checkPhotoDimensions, PHOTO_LIMITS_HINT } from "@/lib/telegram-limits";
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
  updateCategoryPricing,
  previewRepriceMedia,
  repriceMedia,
  bulkSetMediaPrice,
  bulkDeleteMedia,
  type RepricePreview,
  type RepriceTarget,
} from "./actions";
import {
  createCatalogueBundle,
  setCatalogueBundleEnabled,
  deleteCatalogueBundle,
  CATALOGUE_BUNDLE_MIN_ITEMS,
  CATALOGUE_BUNDLE_MAX_ITEMS,
} from "./catalogue-bundle-actions";

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

// Mini App catalogue bundle (table catalogue_bundles), distinct from the legacy
// chat Bundle type above.
type CatalogueBundleRow = {
  id: string;
  title: string;
  caption: string | null;
  media_kind: "photo" | "video";
  photo_ids: string[];
  video_ids: string[];
  price_stars: number;
  regular_stars: number;
  enabled: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// Browser-side pre-flight on a photo's dimensions, so the operator learns a
// file is unsendable before waiting on an upload. THIS IS NOT THE GATE. The
// gate is assertPhotoSendable() inside the server action (lib/photo-guard.ts),
// which the upload cannot get past; this only saves a round trip.
//
// A format the browser cannot decode (HEIC is the one that matters, the upload
// zone accepts it and the server converts it) is deliberately NOT a rejection
// here. Unmeasurable in the browser means "let the server measure it".
async function measurePhoto(file: File): Promise<{ ok: true } | { ok: false; message: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: true };
  }
  const { width, height } = bitmap;
  bitmap.close();
  const verdict = checkPhotoDimensions(width, height);
  return verdict.ok ? { ok: true } : { ok: false, message: verdict.message };
}

// ── Upload dropzone ───────────────────────────────────────────────────────────
function UploadZone({
  label,
  accept,
  onFiles,
  hint,
}: {
  label: string;
  accept: string;
  onFiles: (files: File[]) => void;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={
        "flex min-h-[124px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-5 py-5 text-center shadow-[0_10px_28px_rgba(6,23,47,0.2)] transition lg:min-h-[82px] lg:w-fit lg:min-w-[360px] lg:justify-self-start lg:flex-row lg:gap-4 lg:px-5 lg:py-3 lg:text-left " +
        (dragging
          ? "border-[#78b6df] bg-[#0d3d6e] ring-4 ring-[#78b6df]/20"
          : "border-[#06172f] bg-[#06172f] hover:border-[#4a8ec4] hover:bg-[#082b55]")
      }
      title={hint}
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
      <div className="text-2xl lg:text-xl">📁</div>
      <div>
        <div className="mt-2 text-sm font-bold text-white lg:mt-0">{label}</div>
        <div className="mt-0.5 text-xs font-medium text-white/70">Click or drag & drop</div>
      </div>
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
  isFree: boolean;
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

  async function addFiles(files: File[]) {
    // Measure first. A photo Telegram would refuse never becomes "pending", so
    // it can never be sent up, and it carries the reason on the card instead of
    // failing silently or being captioned for nothing.
    const checked = await Promise.all(
      files.map(async (f) => ({ file: f, verdict: await measurePhoto(f) })),
    );
    setQueue((prev) => [
      ...prev,
      ...checked.map(({ file, verdict }) => ({
        file,
        caption: "",
        teaserCaption: "",
        starValue: "", // blank = auto-price from the category pricing guide
        imageName: file.name.replace(/\.[^.]+$/, ""),
        isFree: false,
        status: (verdict.ok ? "pending" : "error") as QueueItem["status"],
        error: verdict.ok ? undefined : verdict.message,
        captioning: false,
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
        fd.append("star_value", queue[i].starValue);
        fd.append("image_name", queue[i].imageName);
        fd.append("is_free", String(queue[i].isFree));
        const result = await uploadPhoto(cloneId, fd);
        if (!result.ok) throw new Error(result.error);
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
      <UploadZone label="Add photos (any format: HEIC, JPG, PNG, WebP)" accept="image/*,.heic,.heif" onFiles={addFiles} hint={PHOTO_LIMITS_HINT} />
      <p className="text-xs text-muted">
        The AI writes the internal content description automatically. The message sent with the photo is created from each fan's live conversation.
      </p>
      {queue.length > 0 && (
        <div className="grid gap-3">
          {queue.map((item, i) => (
            <div key={i} className="rounded-lg border border-line bg-bg p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="text-sm font-medium truncate flex-1">{item.file.name}</div>
                <StatusBadge status={item.status} error={item.error} />
                {(item.status === "pending" || item.status === "error") && (
                  <button
                    onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}
                    className="text-xs text-muted hover:text-crit"
                  >
                    ✕
                  </button>
                )}
              </div>
              {/* A rejected photo needs its reason on screen, not in a tooltip:
                  the operator has to know WHICH limit it broke to fix the file. */}
              {item.status === "error" && item.error && (
                <div className="mb-1 rounded border border-crit/30 bg-crit/10 p-2 text-xs text-crit">
                  {item.error}
                </div>
              )}
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
                      min={MIN_PAID_MEDIA_PRICE_STARS}
                      step={1}
                      value={item.starValue}
                      onChange={(e) => update(i, { starValue: e.target.value })}
                      placeholder="Auto (pricing guide)"
                      disabled={item.isFree}
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent disabled:opacity-40"
                    />
                  </label>
                  <label className="flex items-end justify-between gap-2 pb-1.5">
                    <span className="text-muted">Send free (unlocked)?</span>
                    <select
                      value={item.isFree ? "true" : "false"}
                      onChange={(e) => update(i, { isFree: e.target.value === "true" })}
                      className="rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    >
                      <option value="false">Paid</option>
                      <option value="true">Free</option>
                    </select>
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
        isFree: false,
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
        fd.append("is_free", String(queue[i].isFree));
        const result = await uploadVideo(cloneId, fd);
        if (!result.ok) throw new Error(result.error);
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
                      min={MIN_PAID_MEDIA_PRICE_STARS}
                      step={1}
                      value={item.starValue}
                      onChange={(e) => update(i, { starValue: e.target.value })}
                      placeholder="Auto (pricing guide)"
                      disabled={item.isFree}
                      className="w-full rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent disabled:opacity-40"
                    />
                  </label>
                  <label className="flex items-end justify-between gap-2 pb-1.5">
                    <span className="text-muted">Send free (unlocked)?</span>
                    <select
                      value={item.isFree ? "true" : "false"}
                      onChange={(e) => update(i, { isFree: e.target.value === "true" })}
                      className="rounded border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                    >
                      <option value="false">Paid</option>
                      <option value="true">Free</option>
                    </select>
                  </label>
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
function PhotoCard({
  photo,
  cloneId,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  photo: Photo;
  cloneId: string;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const {readOnly}=useDashboardAccess();
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
    <div className={"relative rounded-lg border bg-panel p-4 " + (selected ? "border-accent ring-2 ring-accent/20" : "border-line")}>
      {selecting && (
        <label className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-panel/95 shadow-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${photo.image_name ?? "photo"}`}
            className="h-4 w-4 accent-accent"
          />
        </label>
      )}
      {viewing && (
        <Lightbox path={photo.storage_path} type="photo" title={photo.image_name ?? "Untitled"}
          starValue={photo.is_free ? 0 : photo.star_value} caption={photo.caption} teaserCaption={photo.teaser_caption}
          isNude={photo.is_nude} explicitness={photo.explicitness} onClose={() => setViewing(false)} />
      )}
      <div className="mb-3">
        <Thumb onOpen={() => setViewing(true)} path={photo.storage_path} type="photo" className="aspect-square w-full rounded object-cover hover:opacity-90 transition" />
      </div>
      <div className="mb-3">
        <div className="font-medium text-sm truncate">{photo.image_name ?? "Untitled"}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <StarAmount stars={photo.is_free ? 0 : photo.star_value} />
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
            {/* 0★ is always free at runtime (flows/media.ts), so a 0-priced item
                must default to Free here even if is_free wasn't set yet. */}
            <select name="is_free" defaultValue={photo.is_free || photo.star_value === 0 ? "true" : "false"}
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
          <button disabled={readOnly} onClick={() => setEditing(true)}
            className="flex-1 rounded border border-line py-1 text-xs hover:bg-muted/10">
            Edit
          </button>
          <button onClick={remove} disabled={pending || readOnly}
            className="rounded border border-crit/30 px-3 py-1 text-xs text-crit hover:bg-crit/10 disabled:opacity-50">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Video card ────────────────────────────────────────────────────────────────
function VideoCard({
  video,
  cloneId,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  video: Video;
  cloneId: string;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const {readOnly}=useDashboardAccess();
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
    <div className={"relative rounded-lg border bg-panel p-4 " + (selected ? "border-accent ring-2 ring-accent/20" : "border-line")}>
      {selecting && (
        <label className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-panel/95 shadow-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label="Select video"
            className="h-4 w-4 accent-accent"
          />
        </label>
      )}
      {viewing && (
        <Lightbox path={video.storage_path} type="video" title="Video"
          starValue={video.is_free ? 0 : video.star_value} caption={video.caption} teaserCaption={video.teaser_caption}
          isNude={video.is_nude} explicitness={video.explicitness} onClose={() => setViewing(false)} />
      )}
      <div className="mb-3">
        <Thumb onOpen={() => setViewing(true)} path={video.storage_path} type="video" className="aspect-square w-full rounded object-cover hover:opacity-90 transition" />
      </div>
      <div className="mb-3">
        <div className="font-medium text-sm">Video</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <StarAmount stars={video.is_free ? 0 : video.star_value} />
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
            {/* 0★ is always free at runtime (flows/media.ts), so a 0-priced item
                must default to Free here even if is_free wasn't set yet. */}
            <select name="is_free" defaultValue={video.is_free || video.star_value === 0 ? "true" : "false"}
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
          <button disabled={readOnly} onClick={() => setEditing(true)}
            className="flex-1 rounded border border-line py-1 text-xs hover:bg-muted/10">
            Edit
          </button>
          <button onClick={remove} disabled={pending || readOnly}
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
  const {readOnly}=useDashboardAccess();
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
      // Same pre-flight as the single-photo queue. Bundle items are paid media
      // too, and one item Telegram refuses takes the whole bundle down with it.
      // The server action re-checks; this only reports it sooner.
      const verdict = await measurePhoto(file);
      if (!verdict.ok) {
        alert(`${file.name}\n\n${verdict.message}`);
        continue;
      }
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
          <input name="caption" defaultValue={bundle.caption ?? ""} placeholder="Stored caption (used only when a live contextual caption is not required)"
            className="w-full rounded border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
          <input name="star_price" type="number" min={1} max={MAX_PHOTO_BUNDLE_PRICE_STARS} step={1} required
            defaultValue={bundle.star_price} placeholder="⭐ price"
            className="w-full rounded border border-line bg-bg px-3 py-2 outline-none focus:border-accent" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_onboarding" defaultChecked={bundle.is_onboarding} className="h-4 w-4 accent-good" />
            Primary bundle (sellable inventory, not auto-sent)
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
              disabled={readOnly} onClick={() => setEditing(true)}
              className="rounded border border-line px-3 py-1 text-xs hover:bg-muted/10"
            >
              Edit
            </button>
            <button
              onClick={remove}
              disabled={pending || readOnly}
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
                disabled={readOnly} onClick={() => removeItem(item.id, item.storage_path)}
                className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 px-1 text-xs text-crit group-hover:flex"
              >
                ✕
              </button>
            </div>
          ))}
        <label
          className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-[#06172f] bg-[#06172f] text-2xl font-bold text-white shadow-[0_8px_22px_rgba(6,23,47,0.2)] transition hover:border-[#4a8ec4] hover:bg-[#082b55] lg:h-16 lg:w-16 lg:text-xl"
          hidden={readOnly} aria-label="Add photos to bundle"
          title={`Add photos to bundle. ${PHOTO_LIMITS_HINT}`}
        >
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
        className="w-fit min-w-[210px] rounded-xl border border-[#06172f] bg-[#06172f] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(6,23,47,0.2)] transition hover:border-[#4a8ec4] hover:bg-[#082b55] lg:py-2.5"
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
      <input name="star_price" type="number" min={1} max={MAX_PHOTO_BUNDLE_PRICE_STARS} step={1} required
        defaultValue={DEFAULT_PHOTO_BUNDLE_PRICE_STARS} placeholder="⭐ price"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_onboarding" className="h-4 w-4 accent-good" />
        Primary bundle (sellable inventory, not auto-sent)
      </label>
      <p className="text-xs text-muted">
        Bundles remain sellable inventory. Contextual offers write and verify their own live wording; this stored caption is not used as a generic contextual sales line.
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

// ── Mini App catalogue bundle row (enable/disable, delete) ───────────────────
function CatalogueBundleRowCard({ bundle, cloneId }: { bundle: CatalogueBundleRow; cloneId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const count = bundle.media_kind === "video" ? bundle.video_ids.length : bundle.photo_ids.length;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel p-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{bundle.title}</div>
        <div className="text-xs text-muted">
          {bundle.media_kind === "video" ? "Video" : "Photo"} bundle, {count} items, {bundle.price_stars} Stars (was {bundle.regular_stars})
        </div>
        {bundle.caption && <div className="mt-1 truncate text-xs text-muted">{bundle.caption}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setCatalogueBundleEnabled(cloneId, bundle.id, !bundle.enabled);
              router.refresh();
            })
          }
          className={
            "rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50 " +
            (bundle.enabled ? "border-good text-good" : "border-line text-muted")
          }
        >
          {bundle.enabled ? "Enabled" : "Disabled"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Delete "${bundle.title}"? The photos or videos in it are not deleted.`)) return;
            startTransition(async () => {
              await deleteCatalogueBundle(cloneId, bundle.id);
              router.refresh();
            });
          }}
          className="rounded border border-line px-3 py-1.5 text-xs text-muted hover:bg-muted/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Create Mini App catalogue bundle form ─────────────────────────────────────
// Picks 2-10 existing paid photos or videos (one kind only, no mixing) and
// creates a catalogue_bundles row. Price is computed here to match the DB
// trigger's own formula exactly (least(2200, sum - cheapest)); the trigger
// independently recomputes it and rejects the insert if it does not match.
function CreateCatalogueBundleForm({ cloneId, photos, videos }: { cloneId: string; photos: Photo[]; videos: Video[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"photo" | "video">("photo");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const sellable = (kind === "photo" ? photos : videos).filter((item) => !item.is_free && item.star_value > 0);
  const term = filter.trim().toLowerCase();
  const filtered = term ? sellable.filter((item) => (item.caption ?? "").toLowerCase().includes(term)) : sellable;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < CATALOGUE_BUNDLE_MAX_ITEMS) next.add(id);
      return next;
    });
  }

  function changeKind(next: "photo" | "video") {
    setKind(next);
    setSelected(new Set());
  }

  function submit(fd: FormData) {
    setError(null);
    for (const id of selected) fd.append("itemIds", id);
    startTransition(async () => {
      try {
        await createCatalogueBundle(cloneId, fd);
        setOpen(false);
        setSelected(new Set());
        setFilter("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create bundle.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-fit min-w-[210px] rounded-xl border border-[#06172f] bg-[#06172f] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(6,23,47,0.2)] transition hover:border-[#4a8ec4] hover:bg-[#082b55] lg:py-2.5"
      >
        + New Mini App bundle
      </button>
    );
  }

  return (
    <form action={submit} className="grid gap-3 rounded-lg border border-line bg-panel p-5">
      <h3 className="text-sm font-semibold text-muted">New Mini App bundle</h3>
      <input name="title" required placeholder="Bundle title"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="caption" placeholder="Caption (optional)"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="kind" value="photo" checked={kind === "photo"} onChange={() => changeKind("photo")} /> Photo bundle
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="kind" value="video" checked={kind === "video"} onChange={() => changeKind("video")} /> Video bundle
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 accent-good" />
        Enabled, visible in the catalogue right away
      </label>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search captions"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
      <div className="grid max-h-64 gap-1 overflow-y-auto rounded border border-line p-2">
        {filtered.length === 0 && (
          <p className="p-2 text-xs text-muted">No paid {kind === "photo" ? "photos" : "videos"} available. Give one a Star price first.</p>
        )}
        {filtered.map((item) => (
          <label key={item.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/10">
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              disabled={!selected.has(item.id) && selected.size >= CATALOGUE_BUNDLE_MAX_ITEMS}
            />
            <span className="flex-1 truncate">{item.caption || item.id}</span>
            <span className="text-muted">{item.star_value}⭐</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        {selected.size} of {CATALOGUE_BUNDLE_MIN_ITEMS} to {CATALOGUE_BUNDLE_MAX_ITEMS} selected. Price is set automatically from the selected items.
      </p>
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || selected.size < CATALOGUE_BUNDLE_MIN_ITEMS || selected.size > CATALOGUE_BUNDLE_MAX_ITEMS}
          className="flex-1 rounded bg-accent py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep disabled:opacity-50"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setSelected(new Set()); setError(null); }}
          className="flex-1 rounded border border-line py-2 text-sm hover:bg-muted/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Bulk price / delete controls ─────────────────────────────────────────────
// This stays closed until an operator asks to edit, so the normal PPV library
// remains a browse-and-upload screen instead of a wall of checkboxes. When open,
// every action is limited to the current media type and the current creator.
function BulkMediaEditor({
  cloneId,
  type,
  total,
  selectedIds,
  onSelectAll,
  onClear,
  onEditingChange,
}: {
  cloneId: string;
  type: "photos" | "videos";
  total: number;
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onClear: () => void;
  onEditingChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const singular = type === "photos" ? "photo" : "video";
  const selectedCount = selectedIds.size;
  const parsedPrice = Number(price);
  const validPrice = price.trim() !== ""
    && Number.isSafeInteger(parsedPrice)
    && (parsedPrice === 0 || parsedPrice >= MIN_PAID_MEDIA_PRICE_STARS);

  function close() {
    if (pending) return;
    setOpen(false);
    onEditingChange(false);
    setMessage(null);
    onClear();
  }

  function changePrice() {
    if (!validPrice || selectedCount === 0) return;
    const label = parsedPrice === 0 ? "make them free" : `set them to ${parsedPrice} Stars`;
    if (!window.confirm(`Change ${selectedCount} selected ${singular}${selectedCount === 1 ? "" : "s"} and ${label}? Existing invoices keep their original price.`)) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const changed = await bulkSetMediaPrice(cloneId, type, [...selectedIds], parsedPrice);
        setMessage(`Updated ${changed} ${singular}${changed === 1 ? "" : "s"} to ${parsedPrice} Stars.`);
        onClear();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update prices");
      }
    });
  }

  function deleteSelected() {
    if (selectedCount === 0) return;
    const noun = `${selectedCount} ${singular}${selectedCount === 1 ? "" : "s"}`;
    if (!confirm(`Permanently delete ${noun}? This cannot be undone.`)) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const deleted = await bulkDeleteMedia(cloneId, type, [...selectedIds]);
        setMessage(`Deleted ${deleted} ${singular}${deleted === 1 ? "" : "s"}.`);
        onClear();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not delete the selected items");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onEditingChange(true);
        }}
        className="w-fit rounded-lg border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink hover:bg-muted/10"
      >
        Edit {type}
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            Edit {type}
            <span
              className="cursor-help text-[11px] font-normal text-muted"
              title={`Changes apply to this creator only. Use 0 for free content. Paid bulk prices must be at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars. Existing invoices keep their original price.`}
            >
              ⓘ
            </span>
          </div>
          <div className="text-xs text-muted">{selectedCount} of {total} selected</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSelectAll} disabled={pending || total === 0}
            className="rounded border border-line bg-panel px-2.5 py-1.5 text-xs font-medium hover:bg-muted/10 disabled:opacity-50">
            Select all
          </button>
          <button type="button" onClick={onClear} disabled={pending || selectedCount === 0}
            className="rounded border border-line bg-panel px-2.5 py-1.5 text-xs font-medium hover:bg-muted/10 disabled:opacity-50">
            Clear
          </button>
          <button type="button" onClick={close} disabled={pending}
            className="rounded border border-line bg-panel px-2.5 py-1.5 text-xs font-medium hover:bg-muted/10 disabled:opacity-50">
            Done
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,180px)_auto_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">New price in Stars</span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={`0 or ${MIN_PAID_MEDIA_PRICE_STARS}+`}
            className="w-full rounded border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button type="button" onClick={changePrice} disabled={pending || selectedCount === 0 || !validPrice}
          className="rounded bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-deep disabled:opacity-50">
          {pending ? "Saving…" : "Change price"}
        </button>
        <button type="button" onClick={deleteSelected} disabled={pending || selectedCount === 0}
          className="rounded border border-crit/35 bg-panel px-3 py-2 text-sm font-semibold text-crit hover:bg-crit/10 disabled:opacity-50">
          Delete selected
        </button>
      </div>

      {message && <p role="status" className="mt-2 text-xs font-medium text-ink">{message}</p>}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type Tab = "photos" | "videos" | "bundles" | "pricing";

export default function MediaManager({
  cloneId,
  photos,
  videos,
  bundles,
  catalogueBundles,
  categoryPricing,
}: {
  cloneId: string;
  photos: Photo[];
  videos: Video[];
  bundles: Bundle[];
  catalogueBundles: CatalogueBundleRow[];
  categoryPricing: Record<string, number> | null;
}) {
  const [tab, setTab] = useState<Tab>("photos");
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [editingVideos, setEditingVideos] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(() => new Set());
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());

  function toggleSelection(type: "photos" | "videos", id: string) {
    const setSelected = type === "photos" ? setSelectedPhotoIds : setSelectedVideoIds;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "photos", label: "Photos", count: photos.length },
    { key: "videos", label: "Videos", count: videos.length },
    { key: "bundles", label: "Bundles", count: bundles.length },
    { key: "pricing", label: "Pricing", count: 0 },
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
              (tab === t.key ? "bg-panel text-ink shadow-sm" : "text-[#06172f]/75 hover:bg-white/25 hover:text-[#06172f]")
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
        <ManagerOnly><PhotoUploadQueue cloneId={cloneId} onDone={() => {}} /></ManagerOnly>
        {photos.length > 0 ? (
          <>
            <ManagerOnly><BulkMediaEditor
              cloneId={cloneId}
              type="photos"
              total={photos.length}
              selectedIds={selectedPhotoIds}
              onSelectAll={() => setSelectedPhotoIds(new Set(photos.map((photo) => photo.id)))}
              onClear={() => setSelectedPhotoIds(new Set())}
              onEditingChange={setEditingPhotos}
            /></ManagerOnly>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((p) => (
                <PhotoCard
                  key={p.id}
                  photo={p}
                  cloneId={cloneId}
                  selecting={editingPhotos}
                  selected={selectedPhotoIds.has(p.id)}
                  onToggleSelect={() => toggleSelection("photos", p.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            No photos yet. Upload some above.
          </div>
        )}
      </div>

      <div className={tab === "videos" ? "grid gap-6" : "hidden"}>
        <ManagerOnly><VideoUploadQueue cloneId={cloneId} onDone={() => {}} /></ManagerOnly>
        {videos.length > 0 ? (
          <>
            <ManagerOnly><BulkMediaEditor
              cloneId={cloneId}
              type="videos"
              total={videos.length}
              selectedIds={selectedVideoIds}
              onSelectAll={() => setSelectedVideoIds(new Set(videos.map((video) => video.id)))}
              onClear={() => setSelectedVideoIds(new Set())}
              onEditingChange={setEditingVideos}
            /></ManagerOnly>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {videos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  cloneId={cloneId}
                  selecting={editingVideos}
                  selected={selectedVideoIds.has(v.id)}
                  onToggleSelect={() => toggleSelection("videos", v.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            No videos yet. Upload some above.
          </div>
        )}
      </div>

      <div className={tab === "bundles" ? "grid gap-4" : "hidden"}>
        <ManagerOnly><CreateBundleForm cloneId={cloneId} /></ManagerOnly>
        {bundles.length > 0 ? (
          bundles.map((b) => <BundleCard key={b.id} bundle={b} cloneId={cloneId} />)
        ) : (
          <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
            No bundles yet. Create one above.
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Mini App catalogue bundles</h3>
          <p className="mb-3 text-xs text-muted">
            These are the bundles fans see and buy in the Mini App catalogue. Separate from the chat bundles above.
          </p>
          <div className="grid gap-3">
            <ManagerOnly><CreateCatalogueBundleForm cloneId={cloneId} photos={photos} videos={videos} /></ManagerOnly>
            {catalogueBundles.length > 0 ? (
              catalogueBundles.map((b) => <CatalogueBundleRowCard key={b.id} bundle={b} cloneId={cloneId} />)
            ) : (
              <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted">
                No Mini App bundles yet. Create one above.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={tab === "pricing" ? "grid gap-4" : "hidden"}>
        <ReadOnlyEditor><PricingTab cloneId={cloneId} categoryPricing={categoryPricing} photoCount={photos.length} videoCount={videos.length} /></ReadOnlyEditor>
      </div>
    </div>
  );
}

// ── Pricing guide + reprice (moved here from Config/Money, 2026-09-01) ──────
// Lives with the media it prices instead of a separate tab, and unlike the old
// location, changing a price here can be pushed onto every EXISTING item via
// Reprice — the old Config tab only ever affected new uploads.
function PricingTab({
  cloneId,
  categoryPricing,
  photoCount,
  videoCount,
}: {
  cloneId: string;
  categoryPricing: Record<string, number> | null;
  photoCount: number;
  videoCount: number;
}) {
  const router = useRouter();
  const initialSavedGuide = normalizeSafeCategoryGuide(categoryPricing);
  const [guide, setGuide] = useState<Record<string, number>>(() => ({
    ...(initialSavedGuide ?? DEFAULT_CATEGORY_PRICING),
  }));
  const [savedGuide, setSavedGuide] = useState<Record<string, number> | null>(initialSavedGuide);
  const [saving, startSave] = useTransition();
  const [previewing, setPreviewing] = useState<RepriceTarget | null>(null);
  const [preview, setPreview] = useState<RepricePreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [repricing, setRepricing] = useState<RepriceTarget | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const dirty = savedGuide == null || JSON.stringify(guide) !== JSON.stringify(savedGuide);

  function save() {
    setMsg(null);
    setFailed(false);
    startSave(async () => {
      try {
        await updateCategoryPricing(cloneId, guide);
        setSavedGuide({ ...guide });
        setPreview(null);
        setConfirmation("");
        setMsg("Pricing guide saved. Preview existing content before applying it.");
        router.refresh();
      } catch (error) {
        setFailed(true);
        setMsg(error instanceof Error ? error.message : "Could not save the pricing guide");
      }
    });
  }

  async function loadPreview(target: RepriceTarget) {
    if (dirty) return;
    setPreviewing(target);
    setPreview(null);
    setConfirmation("");
    setMsg(null);
    setFailed(false);
    try {
      setPreview(await previewRepriceMedia(cloneId, target));
    } catch (error) {
      setFailed(true);
      setMsg(error instanceof Error ? error.message : "Could not preview price changes");
    } finally {
      setPreviewing(null);
    }
  }

  async function applyReprice() {
    if (!preview || confirmation !== preview.confirmationPhrase || preview.changes === 0) return;
    const target = preview.target;
    setRepricing(target);
    setMsg(null);
    setFailed(false);
    try {
      const result = await repriceMedia(cloneId, target, confirmation);
      const parts: string[] = [];
      if (target !== "videos") parts.push(`${result.photos} photo${result.photos === 1 ? "" : "s"}`);
      if (target !== "photos") parts.push(`${result.videos} video${result.videos === 1 ? "" : "s"}`);
      const incomplete = result.skippedConcurrent + result.failed;
      setFailed(incomplete > 0);
      setMsg(
        `Safely repriced ${parts.join(" and ")}. Free items and higher existing prices stayed unchanged.` +
          (incomplete > 0
            ? ` ${result.skippedConcurrent} changed after preview and ${result.failed} failed; refresh and preview again for those items.`
            : ""),
      );
      setPreview(null);
      setConfirmation("");
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMsg(error instanceof Error ? error.message : "Could not apply price changes");
    } finally {
      setRepricing(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <div className="text-sm font-semibold">Category pricing</div>
          <span
            className="cursor-help text-[11px] text-muted"
            title={`Suggested price per content type. New uploads are tagged and priced from the highest matching category. Paid guide prices must be at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars. Leave price blank on upload to use this guide.`}
          >
            ⓘ
          </span>
        </div>
        {initialSavedGuide == null && (
          <div className="mb-3 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
            The saved guide was missing or below the {MIN_PAID_MEDIA_PRICE_STARS}-Star safety floor. Safe defaults are shown. Save before previewing existing content.
          </div>
        )}
        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-4">
          {PRICING_CATEGORIES.map((k) => (
            <label key={k} className="grid gap-0.5">
              <span className="truncate text-[10px] leading-tight text-muted" title={CATEGORY_LABELS[k] ?? k}>
                {CATEGORY_LABELS[k] ?? k}
              </span>
              <input
                type="number"
                min={MIN_PAID_MEDIA_PRICE_STARS}
                step={1}
                value={guide[k] ?? MIN_PAID_MEDIA_PRICE_STARS}
                onChange={(e) => setGuide((prev) => ({
                  ...prev,
                  [k]: Math.max(MIN_PAID_MEDIA_PRICE_STARS, Math.round(Number(e.target.value) || MIN_PAID_MEDIA_PRICE_STARS)),
                }))}
                className="rounded-md border border-line bg-panel px-2 py-1 text-center text-sm tabular-nums text-ink outline-none focus:border-ink/30"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-panel disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save guide"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset this guide to the safe 600-3600 Star commercial baseline? Existing content will not change until a separate preview is confirmed.")) {
                setGuide({ ...DEFAULT_CATEGORY_PRICING });
              }
            }}
            className="text-[11px] font-medium text-muted underline hover:text-ink"
          >
            Reset to default
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <div className="text-sm font-semibold">Reprice existing content</div>
          <span
            className="cursor-help text-[11px] text-muted"
            title="Preview compares every item with the saved guide. Apply can only raise a paid price. Free content and higher existing prices are protected. Use selected-item editing for a deliberate reduction."
          >
            ⓘ
          </span>
        </div>
        {dirty && (
            <div className="mb-2 rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
            Save the guide first. Preview always reads the saved server copy.
            </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadPreview("photos")}
            disabled={dirty || previewing !== null || repricing !== null || photoCount === 0}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
          >
            {previewing === "photos" ? "Previewing…" : `Preview ${photoCount} photo${photoCount === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={() => loadPreview("videos")}
            disabled={dirty || previewing !== null || repricing !== null || videoCount === 0}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
          >
            {previewing === "videos" ? "Previewing…" : `Preview ${videoCount} video${videoCount === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={() => loadPreview("all")}
            disabled={dirty || previewing !== null || repricing !== null || (photoCount === 0 && videoCount === 0)}
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-panel disabled:opacity-40"
          >
            {previewing === "all" ? "Previewing…" : "Preview all"}
          </button>
        </div>

        {preview && (
          <div className="mt-3 grid gap-3 rounded-lg border border-line bg-bg p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><span className="block text-muted">Will increase</span><strong className="text-ink">{preview.changes}</strong></div>
              <div><span className="block text-muted">Already matched</span><strong className="text-ink">{preview.unchanged}</strong></div>
              <div><span className="block text-muted">Higher price protected</span><strong className="text-ink">{preview.protectedFromDecrease}</strong></div>
              <div><span className="block text-muted">Free protected</span><strong className="text-ink">{preview.protectedFree}</strong></div>
            </div>
            <div className="text-muted">
              Net catalogue increase: <strong className="text-ink">+{preview.increaseStars.toLocaleString()} Stars</strong>. No price will be lowered.
            </div>
            {preview.changes > 0 ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1 block text-muted">Type {preview.confirmationPhrase} to apply</span>
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="w-full rounded border border-line bg-panel px-2.5 py-1.5 font-mono outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyReprice}
                  disabled={repricing !== null || confirmation !== preview.confirmationPhrase}
                  className="rounded-md bg-ink px-3 py-1.5 font-semibold text-panel disabled:opacity-40"
                >
                  {repricing ? "Applying…" : `Apply ${preview.changes} safe change${preview.changes === 1 ? "" : "s"}`}
                </button>
              </div>
            ) : (
              <div className="font-medium text-good">Nothing needs changing under the safe rules.</div>
            )}
          </div>
        )}
      </div>

      {msg && <div role={failed ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-xs ${failed ? "border-crit/30 bg-crit/10 text-crit" : "border-line bg-panel text-muted"}`}>{msg}</div>}
    </div>
  );
}

