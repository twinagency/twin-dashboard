import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { randomUUID } from "crypto";
import { openAsBlob } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "@/lib/creator-routing";
import {
  creatorContentCompleted,
  creatorContentRequirement,
  isCreatorContentKind,
} from "@/lib/creator-content-requirements";
import { creatorImageDecodes } from "@/lib/creator-image-validation";
import { creatorOnboardingEditable } from "@/lib/flirt-onboarding";

import { withDashboardAccess } from "@/lib/dashboard-access";
import { trustedFormOrigin } from "@/lib/form-origin";
import { boundedFormData, CreatorUploadError, type StagedCreatorFile } from "@/lib/creator-upload-stream";
import { creatorUploadMaxBytes, MAX_CREATOR_REQUEST_BYTES, MAX_CREATOR_VIDEO_BYTES } from "@/lib/creator-upload-limits";

export const runtime = "nodejs";

function back(req: Request, status: string, step?: "content" | "voice") {
  if (req.headers.get("accept")?.includes("application/json")) {
    const success = status === "content_saved" || status === "voice_saved";
    return NextResponse.json({ status }, {
      status: success ? 200 : status === "upload_busy" ? 429 : status === "application_locked" ? 409 : 400,
      headers: { "Cache-Control": "private, no-store", ...(status === "upload_busy" ? { "Retry-After": "5" } : {}) },
    });
  }
  const url = creatorRequestUrl(req, "/creator/onboarding");
  url.searchParams.set("status", status);
  if (step) url.searchParams.set("step", step);
  url.hash = "step-result";
  return NextResponse.redirect(url, 303);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

const extensionMime: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};
const MAX_REQUEST_BYTES = MAX_CREATOR_REQUEST_BYTES;
const MAX_BATCH_BYTES = MAX_CREATOR_VIDEO_BYTES;
const MAX_ACCOUNT_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_ACCOUNT_FILES = 5000;
const MAX_VIDEO_DURATION_SECONDS = 30 * 60;
const MAX_VIDEO_PIXELS = 4096 * 2160;
const MAX_VIDEO_EDGE = 4096;
const MAX_ACTIVE_UPLOADS = 1;
const activeUploadAccounts = new Set<string>();
let activeUploadRequests = 0;
const execFileAsync = promisify(execFile);

function mediaToolPath(tool: "ffmpeg" | "ffprobe") {
  return process.platform === "win32" ? `${tool}.exe` : `/usr/bin/${tool}`;
}

