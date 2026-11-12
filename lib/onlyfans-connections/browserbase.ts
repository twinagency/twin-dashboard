import { connectionCapture, connectionCaptureRef, object } from "./contract";
/** Browserbase-hosted OnlyFans login. Client-safe: no server imports. */
export const BROWSERBASE_STATES = ["starting", "waiting_login", "capturing", "done", "failed", "cancelled", "expired"] as const;
export type BrowserbaseState = typeof BROWSERBASE_STATES[number];
export const BROWSERBASE_TERMINAL: readonly BrowserbaseState[] = ["done", "failed", "cancelled", "expired"];
export type BrowserbaseJob = { jobId: string; state: BrowserbaseState; liveViewUrl: string | null; error: string | null;
  capture: Record<string, unknown> | null; xHash: string | null; ownerId: number | null };
export const browserbaseJobId = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : null;
export const browserbaseState = (value: unknown): BrowserbaseState | null =>
  (BROWSERBASE_STATES as readonly unknown[]).includes(value) ? value as BrowserbaseState : null;
/** Only https Browserbase hosts on the default port may be embedded or linked. */
export function browserbaseLiveViewUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      (host === "www.browserbase.com" || host.endsWith(".browserbase.com")) ? value : null;
  } catch { return null; }
}
/** Parses a backend job answer; a `done` job must carry a capture that validates against its owner. */
export function parseBrowserbaseJob(value: unknown, expectedJobId?: string): BrowserbaseJob | null {
  if (!object(value) || value.ok !== true) return null;
  const jobId = browserbaseJobId(value.jobId), state = browserbaseState(value.state);
  if (!jobId || !state || (expectedJobId !== undefined && jobId !== expectedJobId)) return null;
  const liveViewUrl = value.liveViewUrl == null ? null : browserbaseLiveViewUrl(value.liveViewUrl);
  if (value.liveViewUrl != null && !liveViewUrl) return null;
  const cause = typeof value.error === "string" ? value.error.replace(/[^\x20-\x7e]/g, " ").slice(0, 300) : "";
  const error = cause.trim() ? cause : null; // shown as the failure cause; never rejects the job
  if (state !== "done") return { jobId, state, liveViewUrl, error, capture: null, xHash: null, ownerId: null };
  const ownerId = Number.isSafeInteger(value.ownerId) && (value.ownerId as number) > 0 ? value.ownerId as number : null;
  if (!ownerId || typeof value.xHash !== "string" || !/^[\x20-\x7e]{1,4096}$/.test(value.xHash) || !connectionCapture(value.capture, ownerId)) return null;
  return { jobId, state, liveViewUrl, error, capture: value.capture, xHash: value.xHash, ownerId };
}
/** The dashboard route's answer (client only): a done job is usable only by its server-side handle `captureId`; any capture in it is ignored. */
export type HeldBrowserbaseJob = Pick<BrowserbaseJob, "jobId" | "liveViewUrl" | "error"> &
  ({ state: Exclude<BrowserbaseState, "done">; ownerId: null; captureId: null } | { state: "done"; ownerId: number; captureId: string });
export function parseHeldBrowserbaseJob(value: unknown, expectedJobId?: string): HeldBrowserbaseJob | null {
  const done = object(value) && value.state === "done";
  // ok, jobId, state, live view and error are checked by parseBrowserbaseJob; a done job is read there as "capturing" so it needs no raw capture.
  const job = parseBrowserbaseJob(done ? { ...value, state: "capturing" } : value, expectedJobId);
  if (!job || job.state === "done") return null;
  const head = { jobId: job.jobId, liveViewUrl: job.liveViewUrl, error: job.error }, ownerId = done ? value.ownerId : null, captureId = done ? value.captureId : null;
  if (!done) return { ...head, state: job.state, ownerId: null, captureId: null };
  return Number.isSafeInteger(ownerId) && (ownerId as number) > 0 && connectionCaptureRef(captureId) ? { ...head, state: "done", ownerId: ownerId as number, captureId } : null;
}
