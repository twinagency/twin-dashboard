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
import { SHARED_MEDIA_LIMIT, boundedMediaBytes, sharedChunkDigests, sharedDigest, sharedFileName, sharedSourceKind, sharedStoragePath, sharedUploadProgress, publicSharedTransfer, LIVE_SHARED_FILTER, SHARED_CLEANUP_HOLD, SHARED_ACTIVE, sharedHeld, type SharedTransfer } from "@/lib/shared-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ accountId: string }> };
const answer = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const refuse = (error: string, status = 409) => answer({ ok: false, error }, status);
const active = new Set(SHARED_ACTIVE);

async function access(request: NextRequest, context: Context, write = false) {
  const auth = await requireOnlyFansRead({ agency: true, write }); if (auth instanceof NextResponse) return auth;
  const accountId = requestId((await context.params).accountId), raw = request.nextUrl.searchParams.get("creator");
  if (!accountId || !creatorUuid(raw) || request.nextUrl.searchParams.size !== 1) return refuse("Choose a creator and connected account.", 400);
  // Grants, DB rows and storage paths hold lower-case ids; normalize once so letter case never decides access.
  const cloneId = raw.toLowerCase();
  // A creator outside the agency grant is refused before the backend is consulted at all.
  if (auth.auth.agencyGrant && !auth.auth.agencyGrant.creatorIds.includes(cloneId)) return refuse("Creator access denied.", 403);
  // Bind both channels before consulting private source rows or receipts.
  const accounts = await auth.backend?.listAccounts({ creatorId: cloneId });
  if (!accounts?.ok) return refuse("Connected accounts could not be verified.", 503);
  const account = accounts.data.find(a => a.accountId === accountId && a.binding.creatorId.toLowerCase() === cloneId);
  if (!account) return refuse("Creator access denied.", 403);
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
    if (job) { try { return publicSharedTransfer({ ...row, ...sharedUploadProgress(row, job) }, row); } catch { return publicSharedTransfer({ ...row, error_code: "upload_mismatch" }, row); } }
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
  // `action: "refresh"` only observes a held receipt's provider job (G04c1); it never starts, resumes or retries an upload.
  const keys = Object.keys(command).sort().join(","), refresh = keys === "action,kind,sourceId" && command.action === "refresh";
  if (!refresh && keys !== "kind,sourceId" || !sharedSourceKind(command.kind) || !creatorUuid(command.sourceId)) return refuse("Choose one saved photo or video.", 400);
  if (ctx.account.health !== "connected" || ctx.account.capabilities.manageContent !== "available") return refuse("Reconnect this account before sharing media.");
  const { db, cloneId, accountId, backend } = ctx;
  try {
    const source = await db.from(command.kind === "photo" ? "photos" : "videos").select("id,clone_id,storage_path").eq("id", command.sourceId).eq("clone_id", cloneId).maybeSingle();
    if (source.error || !source.data) return refuse("That saved media is unavailable.", 404);
    // Only the live receipt (at most one, by the partial unique index). A receipt whose row proves the provider never received
    // the file is history and a new one starts; every other terminal receipt is live and held (lib/shared-media.ts).
    const lookup = () => db.from("shared_media_transfers").select("*").eq("account_id", accountId).eq("source_kind", command.kind).eq("source_id", command.sourceId).or(LIVE_SHARED_FILTER).maybeSingle();
    let existing = await lookup(); if (existing.error) return refuse("Shared upload history is unavailable.", 503);
    let row = existing.data as SharedTransfer | null;
    if (!row && refresh) return refuse("There is no held upload to check for this file.");
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
    const identity = (action: string) => ({ actor: row!.actor, commandKey: sharedDigest(`shared-media.v1:${row!.id}:${action}`) });
    const save = async (patch: Partial<SharedTransfer>) => {
      const result = await db.from("shared_media_transfers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row!.id).eq("clone_id", cloneId).select("*").maybeSingle();
      if (result.error || !result.data) throw Error("receipt_unconfirmed"); row = result.data as SharedTransfer;
    };
    // Observe a terminal receipt's provider job: one uploads read, zero upstream writes, no source read. Used by an operator's
    // refresh (either hold) and by a cleanup hold's continuation. The projection is stored only if it is adopted or still held;
    // anything that would leave the hold (a retryable pair, which a backend claim race can write transiently, or an active status)
    // is refused with the row unchanged: a hold is better than a duplicate upload. A job missing upstream may have aged out of
    // history, which proves nothing: the receipt stays held.
    const observe = async (held: SharedTransfer) => {
      if (active.has(held.status)) return refuse("This upload is still in progress. Resume it to check its status.");
      if (!held.job_id) return refuse("This upload has no OnlyFans job to check. Review it in OnlyFans before retrying.");
      const uploads = await backend.uploads(accountId); if (!uploads.ok || !uploads.data.enabled) return refuse("OnlyFans upload status is unavailable.", 503);
      const job = uploads.data.jobs.find(job => job.jobId === held.job_id);
      if (!job) return refuse("This upload is outside the recent history. Review it in OnlyFans before retrying.");
      const next = sharedUploadProgress(held, job);
      if (!(next.status === "complete" && next.media_id) && !sharedHeld(next)) return refuse("OnlyFans has not settled this upload. It stays held for review. Check again later.", 503);
      // Saved only while the stored row is still the one read (CF2): a stale read never downgrades a newer save, such as a
      // concurrent refresh or cleanup continuation that adopted it. Lost race: answer the stored row, `held` from it.
      let cas = db.from("shared_media_transfers").update({ ...next, updated_at: new Date().toISOString() }).eq("id", held.id).eq("clone_id", cloneId).eq("status", held.status);
      cas = held.error_code == null ? cas.is("error_code", null) : cas.eq("error_code", held.error_code);
      cas = held.media_id == null ? cas.is("media_id", null) : cas.eq("media_id", held.media_id);
      const saved = await cas.select("*").maybeSingle(); if (saved.error) throw Error("receipt_unconfirmed");
      const stored = saved.data ? saved : await db.from("shared_media_transfers").select("*").eq("id", held.id).eq("clone_id", cloneId).maybeSingle();
      if (stored.error || !stored.data) throw Error("receipt_unconfirmed");
      return answer({ ok: true, transfer: publicSharedTransfer(stored.data as SharedTransfer) });
    };
    if (refresh || row.error_code === SHARED_CLEANUP_HOLD) return await observe(row);
    // Any other live terminal receipt (complete, or held for review because the file may already be in the vault) is answered
    // from the row: no backend call, no upload.
    if (!active.has(row.status)) return answer({ ok: true, transfer: publicSharedTransfer(row) });
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
