import busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { MAX_CREATOR_REQUEST_BYTES, MAX_CREATOR_VIDEO_BYTES } from "./creator-upload-limits";

export class CreatorUploadError extends Error {
  constructor(public readonly status: string) { super(status); }
}
export type StagedCreatorFile = { name: string; type: string; size: number; path: string };
/** No complete video is held in RAM. Caller always disposes the private staging directory. */
export async function boundedFormData(request: Request, options: { maxBytes?: number; timeoutMs?: number } = {}) {
  const maxBytes = options.maxBytes ?? MAX_CREATOR_REQUEST_BYTES;
  if (!request.body) throw new CreatorUploadError("upload_empty");
  const directory = await mkdtemp(join(tmpdir(), "creator-upload-"));
  const dispose = () => rm(directory, { recursive: true, force: true });
  const controller = new AbortController();
  const files: StagedCreatorFile[] = [];
  const fields = new Map<string, string>();
  const writes: Promise<void>[] = [];
  let failure: Error | undefined;
  let total = 0;
  const fail = (error: Error) => { failure ??= error; controller.abort(); };
  const aborted = () => fail(new CreatorUploadError("upload_interrupted"));
  const timer = setTimeout(() => fail(new CreatorUploadError("upload_timeout")), options.timeoutMs ?? 20 * 60 * 1000);
  request.signal.addEventListener("abort", aborted, { once: true });
  try {
    if (request.signal.aborted) aborted();
    const parser = busboy({
      headers: { "content-type": request.headers.get("content-type") || "" },
      defParamCharset: "utf8",
      limits: { files: 25, fields: 4, parts: 29, fieldSize: 1024, fileSize: MAX_CREATOR_VIDEO_BYTES + 1 },
    });
    parser.on("field", (name, value, info) => {
      if (info.valueTruncated || info.nameTruncated || fields.has(name)) return fail(new CreatorUploadError("upload_error"));
      fields.set(name, value);
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "files") { stream.resume(); fail(new CreatorUploadError("upload_error")); return; }
      const file: StagedCreatorFile = { name: info.filename || "upload", type: info.mimeType, size: 0, path: join(directory, randomUUID()) };
      files.push(file);
      stream.on("limit", () => fail(new CreatorUploadError("upload_too_large")));
      const count = new Transform({ transform(chunk, _encoding, callback) {
        file.size += chunk.length;
        callback(null, chunk);
      } });
      // Attach rejection handlers immediately; await all streams before cleanup.
      writes.push(pipeline(stream, count, createWriteStream(file.path, { flags: "wx", mode: 0o600 }), { signal: controller.signal })
        .catch((error: Error) => { fail(error); }));
    });
    parser.on("filesLimit", () => fail(new CreatorUploadError("upload_too_many")));
    parser.on("fieldsLimit", () => fail(new CreatorUploadError("upload_error")));
    parser.on("partsLimit", () => fail(new CreatorUploadError("upload_too_many")));
    const bound = new Transform({ transform(chunk, _encoding, callback) {
      total += chunk.length;
      callback(total > maxBytes ? new CreatorUploadError("upload_too_large") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>), bound, parser, { signal: controller.signal });
    await Promise.all(writes);
    if (failure) throw failure;
    return { fields, files: files.filter(file => file.size > 0), dispose };
  } catch (error) {
    controller.abort();
    await Promise.all(writes);
    await dispose();
    throw failure instanceof CreatorUploadError ? failure : error instanceof CreatorUploadError ? error : new CreatorUploadError("upload_error");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", aborted);
  }
}
