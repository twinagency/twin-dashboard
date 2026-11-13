import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOnlyFansRead, requestId, PRIVATE_HEADERS } from "@/lib/onlyfans/route";
import { configuredVaultMediaBackend } from "@/lib/onlyfans/vault-media-backend";
import { configuredVaultBackend } from "@/lib/onlyfans/vault-backend";
import { MAX_CHUNK_BYTES } from "@/lib/onlyfans/vault-media";
import { trustedFormOrigin } from "@/lib/form-origin";
import { readCommandJson } from "@/lib/onlyfans/command-json";
import { creatorUuid } from "@/lib/staff-creator-scope";
import { serviceClient } from "@/lib/supabase-service";
import { isOperatorActor } from "@/lib/onlyfans/upload-permission";
import { SHARED_MEDIA_LIMIT, boundedMediaBytes, sharedChunkDigests, sharedDigest, sharedFileName, sharedSourceKind, sharedStoragePath, sharedUploadProgress, publicSharedTransfer, type SharedTransfer } from "@/lib/shared-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ accountId: string }> };
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (error: string, status = 409) => answer({ ok: false, error }, status);
const active = new Set(["prepared", "receiving", "pending", "running"]);

async function access(request: NextRequest, context: Context, write = false) {
  const auth = await requireOnlyFansRead({ agency: true, write }); if (auth instanceof NextResponse) return auth;
  const accountId = requestId((await context.params).accountId), cloneId = request.nextUrl.searchParams.get("creator");
  if (!accountId || !creatorUuid(cloneId) || request.nextUrl.searchParams.size !== 1) return refuse("Choose a creator and connected account.", 400);
  // Bind both channels before consulting private source rows or receipts.
  const accounts = await auth.backend?.listAccounts({ creatorId: cloneId });
  if (!accounts?.ok) return refuse("Connected accounts could not be verified.", 503);
  const account = accounts.data.find(a => a.accountId === accountId && a.binding.creatorId === cloneId);
  if (!account || auth.auth.agencyGrant && !auth.auth.agencyGrant.creatorIds.includes(cloneId)) return refuse("Creator access denied.", 403);
  const backend = configuredVaultMediaBackend(auth.fetch), vault = configuredVaultBackend(auth.fetch);
  if (!backend || !vault || !auth.actor) return refuse("Media sharing is unavailable.", 503);
  return { auth, account, accountId, cloneId, backend, vault, db: serviceClient() };
}

async function signedSource(db: ReturnType<typeof serviceClient>, path: string, cloneId: string) {
  if (!sharedStoragePath(path, cloneId)) throw Error("source_invalid");
  const result = await db.storage.from("media").createSignedUrl(path, 120);
  if (result.error || !result.data?.signedUrl) throw Error("source_unavailable");
  const url = new URL(result.data.signedUrl), origin = new URL(process.env.SUPABASE_URL!);
  if (url.origin !== origin.origin || !url.pathname.startsWith("/storage/v1/")) throw Error("source_invalid");
  return url.toString();
}

export async function GET(request: NextRequest, context: Context) {
  const ctx = await access(request, context); if (ctx instanceof NextResponse) return ctx;
  const rows = await ctx.db.from("shared_media_transfers").select("*").eq("clone_id", ctx.cloneId).eq("account_id", ctx.accountId).order("created_at", { ascending: false }).limit(100);
  if (rows.error) return refuse("Shared upload history is unavailable.", 503);
  // GET observes provider state only; it never creates or advances a transfer.
  const current = await ctx.backend.uploads(ctx.accountId);
  const transfers = (rows.data as SharedTransfer[]).map(row => {
    const job = current.ok ? current.data.jobs.find(job => job.jobId === row.job_id) : null;
    if (job) { try { return publicSharedTransfer({ ...row, ...sharedUploadProgress(row, job) }); } catch { return publicSharedTransfer({ ...row, error_code: "upload_mismatch" }); } }
    return publicSharedTransfer(row);
  });
  return answer({ ok: true, creatorId: ctx.cloneId, accountId: ctx.accountId, enabled: current.ok && current.data.enabled, statusAvailable: current.ok, transfers });
}