function mediaToolOptions(timeout: number) {
  const env: NodeJS.ProcessEnv = process.platform === "win32"
    ? { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }
    : { NODE_ENV: process.env.NODE_ENV, PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
  return { timeout, maxBuffer: 64 * 1024, windowsHide: true, killSignal: "SIGKILL" as const, env };
}

function normalizedContentMime(file: StagedCreatorFile, allowed: string[]): string | null {
  const declared = file.type.toLowerCase();
  if (allowed.includes(declared)) return declared;
  const extension = file.name.toLowerCase().split(".").pop() || "";
  const inferred = extensionMime[extension];
  return inferred && allowed.includes(inferred) ? inferred : null;
}

async function existingUploadUsage(accountId: string) {
  const pageSize = 500;
  let bytes = 0;
  let count = 0;
  while (count < MAX_ACCOUNT_FILES) {
    const { data, error } = await supabaseAdmin
      .from("creator_files")
      .select("size_bytes")
      .eq("creator_account_id", accountId)
      .range(count, Math.min(count + pageSize, MAX_ACCOUNT_FILES) - 1);
    if (error) return { bytes: 0, count: 0, error };
    for (const file of data || []) bytes += Number(file.size_bytes) || 0;
    const received = data?.length || 0;
    count += received;
    if (received < pageSize) break;
  }
  return { bytes, count, error: null };
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

async function videoProbeMatches(file: StagedCreatorFile, mime: string): Promise<boolean> {
  const filePath = file.path;
  try {
    const { stdout, stderr } = await execFileAsync(mediaToolPath("ffprobe"), [
      "-v", "error",
      "-protocol_whitelist", "file",
      "-count_packets",
      "-select_streams", "v:0",
      "-show_entries", "format=format_name,duration,size:stream=codec_type,codec_name,width,height,duration,nb_read_packets:stream_disposition=attached_pic",
      "-of", "json",
      filePath,
    ], mediaToolOptions(60_000));
    if (String(stderr).trim()) return false;
    const probe = JSON.parse(String(stdout)) as {
      format?: { format_name?: string; duration?: string; size?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; nb_read_packets?: string; disposition?: { attached_pic?: number } }>;
    };
    const formats = new Set(String(probe.format?.format_name || "").split(","));
    const expectedContainer = mime === "video/webm"
      ? formats.has("webm") || formats.has("matroska")
      : ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].some((format) => formats.has(format));
    const stream = probe.streams?.[0];
    const packets = Number(stream?.nb_read_packets);
    const width = Number(stream?.width);
    const height = Number(stream?.height);
    const streamDuration = Number(stream?.duration);
    const formatDuration = Number(probe.format?.duration);
    const duration = Number.isFinite(streamDuration) && streamDuration > 0 ? streamDuration : formatDuration;
    const reportedSize = Number(probe.format?.size);
    const supportedCodecs = new Set(["h264", "hevc", "vp8", "vp9", "av1", "prores", "mpeg4"]);
    if (Number.isFinite(duration) && duration > MAX_VIDEO_DURATION_SECONDS) throw new CreatorUploadError("upload_video_too_long");
    if (width > MAX_VIDEO_EDGE || height > MAX_VIDEO_EDGE || width * height > MAX_VIDEO_PIXELS) throw new CreatorUploadError("upload_video_resolution");
    const probeValid = expectedContainer && stream?.codec_type === "video" && !!stream.codec_name
      && supportedCodecs.has(stream.codec_name)
      && stream.disposition?.attached_pic !== 1
      && Number.isFinite(packets) && packets > 0
      && Number.isFinite(width) && width > 0 && width <= MAX_VIDEO_EDGE
      && Number.isFinite(height) && height > 0 && height <= MAX_VIDEO_EDGE
      && width * height <= MAX_VIDEO_PIXELS
      && Number.isFinite(duration) && duration > 0 && duration <= MAX_VIDEO_DURATION_SECONDS
      && Number.isFinite(reportedSize) && reportedSize === file.size;
    if (!probeValid) return false;

    const decoded = await execFileAsync(mediaToolPath("ffmpeg"), [
      "-v", "error",
      "-xerror",
      "-abort_on", "empty_output",
      "-nostdin",
      "-threads", "1",
      "-protocol_whitelist", "file",
      "-i", filePath,
      "-map", "0:v:0",
      "-frames:v", "1",
      "-f", "null",
      "-",
    ], mediaToolOptions(15_000));
    return !String(decoded.stderr).trim();
  } catch (error) {
    if (error instanceof CreatorUploadError) throw error;
    return false;
  }
}

async function contentSignatureMatches(file: StagedCreatorFile, mime: string): Promise<boolean> {
  if (file.size < 32) return false;
  const handle = await open(file.path, "r");
  const header = Buffer.alloc(32);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  const bytes = mime.startsWith("image/") ? await readFile(file.path) : header;
  const headerMatches =
    (mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (mime === "image/png" && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) ||
    (mime === "image/gif" && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) ||
    (mime === "image/webp" && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP");
  if (mime.startsWith("image/") && !headerMatches) return false;

  const box = ascii(bytes, 4, 4);
  const brand = ascii(bytes, 8, 4);
  const nonVideoIsoBmffBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis"]);

  if (mime.startsWith("image/")) return creatorImageDecodes(bytes, mime);

  if (file.size < 1024) return false;
  if ((mime === "video/mp4" || mime === "video/quicktime") && box === "ftyp" && nonVideoIsoBmffBrands.has(brand)) return false;
  if (mime === "video/webm" && ![0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => bytes[index] === byte)) return false;
  return videoProbeMatches(file, mime);
}

export async function POST(req: NextRequest) {
  // This streaming route is excluded from middleware's full-body buffer.
  // Enforce the same origin/action gate here before reading any upload bytes.
  if (req.headers.has("next-action") || !trustedFormOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  // Middleware normally sanitizes audience/path headers. Do not consult any of
  // those caller-controlled headers or a separate operator cookie on this route.
  // The validated creator account below owns every row and the FLIRT-local client.
  return withDashboardAccess(null, () => uploadForCreator(req));
}

async function uploadForCreator(req: NextRequest) {
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator) {
    if (req.headers.get("accept")?.includes("application/json")) return NextResponse.json({ status: "session_expired" }, { status: 401 });
    return NextResponse.redirect(creatorRequestUrl(req, creatorLoginPath(null, req.cookies.get(CREATOR_PORTAL_COOKIE)?.value)), 303);
  }
  if (creator.readOnly) return new NextResponse("Creator demo is read-only", { status: 403 });
  const accountId = creator.accountId;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return back(req, "upload_too_large");
  if (activeUploadRequests >= MAX_ACTIVE_UPLOADS || activeUploadAccounts.has(accountId)) return back(req, "upload_busy");
  activeUploadAccounts.add(accountId);
  activeUploadRequests += 1;

  let staged: Awaited<ReturnType<typeof boundedFormData>> | undefined;
  try {
  const [{ data: application, error: applicationError }, uploadUsage] = await Promise.all([
    supabaseAdmin.from("creator_applications").select("status").eq("creator_account_id", accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    existingUploadUsage(accountId),
  ]);
  if (applicationError || uploadUsage.error) return back(req, "upload_error");
  if (uploadUsage.count >= MAX_ACCOUNT_FILES) return back(req, "upload_quota");
  staged = await boundedFormData(req);
  const kind = staged.fields.get("kind") || "";
  const contentRequirement = creatorContentRequirement(kind);
  if (kind !== "voice" && !isCreatorContentKind(kind)) return back(req, "upload_error");
  const step = kind === "voice" ? "voice" : "content";
  // Finishing optional FLIRT intake must not prevent later content uploads.
  // Ownership, read-only demos, rejected applications and strict runtimes stay protected.
  if (!creatorOnboardingEditable(application?.status)) return back(req, "application_locked", step);
  const files = staged.files;
  if (!files.length) return back(req, "upload_empty", step);
  if (files.length > 25) return back(req, "upload_too_many", step);

  const maxBytes = creatorUploadMaxBytes(kind);
  const aggregateBytes = files.reduce((total, file) => total + file.size, 0);
  if (aggregateBytes > MAX_BATCH_BYTES) return back(req, "upload_too_large", step);
  if (uploadUsage.bytes + aggregateBytes > MAX_ACCOUNT_BYTES) return back(req, "upload_quota", step);
  const bucket = kind === "voice" ? "voice-samples" : "onboarding-content";
  const now = new Date().toISOString();
  const normalizedMimes = new Map<StagedCreatorFile, string>();

  for (const file of files) {
    if (file.size > maxBytes) return back(req, "upload_too_large", step);
    if (contentRequirement) {
      const mime = normalizedContentMime(file, contentRequirement.accept.split(","));
      if (!mime || !mime.startsWith(`${contentRequirement.media}/`) || !(await contentSignatureMatches(file, mime))) return back(req, "upload_wrong_type", step);
      normalizedMimes.set(file, mime);
    }
  }

  const uploadedPaths: string[] = [];
  const insertedPaths: string[] = [];
  const rollbackBatch = async () => {
    if (!insertedPaths.length) {
      if (uploadedPaths.length) await supabaseAdmin.storage.from(bucket).remove(uploadedPaths);
      return;
    }
    const { error: deleteError } = await supabaseAdmin.from("creator_files").delete().eq("creator_account_id", accountId).in("storage_path", insertedPaths);
    if (!deleteError) {
      await supabaseAdmin.storage.from(bucket).remove(uploadedPaths);
      return;
    }
    const orphanPaths = uploadedPaths.filter((path) => !insertedPaths.includes(path));
    if (orphanPaths.length) await supabaseAdmin.storage.from(bucket).remove(orphanPaths);
  };

  for (const file of files) {
    const mime = normalizedMimes.get(file) || file.type || "application/octet-stream";
    const objectPath = `creators/${accountId}/${kind}/${Date.now()}-${randomUUID()}-${safeName(file.name)}`;
    const body = await openAsBlob(file.path, { type: mime });
    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(objectPath, body, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      await rollbackBatch();
      return back(req, "upload_error", step);
    }
    uploadedPaths.push(objectPath);

    const { error: rowError } = await supabaseAdmin.from("creator_files").insert({
      creator_account_id: accountId,
      kind,
      bucket,
      storage_path: objectPath,
      mime_type: mime,
      size_bytes: file.size,
      original_name: file.name,
      storage_transfer_status: "verified",
      storage_verified_at: now,
      source_object_status: "present",
      source_object_checked_at: now,
    });
    if (rowError) {
      await rollbackBatch();
      return back(req, "upload_error", step);
    }
    insertedPaths.push(objectPath);
  }

  let patch: { content_completed?: boolean; voice_completed?: boolean; updated_at: string };
  if (kind === "voice") {
    patch = { voice_completed: true, updated_at: now };
  } else {
    const [{ data: verifiedFiles, error: countError }, { data: progress, error: progressReadError }] = await Promise.all([
      supabaseAdmin.from("creator_files").select("kind,storage_transfer_status").eq("creator_account_id", accountId),
      supabaseAdmin.from("creator_onboarding_progress").select("content_completed").eq("creator_account_id", accountId).maybeSingle(),
    ]);
    if (countError || progressReadError) return back(req, "content_saved", "content");
    patch = { content_completed: creatorContentCompleted(verifiedFiles || [], !!progress?.content_completed), updated_at: now };
  }
  const { error: progressError } = await supabaseAdmin.from("creator_onboarding_progress").upsert({ creator_account_id: accountId, ...patch }, { onConflict: "creator_account_id" });
  if (progressError) return back(req, kind === "voice" ? "voice_saved" : "content_saved", step);
  return back(req, kind === "voice" ? "voice_saved" : "content_saved", step);
  } catch (error) {
    return back(req, error instanceof CreatorUploadError ? error.status : "upload_error", staged?.fields.get("kind") === "voice" ? "voice" : "content");
  } finally {
    await staged?.dispose().catch(() => undefined);
    activeUploadAccounts.delete(accountId);
    activeUploadRequests = Math.max(0, activeUploadRequests - 1);
  }
}

