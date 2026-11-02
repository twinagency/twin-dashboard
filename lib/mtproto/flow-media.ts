// lib/mtproto/flow-media.ts
//
// Read-only picker data for the flow editor: one girl's photos, videos,
// bundles and video sequences. Every list is capped; a table that does not
// exist yet reads as an empty list, never an error.

import { mtDb } from "./db";
import { isMissingTable, isUuid } from "./validate";

export interface PickerMedia {
  id: string;
  label: string;
  /** short-lived signed URL for the thumbnail, null when signing was not possible */
  url: string | null;
}
export interface PickerBundle {
  id: string;
  name: string;
  starPrice: number | null;
  caption: string | null;
}
export interface PickerSequence {
  id: string;
  title: string;
}
export interface FlowPicker {
  photos: PickerMedia[];
  videos: PickerMedia[];
  bundles: PickerBundle[];
  sequences: PickerSequence[];
  error: string | null;
}

export const emptyPicker = (): FlowPicker => ({ photos: [], videos: [], bundles: [], sequences: [], error: null });

const CAP = 300;

type Signer = (paths: string[]) => Promise<Map<string, string>>;

function label(caption: string | null, path: string): string {
  const c = (caption ?? "").trim();
  if (c) return c.length > 60 ? `${c.slice(0, 57)}...` : c;
  const base = path.split("/").pop() ?? path;
  return base.length > 40 ? `${base.slice(0, 37)}...` : base;
}

async function rows<T>(table: string, cols: string, cloneId: string, order = "created_at"): Promise<{ data: T[]; error: string | null }> {
  const { data, error } = await mtDb().from(table).select(cols).eq("clone_id", cloneId).order(order, { ascending: false }).limit(CAP);
  if (error) return isMissingTable(error) ? { data: [], error: null } : { data: [], error: `${table}: ${error.message}` };
  return { data: (data ?? []) as T[], error: null };
}

/** `sign` is optional: thumbnails are a nicety and the editor works without. */
export async function loadFlowPicker(cloneId: string | null, sign?: Signer): Promise<FlowPicker> {
  const out = emptyPicker();
  if (!cloneId || !isUuid(cloneId)) return out;
  const [photos, videos, bundles, seqs] = await Promise.all([
    rows<{ id: string; caption: string | null; storage_path: string }>("photos", "id,caption,storage_path", cloneId),
    rows<{ id: string; caption: string | null; storage_path: string }>("videos", "id,caption,storage_path", cloneId),
    rows<{ id: string; name: string | null; caption: string | null; star_price: number | null }>("photo_bundles", "id,name,caption,star_price", cloneId),
    rows<{ id: string; title: string }>("video_sequences", "id,title", cloneId),
  ]);
  const errors = [photos.error, videos.error, bundles.error, seqs.error].filter(Boolean);
  out.error = errors.length ? errors.join("; ") : null;
  let urls = new Map<string, string>();
  if (sign) {
    try {
      urls = await sign([...photos.data, ...videos.data].map((r) => r.storage_path).filter(Boolean));
    } catch {
      urls = new Map();
    }
  }
  out.photos = photos.data.map((r) => ({ id: r.id, label: label(r.caption, r.storage_path), url: urls.get(r.storage_path) ?? null }));
  out.videos = videos.data.map((r) => ({ id: r.id, label: label(r.caption, r.storage_path), url: urls.get(r.storage_path) ?? null }));
  out.bundles = bundles.data.map((r) => ({ id: r.id, name: (r.name ?? "").trim() || "(unnamed bundle)", starPrice: r.star_price ?? null, caption: r.caption ?? null }));
  out.sequences = seqs.data.map((r) => ({ id: r.id, title: r.title }));
  return out;
}