export async function POST(request: NextRequest, context: Context) {
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return refuse("Use this dashboard to share media.", 403);
  const ctx = await access(request, context, true); if (ctx instanceof NextResponse) return ctx;
  let body: unknown; try { body = await readCommandJson(request); } catch { return refuse("Invalid media selection.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return refuse("Invalid media selection.", 400);
  const command = body as Record<string, unknown>;
  if (Object.keys(command).sort().join(",") !== "kind,sourceId" || !sharedSourceKind(command.kind) || !creatorUuid(command.sourceId)) return refuse("Choose one saved photo or video.", 400);
  if (ctx.account.health !== "connected" || ctx.account.capabilities.manageContent !== "available") return refuse("Reconnect this account before sharing media.");
  const { db, cloneId, accountId, backend } = ctx;
  try {
    const source = await db.from(command.kind === "photo" ? "photos" : "videos").select("id,clone_id,storage_path").eq("id", command.sourceId).eq("clone_id", cloneId).maybeSingle();
    if (source.error || !source.data) return refuse("That saved media is unavailable.", 404);
    const lookup = () => db.from("shared_media_transfers").select("*").eq("account_id", accountId).eq("source_kind", command.kind).eq("source_id", command.sourceId).maybeSingle();
    let existing = await lookup(); if (existing.error) return refuse("Shared upload history is unavailable.", 503);
    let row = existing.data as SharedTransfer | null;
    if (!row) {
      const vault = await ctx.vault.get(accountId); if (!vault.ok || !vault.data.connectionRevision) return refuse("Refresh this account's connection before sharing media.");
      const url = await signedSource(db, source.data.storage_path, cloneId);
      const response = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(20000) });
      if (!response.ok) { await response.body?.cancel(); return refuse("The saved file could not be read.", 503); }
      let fileName: string;
      try { fileName = sharedFileName(command.sourceId, command.kind, response.headers.get("content-type")); }
      catch { await response.body?.cancel(); return refuse("This saved file format cannot be shared. Use a supported photo or video.", 422); }
      const bytes = await boundedMediaBytes(response, SHARED_MEDIA_LIMIT);
      const id = randomUUID(), sourceHash = sharedDigest(bytes);
      const inserted = await db.from("shared_media_transfers").insert({ id, clone_id: cloneId, source_kind: command.kind, source_id: command.sourceId, account_id: accountId,
        storage_path: source.data.storage_path, file_name: fileName, size_bytes: bytes.length,
        source_sha256: sourceHash, chunk_sha256: sharedChunkDigests(bytes), file_id: randomUUID(), connection_revision: vault.data.connectionRevision, actor: ctx.auth.actor }).select("*").maybeSingle();
      if (inserted.error && inserted.error.code !== "23505") return refuse("The shared upload could not be saved.", 503);
      existing = inserted.data ? inserted : await lookup(); row = existing.data as SharedTransfer | null;
      if (!row) return refuse("Refresh the saved upload before retrying.", 503);
    }
    if (row.clone_id !== cloneId || row.storage_path !== source.data.storage_path) return refuse("The source file changed. Review it before sharing.");
    // Agency actors must match the backend's freshly verified grant. Owner sessions may resume an owner receipt after signing in
    // again, never an agency member's: the backend binds the job to its actor, so relaying it would attribute the write to them.
    if (ctx.auth.auth.agencyGrant ? row.actor !== ctx.auth.actor : !isOperatorActor(row.actor)) return refuse("This upload was started by another team member. Ask them to finish it.");
    if (!active.has(row.status) && row.error_code !== "provider_cleanup_required") return answer({ ok: true, transfer: publicSharedTransfer(row) });
    const identity = (action: string) => ({ actor: row!.actor, commandKey: sharedDigest(`shared-media.v1:${row!.id}:${action}`) });
    const save = async (patch: Partial<SharedTransfer>) => {
      const result = await db.from("shared_media_transfers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row!.id).eq("clone_id", cloneId).select("*").maybeSingle();
      if (result.error || !result.data) throw Error("receipt_unconfirmed"); row = result.data as SharedTransfer;
    };
    const uploads = await backend.uploads(accountId); if (!uploads.ok || !uploads.data.enabled) return refuse("OnlyFans upload status is unavailable.", 503);
    let job = uploads.data.jobs.find(job => job.jobId === row!.job_id);
    if (!job && row.job_id) return refuse("This upload is outside the recent history. Review it in OnlyFans before retrying.");
    if (!job) {
      const created = await backend.create(accountId, { files: [{ fileId: row.file_id, name: row.file_name, size: row.size_bytes }], expectedConnectionRevision: row.connection_revision, ...identity("create") });
      if (!created.ok) return refuse("Upload creation was not confirmed. Resume the same file to check it again.", created.status);
      job = created.upload;
    }
    await save(sharedUploadProgress(row, job));
    if (job.status === "receiving") {
      const offset = job.files[0].receivedBytes;
      if (offset < row!.size_bytes) {
        if (offset % MAX_CHUNK_BYTES !== 0) throw Error("upload_mismatch");
        const end = Math.min(offset + MAX_CHUNK_BYTES, row!.size_bytes) - 1;
        const url = await signedSource(db, row!.storage_path, cloneId);
        const response = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` }, cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(20000) });
        if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${offset}-${end}/${row!.size_bytes}`) { await response.body?.cancel(); throw Error("source_range_unavailable"); }
        const bytes = await boundedMediaBytes(response, MAX_CHUNK_BYTES), digest = sharedDigest(bytes);
        if (bytes.length !== end - offset + 1 || digest !== row!.chunk_sha256[offset / MAX_CHUNK_BYTES]) throw Error("source_changed");
        const chunk = await backend.chunk(accountId, job.jobId, row!.file_id, offset, digest, bytes, row!.actor);
        if (!chunk.ok) return refuse("Transfer progress was not confirmed. Resume the same saved file.", chunk.status);
        await save({ received_bytes: chunk.receivedBytes });
      } else {
        const finished = await backend.action(accountId, job.jobId, "finish", identity("finish"));
        if (!finished.ok) return refuse("The transfer outcome was not confirmed. Resume to check this same upload.", finished.status);
        await save(sharedUploadProgress(row!, finished.upload));
      }
    }
    return answer({ ok: true, transfer: publicSharedTransfer(row!) });
  } catch {
    return refuse("This saved file could not be transferred safely. Refresh its status before resuming.", 503);
  }
}
