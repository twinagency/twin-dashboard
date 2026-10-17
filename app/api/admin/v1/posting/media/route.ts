import { withAdmin, ok, jsonError } from "@/lib/api-route";
import { resolveClone } from "@/lib/api-read";
import { listCatalogue } from "@/lib/posting";

export const dynamic = "force-dynamic";

// Her content bucket, to choose what to post. Read only.
//   ?clone=<slug>  (required)   ?type=photo|video (default photo)
//   ?q=<words>     caption search   ?offset=0  ?limit=50 (max 200)
// Each item carries a 1h signed `url` to look at it. Post one with
// action=story|channel_post and photoId / videoId on the write route.
// The nudity flags are unreliable: look at the file, do not trust them.
export const GET = withAdmin(async (req) => {
  const p = new URL(req.url).searchParams;
  const key = p.get("clone");
  if (!key) return jsonError("clone is required", 400);
  const c = await resolveClone(key);
  if (!c) return jsonError(`no clone matching "${key}"`, 404);
  const type = p.get("type") ?? "photo";
  if (type !== "photo" && type !== "video") return jsonError('type must be "photo" or "video"', 400);
  const offset = Math.max(0, Number(p.get("offset") ?? 0) || 0);
  const limit = Math.min(200, Math.max(1, Number(p.get("limit") ?? 50) || 50));
  const { items, total } = await listCatalogue({ cloneId: c.id, kind: type, q: p.get("q") ?? "", offset, limit });
  return ok({ clone: c.slug, type, total, offset, count: items.length, items });
});
