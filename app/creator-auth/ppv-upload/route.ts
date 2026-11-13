// Live creator PPV upload. A plain POST, excluded from middleware like the
// onboarding upload so files up to the onboarding limits (75 MiB photo,
// 512 MiB video) stream to disk instead of hitting the 50 MB action cap.
// This handler authenticates itself: same-origin form, a real creator session
// (never view-as) and the clone from that creator's own link.
// The file goes into the PPV catalogue through the operator uploadPhoto /
// uploadVideo with the file only (price from the clone's guide). If that path
// refuses it (too large for Telegram, decode failure, provider error) the raw
// file is kept in storage under creators/<account>/ppv-inbox/ for an operator
// to add by hand, and the creator still sees it as received.
import { randomUUID } from "crypto";
import { openAsBlob } from "node:fs";
import { after, NextResponse, type NextRequest } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { trustedFormOrigin } from "@/lib/form-origin";
import { boundedFormData, type StagedCreatorFile } from "@/lib/creator-upload-stream";
import { MAX_CREATOR_IMAGE_BYTES, MAX_CREATOR_VIDEO_BYTES } from "@/lib/creator-upload-limits";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadPhoto, uploadVideo } from "@/app/media/actions";

export const runtime = "nodejs";
export const maxDuration = 900;

const NO_STORE = { "Cache-Control": "private, no-store" };
function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

async function storeUpload(accountId: string, cloneId: string, kind: "photo" | "video", file: StagedCreatorFile) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const byExt: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
    // Some browsers send no type (or octet-stream); the catalogue path needs a real one.
    const mime = file.type && file.type !== "application/octet-stream" ? file.type : byExt[ext] || (kind === "photo" ? "image/jpeg" : "video/mp4");
    const blob = await openAsBlob(file.path, { type: mime });

    let catalogueError = "";
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], file.name, { type: mime }));
      // Authorised above: real creator session, its one linked clone, one file,
      // no other fields. Run the write as the system, because the agency-scoped
      // database client refuses writes for a creator identity.
      const result = await withDashboardAccess(null, () => kind === "video" ? uploadVideo(cloneId, fd) : uploadPhoto(cloneId, fd));
      if (result.ok) return;
      catalogueError = result.error || "catalogue refused";
    } catch (error) {
      catalogueError = error instanceof Error ? error.message : "catalogue upload threw";
    }

    // Keep the original so nothing the creator sends is lost.
    const objectPath = `creators/${accountId}/ppv-inbox/${kind}/${Date.now()}-${randomUUID()}-${safeName(file.name)}`;
    const { error: storageError } = await supabaseAdmin.storage.from("onboarding-content").upload(objectPath, blob, { contentType: mime, upsert: false });
    if (storageError) {
      console.error("[ppv-upload] catalogue and inbox both failed", { cloneId, catalogueError, storageError: storageError.message });
      await supabaseAdmin.from("system_logs").insert({ clone_id: cloneId, level: "error", source: "creator-ppv-upload", message: `Creator PPV upload LOST (${file.name}): ${catalogueError}; inbox: ${storageError.message}` }).then(() => undefined, () => undefined);
      return;
    }
    console.warn("[ppv-upload] kept in inbox", { cloneId, objectPath, catalogueError });
    await supabaseAdmin.from("system_logs").insert({ clone_id: cloneId, level: "warn", source: "creator-ppv-upload", message: `Creator PPV upload kept in inbox: ${objectPath} (${catalogueError})` }).then(() => undefined, () => undefined);
}

// At most two whole-file ingests at once: each reads the file into memory and
// compresses it in the one process that also serves the operator UI and the
// public API. Later files wait staged on disk, in arrival order.
const MAX_INGESTS = 2;
let ingests = 0;
const ingestQueue: Array<() => void> = [];
async function ingestSlot(run: () => Promise<void>) {
  if (ingests < MAX_INGESTS) ingests++;
  else await new Promise<void>(resolve => ingestQueue.push(resolve));
  try { await run(); }
  finally { const next = ingestQueue.shift(); if (next) next(); else ingests--; }
}

export async function POST(req: NextRequest) {
  if (!trustedFormOrigin(req)) return reply({ ok: false, error: "Forbidden" }, 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return reply({ ok: false, error: "Please sign in again." }, 401);
  const cloneId = creator.cloneIds[0];
  if (!cloneId || creator.cloneIds.length !== 1) return reply({ ok: false, error: "Your profile is not connected yet." }, 403);

  // The creator page shows every file as uploaded (CreatorPpvUploads.tsx), so a
  // refused file must leave a system_logs row or it is lost without a trace.
  const refuse = async (error: string, status: number, detail: string) => {
    await supabaseAdmin.from("system_logs").insert({ clone_id: cloneId, level: "error", source: "creator-ppv-upload", message: `Creator PPV upload REFUSED (${detail}): ${error}` }).then(() => undefined, () => undefined);
    return reply({ ok: false, error }, status);
  };
  let staged: Awaited<ReturnType<typeof boundedFormData>> | undefined;
  try {
    staged = await boundedFormData(req, { timeoutMs: 15 * 60_000 });
    const kind = staged.fields.get("kind");
    const file = staged.files[0];
    if (staged.files.length !== 1 || !file || (kind !== "photo" && kind !== "video"))
      return await refuse("Upload one file at a time.", 400, `${staged.files.length} files, kind ${String(kind)}`);
    if (file.size > (kind === "photo" ? MAX_CREATOR_IMAGE_BYTES : MAX_CREATOR_VIDEO_BYTES))
      return await refuse(kind === "photo" ? "Photos can be up to 75 MB each." : "Videos can be up to 512 MB each.", 413, `${file.name}, ${file.size} bytes`);
    // Reply as soon as the file is staged; compression and pricing run after
    // the response, so a long iPhone video never trips the proxy timeout and
    // the page never retries (and duplicates) a file that is still processing.
    const job = staged;
    staged = undefined;
    after(async () => {
      try { await ingestSlot(() => storeUpload(creator.accountId, cloneId, kind, file)); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[ppv-upload] failed", { cloneId, error: message });
        await supabaseAdmin.from("system_logs").insert({ clone_id: cloneId, level: "error", source: "creator-ppv-upload", message: `Creator PPV upload LOST (${file.name}): ${message}` }).then(() => undefined, () => undefined);
      } finally { await job.dispose().catch(() => undefined); }
    });
    return reply({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ppv-upload] failed", { cloneId, error: message });
    await supabaseAdmin.from("system_logs").insert({ clone_id: cloneId, level: "error", source: "creator-ppv-upload", message: `Creator PPV upload LOST: ${message}` }).then(() => undefined, () => undefined);
    return reply({ ok: false, error: "Upload failed, please try again." }, 500);
  } finally {
    await staged?.dispose().catch(() => undefined);
  }
}
