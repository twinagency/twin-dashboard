import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";

type Stage = "authorizing" | "receiving" | "staging" | "validating" | "storage" | "metadata" | "progress";
type Trace = { requestId: string; stage: Stage; started: number; changed: number; durations: Partial<Record<Stage, number>>; code?: string; tempFreeBytes?: number; httpStatus?: number; peakRssBytes: number; clientUploadId?: string };
const traces = new AsyncLocalStorage<Trace>();
export function uploadDiagnostic() {
  const trace = traces.getStore();
  return trace ? { requestId: trace.requestId, stage: trace.stage, elapsedMs: Math.round(performance.now() - trace.started) } : {};
}
export function uploadStage(stage: Stage, code?: string) {
  const trace = traces.getStore(); if (!trace) return;
  const now = performance.now();
  trace.durations[trace.stage] = (trace.durations[trace.stage] || 0) + Math.round(now - trace.changed);
  trace.changed = now; trace.stage = stage;
  trace.peakRssBytes = Math.max(trace.peakRssBytes, process.memoryUsage().rss);
  console.info("creator_upload_stage", JSON.stringify({ requestId: trace.requestId, clientUploadId: trace.clientUploadId, stage, elapsedMs: Math.round(now - trace.started), rssBytes: process.memoryUsage().rss }));
  if (code && /^[A-Za-z0-9_]{1,40}$/.test(code)) trace.code = code;
}
export async function tracedCreatorUpload(run: () => Promise<Response>, clientUploadId?: string | null) {
  const now = performance.now();
  const trace: Trace = { requestId: randomUUID(), stage: "authorizing", started: now, changed: now, durations: {}, peakRssBytes: process.memoryUsage().rss, ...(clientUploadId && /^[a-f0-9-]{36}$/i.test(clientUploadId) ? { clientUploadId } : {}) };
  return traces.run(trace, async () => {
    const sample = setInterval(() => { trace.peakRssBytes = Math.max(trace.peakRssBytes, process.memoryUsage().rss); }, 250);
    sample.unref();
    uploadStage("authorizing");
    try {
      const disk = await statfs(tmpdir()).catch(() => null);
      if (disk) trace.tempFreeBytes = disk.bavail * disk.bsize;
      const response = await run();
      trace.httpStatus = response.status;
      response.headers.set("X-Upload-Request-Id", trace.requestId);
      return response;
    } finally {
      clearInterval(sample);
      uploadStage(trace.stage);
      const memory = process.memoryUsage();
      // No names, account IDs, media paths, keys, cookies or raw provider errors.
      console.info("creator_upload", JSON.stringify({ ...uploadDiagnostic(), clientUploadId: trace.clientUploadId, peakRssBytes: trace.peakRssBytes, httpStatus: trace.httpStatus, durationsMs: trace.durations, safeCode: trace.code, tempFreeBytes: trace.tempFreeBytes, rssBytes: memory.rss, externalBytes: memory.external }));
    }
  });
}
