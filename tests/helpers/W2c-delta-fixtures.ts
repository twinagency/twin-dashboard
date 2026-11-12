// Shared fixtures for the W2c-delta known-red tests (tests/known-red/W2c-delta-*.test.ts[x]).
// Every cookie value, x_bc, static_param, X-Hash and error sentinel is generated per run (randomUUID); the cookie name is a neutral
// literal, so nothing cookie, token or session shaped is committed (REVIEW.md inv 6).
import { randomUUID } from "node:crypto";

export const sentinel = (tag = "SENTINEL") => `${tag}-${randomUUID()}`;
/** A Browserbase job id that passes browserbaseJobId (/^[A-Za-z0-9_-]{8,128}$/). */
export const jobId = () => `bbjob_${randomUUID().replace(/-/g, "")}`;
/** An allowed live-view URL (browserbaseLiveViewUrl accepts https *.browserbase.com, default port). Never fetched. */
export const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html?synthetic=1";

/** A capture that passes connectionCapture(value, owner) (lib/onlyfans-connections/contract.ts). `cookie`/`xbc` let a test hold its sentinels. */
export function capture(owner: number, values: { cookie?: string; xbc?: string } = {}) {
  return {
    headers: { user_id: String(owner), user_agent: "Mozilla/5.0 (synthetic)", x_bc: values.xbc ?? sentinel("xbc"), x_of_rev: "synthetic-rev" },
    signing: { rules: { static_param: sentinel("sp"), start: "1", end: "2", checksum_indexes: Array.from({ length: 32 }, (_, i) => i % 40), checksum_constant: 7 } },
    cookies: [{ name: "c", value: values.cookie ?? sentinel("ck") }],
  };
}
/** A backend `done` job answer for `owner`, whose capture is valid for `captureOwner` (defaults to owner). */
export function doneJob(id: string, owner: number, opts: { captureOwner?: number; cookie?: string; xbc?: string; xHash?: string; liveViewUrl?: string | null } = {}) {
  return { ok: true, jobId: id, state: "done", liveViewUrl: opts.liveViewUrl ?? null, ownerId: owner, xHash: opts.xHash ?? sentinel("xh"),
    capture: capture(opts.captureOwner ?? owner, { cookie: opts.cookie, xbc: opts.xbc }) };
}
