import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";

type Stage = "authorizing" | "receiving" | "validating" | "storage" | "metadata" | "progress";
type Trace = { requestId: string; stage: Stage; started: number; changed: number; durations: Partial<Record<Stage, number>>; code?: string; tempFreeBytes?: number; httpStatus?: number };
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
  if (code && /^[A-Za-z0-9_]{1,40}$/.test(code)) trace.code = code;
}
export async function tracedCreatorUpload(run: () => Promise<Response>) {
  const now = performance.now();
  const trace: Trace = { requestId: randomUUID(), stage: "authorizing", started: now, changed: now, durations: {} };
  return traces.run(trace, async () => {
    try {
      const disk = await statfs(tmpdir()).catch(() => null);
      if (disk) trace.tempFreeBytes = disk.bavail * disk.bsize;
      const response = await run();
      trace.httpStatus = response.status;
      response.headers.set("X-Upload-Request-Id", trace.requestId);
      return response;
    } finally {
      uploadStage(trace.stage);
      const memory = process.memoryUsage();
      // No names, account IDs, media paths, keys, cookies or raw provider errors.
      console.info("creator_upload", JSON.stringify({ ...uploadDiagnostic(), httpStatus: trace.httpStatus, durationsMs: trace.durations, safeCode: trace.code, tempFreeBytes: trace.tempFreeBytes, rssBytes: memory.rss, externalBytes: memory.external }));
    }
  });
}
