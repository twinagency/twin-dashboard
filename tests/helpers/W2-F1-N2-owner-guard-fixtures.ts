// Fixtures for tests/rules/W2-F1-N2-owner-guard.test.tsx (from tests/helpers/W2c-delta-fixtures.ts on the sweep branch).
// Every value is generated per run (randomUUID); the cookie name is a neutral literal, so nothing session shaped is committed.
import { randomUUID } from "node:crypto";

export const sentinel = (tag = "SENTINEL") => `${tag}-${randomUUID()}`;
/** A Browserbase job id that passes browserbaseJobId (/^[A-Za-z0-9_-]{8,128}$/). */
export const jobId = () => `bbjob_${randomUUID().replace(/-/g, "")}`;
/** An allowed live-view URL (https *.browserbase.com). Never fetched. */
export const LIVE = "https://www.browserbase.com/devtools-fullscreen/inspector.html?synthetic=1";

/** A capture that passes connectionCapture(value, owner) (lib/onlyfans-connections/contract.ts). */
export const capture = (owner: number) => ({
  headers: { user_id: String(owner), user_agent: "Mozilla/5.0 (synthetic)", x_bc: sentinel("xbc"), x_of_rev: "synthetic-rev" },
  signing: { rules: { static_param: sentinel("sp"), start: "1", end: "2", checksum_indexes: Array.from({ length: 32 }, (_, i) => i % 40), checksum_constant: 7 } },
  cookies: [{ name: "c", value: sentinel("ck") }],
});
/** A backend `done` Browserbase job answer for `owner`. */
export const doneJob = (id: string, owner: number) =>
  ({ ok: true, jobId: id, state: "done", liveViewUrl: null, ownerId: owner, xHash: sentinel("xh"), capture: capture(owner) });
