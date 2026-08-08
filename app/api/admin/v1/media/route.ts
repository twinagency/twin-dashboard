import { withAdmin, ok, jsonError, logAdminWrite } from "@/lib/api-route";
import { uploadPhoto, uploadVideo } from "@/app/media/actions";
import { resolveClone } from "@/lib/api-read";

export const dynamic = "force-dynamic";
// Uploads are big and slow (format conversion, then an AI captioning call per
// item), so the default serverless-ish budget is not enough for a real set.
export const maxDuration = 300;

// Upload photos or videos to a clone's library, over the admin API.
//
// WHY THIS EXISTS
// A clone created through the API had no way to get CONTENT. She would be live,
// compiled, voiced — and with an empty library, which means she cannot send a
// locked photo, cannot fill a bundle, and has nothing to actually sell. The
// clone-creation path was therefore only ever half a path.
//
// WHY IT DELEGATES INSTEAD OF INSERTING
// It calls uploadPhoto()/uploadVideo(), the SAME server actions the dashboard's
// /media page uses. Those do considerably more than move bytes:
//   · convert any format (HEIC/PNG/WebP) to JPEG and enforce Telegram's 10MB cap
//   · AI-caption each item — caption, teaser caption, nudity, explicitness,
//     nsfw flag, tags — which is what lets the media matcher ever pick it
//   · resolve a star price from the clone's own pricing guide
//   · set is_free correctly, since the runtime treats an item as unlocked by
//     is_free and NEVER by price, so a 0-star item without it would make the
//     bot try to invoice a 0-star payment
// An endpoint that inserted into `photos` directly would skip all of that and
// produce rows the media flows quietly never select.
//
// multipart/form-data:
//   clone   uuid, slug or name          (required)
//   type    "photo" | "video"           (default photo)
//   file    one or more files           (required, repeatable)
//   is_free "true" to force free
//   star_value  manual price, overrides the guide
export const POST = withAdmin(async (req) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("body must be multipart/form-data with a `file` field", 400);
  }

  const cloneKey = String(form.get("clone") ?? "").trim();
  if (!cloneKey) return jsonError("clone is required (uuid, slug, or name)", 400);
  const clone = await resolveClone(cloneKey);
  if (!clone) return jsonError(`no clone matching "${cloneKey}"`, 404);

  const type = String(form.get("type") ?? "photo").toLowerCase();
  if (type !== "photo" && type !== "video") return jsonError('type must be "photo" or "video"', 400);

  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return jsonError("no files: send one or more `file` parts", 400);

  // Serially, not in parallel. Each upload makes its own captioning call, and a
  // set of thirty fired at once is a burst of 429s that surfaces as "some
  // photos silently missing" — the worst possible failure for a media library,
  // because the count looks plausible and nobody notices which ones are gone.
  const uploaded: string[] = [];
  const failed: { file: string; error: string }[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("image_name", file.name);
    if (form.get("is_free") != null) fd.set("is_free", String(form.get("is_free")));
    if (form.get("star_value") != null) fd.set("star_value", String(form.get("star_value")));
    try {
      if (type === "photo") await uploadPhoto(clone.id, fd);
      else await uploadVideo(clone.id, fd);
      uploaded.push(file.name);
    } catch (e) {
      // One bad file must not lose the whole set — and it must be NAMED, so the
      // caller knows exactly which item to retry rather than re-uploading all.
      failed.push({ file: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  logAdminWrite(`media upload (${uploaded.length} ${type}s)`, clone.id, { uploaded: uploaded.length, failed: failed.length });

  return ok({
    clone,
    type,
    uploaded,
    failed,
    note:
      failed.length > 0
        ? `${uploaded.length} uploaded, ${failed.length} failed. Failed files were NOT stored; retry just those.`
        : `${uploaded.length} ${type}(s) uploaded, captioned and priced from her guide.`,
  });
});
